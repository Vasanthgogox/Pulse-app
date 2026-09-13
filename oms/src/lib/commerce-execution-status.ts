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
  completed:          'Trip completed',
  delivered:          'Trip completed',
  done:               'Trip completed',
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

/** Every sales order on the plan has its own drop SES completed. Never inferred from trips.status. */
export function isFulfillmentDelivered(exec: CommerceExecution): boolean {
  return exec.orders.length > 0 && exec.orders.every(o => isOrderDelivered(o.deliveryStatus));
}

/** The single primary status shown for an execution — the most specific real state known. */
export function primaryStatusLabel(exec: CommerceExecution): string {
  if (isFulfillmentDelivered(exec)) return 'Delivered';
  if (exec.trip) {
    if (isTripDelivered(exec.trip.status) && exec.orders.length === 0) {
      return 'Trip completed · No orders';
    }
    if (isTripDelivered(exec.trip.status)) {
      return `Trip completed · ${orderProgressLabel(exec) ?? 'Awaiting Delivery'}`;
    }
    return tripStatusLabel(exec.trip.status);
  }
  if (exec.indent) return `${indentStatusLabel(exec.indent.status)} · Awaiting Trip`;
  return 'Preparing Indent';
}

/** Ordered lifecycle stages with completion state, driven only by real persisted data. */
/** Core trip.status for the Transportation row — never the award/bid label. */
export function commerceTripStatusLabel(exec: CommerceExecution): string {
  if (!exec.trip) return 'No trip';
  return tripStatusLabel(exec.trip.status);
}

/** Ordered lifecycle stages with completion state, driven only by real persisted data. */
export function lifecycleStages(exec: CommerceExecution): { stage: CommerceLifecycleStage; label: string; done: boolean; current: boolean }[] {
  const hasIndent = exec.indent != null;
  const hasTrip = exec.trip != null && !isTripCancelled(exec.trip.status);
  const fulfillmentDelivered = isFulfillmentDelivered(exec);
  const tripDone = hasTrip && isTripDelivered(exec.trip!.status);
  const inTransit = hasTrip && !tripDone && isTripInTransit(exec.trip!.status);

  const stages: { stage: CommerceLifecycleStage; label: string; done: boolean }[] = [
    { stage: 'orders',         label: 'Orders',            done: exec.orders.length > 0 },
    { stage: 'planned',        label: 'Execution Planned', done: true },
    { stage: 'indent_created', label: 'Indent Created',    done: hasIndent },
    { stage: 'awaiting_trip',  label: hasTrip ? 'Trip Assigned' : 'Awaiting Trip', done: hasTrip },
    { stage: 'in_transit',     label: 'In Transit',        done: inTransit || tripDone || fulfillmentDelivered },
    { stage: 'delivered',      label: 'Delivered',         done: fulfillmentDelivered },
  ];

  let currentStage: CommerceLifecycleStage;
  if (fulfillmentDelivered) currentStage = 'delivered';
  else if (tripDone) currentStage = 'delivered';
  else if (inTransit) currentStage = 'in_transit';
  else if (hasTrip || hasIndent) currentStage = 'awaiting_trip';
  else if (exec.orders.length > 0) currentStage = 'indent_created';
  else currentStage = 'orders';

  return stages.map(s => ({ ...s, current: s.stage === currentStage }));
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

/** Display lifecycle for the Plans table — Core indent/trip/order SES, not frozen plan.status. */
export type PlanLifecycleKind =
  | 'draft'
  | 'published'
  | 'indent_posted'
  | 'trip_assigned'
  | 'in_transit'
  | 'trip_completed'
  | 'delivered'
  | 'cancelled';

export function planLifecycleKind(
  planStatus: string,
  exec: CommerceExecution | null | undefined,
): PlanLifecycleKind {
  if (planStatus === 'cancelled' || (exec?.trip && isTripCancelled(exec.trip.status))) return 'cancelled';
  if (exec) {
    if (isFulfillmentDelivered(exec)) return 'delivered';
    if (exec.trip && isTripDelivered(exec.trip.status)) return 'trip_completed';
    if (exec.trip && isTripInTransit(exec.trip.status)) return 'in_transit';
    if (exec.trip) return 'trip_assigned';
    if (exec.indent) return 'indent_posted';
    return 'published';
  }
  if (planStatus === 'fulfilled') return 'delivered';
  if (planStatus === 'published') return 'published';
  if (planStatus === 'draft' || planStatus === 'optimizing' || planStatus === 'ready') return 'draft';
  return 'published';
}

export function planLifecycleLabel(kind: PlanLifecycleKind): string {
  switch (kind) {
    case 'draft':           return 'Draft';
    case 'published':       return 'Published';
    case 'indent_posted':   return 'Indent posted';
    case 'trip_assigned':   return 'Trip assigned';
    case 'in_transit':      return 'In transit';
    case 'trip_completed':  return 'Trip completed';
    case 'delivered':       return 'Delivered';
    case 'cancelled':       return 'Cancelled';
  }
}

export function findCommerceExecutionForPlan(
  executions: readonly CommerceExecution[],
  plan: { id: string; plan_number: string },
): CommerceExecution | undefined {
  return executions.find(e => e.executionPlanId === plan.id)
    ?? executions.find(e => e.planNumber === plan.plan_number);
}

export function orderStatusGlyph(order: CommerceExecutionOrder): '✓' | '→' | '○' {
  if (isOrderDelivered(order.deliveryStatus)) return '✓';
  if (isOrderArrived(order.deliveryStatus)) return '→';
  return '○';
}
