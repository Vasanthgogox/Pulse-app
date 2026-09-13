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
  | 'indent'
  | 'receiving_bids'
  | 'assigned'
  | 'in_transit'
  | 'delivered';

export type CoreFulfillmentPhase =
  | 'preparing'
  | 'indent_created'
  | 'receiving_bids'
  | 'assigned'
  | 'in_transit'
  | 'delivered';

const RECEIVING_BIDS_INDENT_STATUSES = new Set(['broadcast', 'open', 'pending', 'quoted']);
const AWARDED_INDENT_STATUSES = new Set(['awarded']);

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

/**
 * Authoritative Commerce phase from Core indent → trip → drop SES.
 * Quote count is never a phase transition.
 */
export function coreFulfillmentPhase(exec: CommerceExecution): CoreFulfillmentPhase {
  if (isFulfillmentDelivered(exec)) return 'delivered';

  const trip = exec.trip && !isTripCancelled(exec.trip.status) ? exec.trip : null;
  if (trip && isTripInTransit(trip.status)) return 'in_transit';
  if (trip && isTripDelivered(trip.status)) return 'in_transit';
  if (trip) return 'assigned';

  const indentStatus = exec.indent?.status ?? null;
  if (indentStatus && AWARDED_INDENT_STATUSES.has(indentStatus)) return 'assigned';
  if (indentStatus && RECEIVING_BIDS_INDENT_STATUSES.has(indentStatus)) return 'receiving_bids';
  if (exec.indent) return 'indent_created';
  return 'preparing';
}

export function primaryStatusLabel(exec: CommerceExecution): string {
  const phase = coreFulfillmentPhase(exec);
  if (phase === 'delivered') return 'Delivered';
  if (phase === 'in_transit' && exec.trip && isTripDelivered(exec.trip.status)) {
    if (exec.orders.length === 0) return 'Trip completed · No orders';
    return `Trip completed · ${orderProgressLabel(exec) ?? 'Awaiting Delivery'}`;
  }
  if (phase === 'in_transit') return exec.trip ? tripStatusLabel(exec.trip.status) : 'In Transit';
  if (phase === 'assigned') return 'Assigned';
  if (phase === 'receiving_bids') return 'Receiving Bids';
  if (phase === 'indent_created') return 'Indent Created';
  return 'Preparing Indent';
}

/** Supplementary quote line — never used as the primary lifecycle state. */
export function bidObservabilityLabel(exec: CommerceExecution): string {
  if (exec.bidCount <= 0) return 'Awaiting bids';
  return exec.bidCount === 1 ? '1 bid received' : `${exec.bidCount} bids received`;
}

/** Ordered lifecycle stages with completion state, driven only by real persisted data. */
/** Core trip.status for the Transportation row — never the award/bid label. */
export function commerceTripStatusLabel(exec: CommerceExecution): string {
  if (!exec.trip) return 'No trip';
  return tripStatusLabel(exec.trip.status);
}

/** Ordered lifecycle stages with completion state, driven only by real persisted data. */
export function lifecycleStages(exec: CommerceExecution): { stage: CommerceLifecycleStage; label: string; done: boolean; current: boolean }[] {
  const phase = coreFulfillmentPhase(exec);
  const phaseRank: Record<CoreFulfillmentPhase, number> = {
    preparing: 0,
    indent_created: 1,
    receiving_bids: 2,
    assigned: 3,
    in_transit: 4,
    delivered: 5,
  };
  const rank = phaseRank[phase];

  const stages: { stage: CommerceLifecycleStage; label: string; done: boolean }[] = [
    { stage: 'orders',          label: 'Orders',          done: exec.orders.length > 0 },
    { stage: 'planned',         label: 'Planned',         done: true },
    { stage: 'indent',          label: 'Indent Created',  done: rank >= 1 },
    { stage: 'receiving_bids',  label: 'Receiving Bids',  done: rank >= 2 },
    { stage: 'assigned',        label: 'Assigned',        done: rank >= 3 },
    { stage: 'in_transit',      label: 'In Transit',      done: rank >= 4 },
    { stage: 'delivered',       label: 'Delivered',       done: rank >= 5 },
  ];

  const currentByPhase: Record<CoreFulfillmentPhase, CommerceLifecycleStage> = {
    preparing: 'indent',
    indent_created: 'indent',
    receiving_bids: 'receiving_bids',
    assigned: 'assigned',
    in_transit: 'in_transit',
    delivered: 'delivered',
  };

  return stages.map(s => ({ ...s, current: s.stage === currentByPhase[phase] }));
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

/** Per-order fulfillment label. Never uses trips.status. */
export function fulfillmentOrderStatusLabel(
  exec: CommerceExecution,
  order: CommerceExecutionOrder,
): string {
  if (isOrderDelivered(order.deliveryStatus)) return 'Delivered';
  if (!exec.trip) return 'Awaiting Trip';
  if (isOrderArrived(order.deliveryStatus)) return 'Arrived';
  return 'On Trip';
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
  if (exec.trip || exec.indent?.assignedSupplierRate) return 'awarded';
  return 'awaiting_bid';
}

export function transportCostStatusLabel(exec: CommerceExecution): string {
  if (exec.trip || exec.indent?.assignedSupplierRate) return 'Awarded';
  return 'Awaiting bids';
}

export function transportCostDisplay(exec: CommerceExecution): number | null {
  if (exec.trip && exec.trip.supplierRate > 0) return exec.trip.supplierRate;
  if (exec.indent?.assignedSupplierRate) return exec.indent.assignedSupplierRate;
  return null;
}

export function circulationLabel(target: string | null | undefined): string {
  if (target === 'marketplace') return 'Marketplace';
  if (target === 'integrated_supplier') return 'Integrated supplier';
  if (target === 'both') return 'Marketplace + supplier';
  return 'Shared';
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
