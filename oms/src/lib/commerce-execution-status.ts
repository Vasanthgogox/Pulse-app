/**
 * Presentation-only mapping from real Core status enums to business-facing
 * Commerce labels. Never writes back to indents/trips/stop_execution_state —
 * purely a display layer over the raw values returned by
 * execution-visibility.service.ts.
 *
 * Source enums (confirmed live against production):
 *   indents.status: draft, broadcast, open, pending, quoted, awarded,
 *                    completed, expired, cancelled, closed
 *   trips.status:   draft, pending_acceptance, assigned, in_progress,
 *                    picked_up, in_transit, transit, at_pickup, loading,
 *                    at_drop, unloading, completed, cancelled, delivered,
 *                    done, active
 *   stop_execution_state.status: pending, arrived, completed, skipped, failed
 *     (only 'pending'→'arrived'→'completed' currently have a real writer —
 *     the concurrent Driver stop-execution work; 'skipped'/'failed' are
 *     schema-supported but unwritten today. Surface them honestly if they
 *     ever appear rather than hiding or reinterpreting them.)
 *
 * Order-level delivery is read from the order's own DROP stop's
 * stop_execution_state row — never inferred from a shared pickup stop, and
 * never inferred from trips.status (a trip can complete with stops still
 * pending; confirmed by direct audit of the trip-completion code path).
 */
import type { CommerceExecution, CommerceExecutionOrder } from './services/execution-visibility.service';

export type CommerceLifecycleStage =
  | 'orders'
  | 'planned'
  | 'indent_created'
  | 'awaiting_trip'
  | 'in_transit'
  | 'delivered';

const INDENT_STATUS_LABELS: Record<string, string> = {
  draft:     'Preparing',
  broadcast: 'Posted',
  open:      'Posted',
  pending:   'Pending',
  quoted:    'Quoted',
  awarded:   'Awarded',
  completed: 'Completed',
  expired:   'Expired',
  cancelled: 'Cancelled',
  closed:    'Closed',
};

const TRIP_DELIVERED_STATUSES = new Set(['completed', 'delivered', 'done']);
const TRIP_CANCELLED_STATUSES = new Set(['cancelled']);
const TRIP_IN_TRANSIT_STATUSES = new Set([
  'in_progress', 'picked_up', 'in_transit', 'transit',
  'at_pickup', 'loading', 'at_drop', 'unloading', 'active',
]);

const TRIP_STATUS_LABELS: Record<string, string> = {
  draft:              'Trip Draft',
  pending_acceptance: 'Awaiting Acceptance',
  assigned:           'Trip Assigned',
  in_progress:        'In Transit',
  picked_up:          'In Transit',
  in_transit:         'In Transit',
  transit:            'In Transit',
  at_pickup:          'At Pickup',
  loading:            'At Pickup',
  at_drop:            'At Drop',
  unloading:          'At Drop',
  completed:          'Delivered',
  delivered:          'Delivered',
  done:               'Delivered',
  cancelled:          'Cancelled',
  active:             'In Transit',
};

export function indentStatusLabel(status: string): string {
  return INDENT_STATUS_LABELS[status] ?? status;
}

export function tripStatusLabel(status: string): string {
  return TRIP_STATUS_LABELS[status] ?? status;
}

export function isTripDelivered(status: string): boolean {
  return TRIP_DELIVERED_STATUSES.has(status);
}

export function isTripCancelled(status: string): boolean {
  return TRIP_CANCELLED_STATUSES.has(status);
}

export function isTripInTransit(status: string): boolean {
  return TRIP_IN_TRANSIT_STATUSES.has(status);
}

/** The single primary status shown for an execution — the most specific real state known. */
export function primaryStatusLabel(exec: CommerceExecution): string {
  if (exec.trip) return tripStatusLabel(exec.trip.status);
  if (exec.indent) return `${indentStatusLabel(exec.indent.status)} · Awaiting Trip`;
  return 'Preparing Indent';
}

/** Ordered lifecycle stages with completion state, driven only by real persisted data. */
export function lifecycleStages(exec: CommerceExecution): { stage: CommerceLifecycleStage; label: string; done: boolean; current: boolean }[] {
  const hasIndent = exec.indent != null;
  const hasTrip = exec.trip != null;
  const delivered = hasTrip && isTripDelivered(exec.trip!.status);
  const inTransit = hasTrip && !delivered && isTripInTransit(exec.trip!.status);

  const stages: { stage: CommerceLifecycleStage; label: string; done: boolean }[] = [
    { stage: 'orders',         label: 'Orders',           done: true },
    { stage: 'planned',        label: 'Execution Planned', done: true },
    { stage: 'indent_created', label: 'Indent Created',   done: hasIndent },
    { stage: 'awaiting_trip',  label: 'Trip Assigned',    done: hasTrip },
    { stage: 'in_transit',     label: 'In Transit',       done: inTransit || delivered },
    { stage: 'delivered',      label: 'Delivered',        done: delivered },
  ];

  const currentIdx = stages.findIndex(s => !s.done);
  return stages.map((s, i) => ({ ...s, current: i === (currentIdx === -1 ? stages.length - 1 : currentIdx) }));
}

const ORDER_DELIVERY_STATUS_LABELS: Record<string, string> = {
  pending:   'Awaiting Delivery',
  arrived:   'Arrived',
  completed: 'Delivered',
  skipped:   'Skipped',
  failed:    'Failed',
};

/** `deliveryStatus` is null when no trip/stop-execution row exists yet for this order's drop stop. */
export function orderDeliveryStatusLabel(deliveryStatus: string | null): string {
  if (deliveryStatus == null) return 'Awaiting Delivery';
  return ORDER_DELIVERY_STATUS_LABELS[deliveryStatus] ?? deliveryStatus;
}

export function isOrderDelivered(deliveryStatus: string | null): boolean {
  return deliveryStatus === 'completed';
}

export function isOrderArrived(deliveryStatus: string | null): boolean {
  return deliveryStatus === 'arrived';
}

/** Count of orders whose OWN drop stop has reached 'completed' — never derived from trip status. */
export function deliveredOrderCount(exec: CommerceExecution): number {
  return exec.orders.filter(o => isOrderDelivered(o.deliveryStatus)).length;
}

export function orderProgressLabel(exec: CommerceExecution): string | null {
  if (!exec.orders.length) return null;
  return `${deliveredOrderCount(exec)} / ${exec.orders.length} Delivered`;
}

/** Transport cost is only authoritative once a real trip exists. */
export type TransportCostStatus = 'awarded' | 'awaiting_bid';

export function transportCostStatus(exec: CommerceExecution): TransportCostStatus {
  return exec.trip ? 'awarded' : 'awaiting_bid';
}

export function transportCostStatusLabel(exec: CommerceExecution): string {
  return exec.trip ? 'Awarded' : 'Awaiting Bid';
}

export function orderStatusGlyph(order: CommerceExecutionOrder): '✓' | '→' | '○' {
  if (isOrderDelivered(order.deliveryStatus)) return '✓';
  if (isOrderArrived(order.deliveryStatus)) return '→';
  return '○';
}
