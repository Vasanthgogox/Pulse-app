/**
 * Presentation-only adapter: CommerceExecution → Core Trips hub language.
 *
 * Does not invent trips, indent statuses, or a second lifecycle.
 * Allocation boundary matches Core: INDENT iff there is no live trip
 * (`trips.indent_id` / source_indent_id already resolved by fetchCommerceExecutions).
 *
 * Indent WAITING / RECEIVING / AWARDED mirrors
 * features/trips/utils/indentHubCardPresentation.ts (Give Load bid-count rule).
 * Trip buckets mirror features/trips/utils/tripHubMetrics.ts + getStageLabelForTrip.
 */
import {
  isFulfillmentDelivered,
  isTripCancelled,
} from '@/lib/commerce-execution-status';
import type { CommerceExecution, CommerceExecutionOrder } from '@/lib/services/execution-visibility.service';

export type CommerceOpsStageId =
  | 'indent'
  | 'unassigned'
  | 'assigned'
  | 'loading'
  | 'in_transit'
  | 'unloading'
  | 'delivered';

export type CommerceOpsRailId = 'all' | CommerceOpsStageId;

export const COMMERCE_OPS_RAIL_ORDER: CommerceOpsRailId[] = [
  'all',
  'indent',
  'unassigned',
  'assigned',
  'loading',
  'in_transit',
  'unloading',
  'delivered',
];

export const COMMERCE_OPS_RAIL_LABEL: Record<CommerceOpsRailId, string> = {
  all: 'ALL',
  indent: 'INDENT',
  unassigned: 'UNASSIGNED',
  assigned: 'ASSIGNED',
  loading: 'LOADING',
  in_transit: 'IN TRANSIT',
  unloading: 'UNLOADING',
  delivered: 'DELIVERED',
};

export type CommerceOpsSourceTag = 'NETWORK' | 'MARKETPLACE';

export type CommerceOpsIndentStatus =
  | 'WAITING FOR BID'
  | 'RECEIVING BIDS'
  | 'AWARDED';

/** Same rule as indentHubSourceTags — do not invent OFFLINE. */
export function commerceOpsSourceTags(
  circulationTarget: string | null | undefined,
): CommerceOpsSourceTag[] {
  if (circulationTarget == null || !String(circulationTarget).trim()) {
    return ['NETWORK'];
  }
  const target = String(circulationTarget).trim().toLowerCase();
  if (target === 'both') return ['NETWORK', 'MARKETPLACE'];
  if (target === 'marketplace') return ['MARKETPLACE'];
  if (target === 'integrated_supplier') return ['NETWORK'];
  return [];
}

/** Same rule as giveLoadBidReceivedDisplayStatus + indentHubLifecycleStatus. */
export function commerceOpsIndentStatus(
  indentStatus: string | null | undefined,
  bidCount: number,
): CommerceOpsIndentStatus {
  const status = String(indentStatus ?? '').toLowerCase();
  const terminal = status === 'awarded' || status === 'completed' || status === 'expired'
    || status === 'cancelled' || status === 'closed';
  if (status === 'draft') return 'WAITING FOR BID';
  if (!terminal && bidCount > 0) return 'RECEIVING BIDS';
  if (status === 'quoted') return 'RECEIVING BIDS';
  if (status === 'awarded') return 'AWARDED';
  return 'WAITING FOR BID';
}

function liveTrip(exec: CommerceExecution) {
  if (!exec.trip || isTripCancelled(exec.trip.status)) return null;
  return exec.trip;
}

function hasAssignedDriver(exec: CommerceExecution): boolean {
  const trip = liveTrip(exec);
  if (!trip) return false;
  if (trip.driverId != null && String(trip.driverId).trim() !== '') return true;
  return false;
}

function normStatus(s: string | null | undefined): string {
  return (s ?? '').trim().toLowerCase();
}

/**
 * One execution → one rail bucket. Never both INDENT and a trip stage.
 */
export function classifyCommerceOpsStage(exec: CommerceExecution): CommerceOpsStageId {
  const trip = liveTrip(exec);
  if (!trip) return 'indent';

  if (isFulfillmentDelivered(exec)) return 'delivered';

  const s = normStatus(trip.status);
  if (!hasAssignedDriver(exec) || s === 'cancelled') return 'unassigned';

  if (s === 'at_drop' || s === 'unloading' || s === 'arrived' || s === 'at_destination') {
    return 'unloading';
  }
  if (s === 'in_transit' || s === 'dispatched' || s === 'transit') return 'in_transit';
  if (s === 'picked_up' || s === 'pickup' || s === 'in_progress') return 'loading';
  if (s === 'assigned') return 'assigned';
  if (s === 'completed' || s === 'delivered' || s === 'done') return 'unloading';
  if (s === 'draft' || s === 'pending_acceptance') return 'unassigned';
  return 'loading';
}

/** Card header stage — Core getStageLabelForTrip + indent Give Load labels. */
export function commerceOpsStageLabel(exec: CommerceExecution): string {
  const stage = classifyCommerceOpsStage(exec);
  if (stage === 'indent') {
    return commerceOpsIndentStatus(exec.indent?.status, exec.bidCount);
  }
  if (stage === 'delivered') return 'DELIVERED';
  const trip = liveTrip(exec);
  if (!trip || !hasAssignedDriver(exec)) return 'UNASSIGNED';
  const s = normStatus(trip.status);
  if (s === 'in_progress') return 'LOADING';
  if (s === 'in_transit' || s === 'transit' || s === 'dispatched') return 'IN TRANSIT';
  if (s === 'picked_up' || s === 'pickup') return 'LOADING';
  if (s === 'at_drop' || s === 'unloading' || s === 'arrived' || s === 'at_destination') {
    return 'UNLOADING';
  }
  if (s === 'assigned') return 'ASSIGNED';
  if (s === 'completed' || s === 'delivered' || s === 'done') return 'COMPLETED';
  if (s === 'cancelled') return 'CANCELLED';
  return COMMERCE_OPS_RAIL_LABEL[stage];
}

export function countCommerceOpsByStage(
  executions: readonly CommerceExecution[],
): Record<CommerceOpsRailId, number> {
  const counts: Record<CommerceOpsRailId, number> = {
    all: executions.length,
    indent: 0,
    unassigned: 0,
    assigned: 0,
    loading: 0,
    in_transit: 0,
    unloading: 0,
    delivered: 0,
  };
  for (const exec of executions) {
    counts[classifyCommerceOpsStage(exec)] += 1;
  }
  return counts;
}

export function filterCommerceOpsByStage(
  executions: readonly CommerceExecution[],
  stage: CommerceOpsRailId,
): CommerceExecution[] {
  if (stage === 'all') return [...executions];
  return executions.filter(e => classifyCommerceOpsStage(e) === stage);
}

export function commerceOpsMatchesSearch(
  exec: CommerceExecution,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = [
    exec.planNumber,
    exec.indent?.indentNumber,
    exec.trip?.tripNumber,
    exec.trip?.driverName,
    exec.trip?.vehicleNumber,
    exec.trip?.supplierName,
    ...exec.orders.flatMap(o => [o.orderNumber, o.customerName]),
    ...exec.stops.map(s => s.label),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return hay.includes(q);
}

export function commerceOpsRoute(exec: CommerceExecution): { origin: string; dest: string } {
  const pickups = exec.stops.filter(s => s.type === 'pickup').map(s => s.label || s.city);
  const drops = exec.stops.filter(s => s.type === 'drop').map(s => s.label || s.city);
  const origin = pickups[0]
    || exec.trip?.pickupArea
    || exec.indent?.pickupArea
    || '—';
  const dest = drops[drops.length - 1]
    || exec.trip?.dropLocation
    || exec.indent?.dropLocation
    || '—';
  return { origin, dest };
}

export function commerceOpsCustomerLine(exec: CommerceExecution): string {
  const names = [...new Set(exec.orders.map(o => o.customerName).filter(n => n && n !== '—'))];
  if (!names.length) return '—';
  if (names.length === 1) return names[0];
  return `${names[0]} +${names.length - 1}`;
}

export type CommerceOpsDetailKind = 'trip' | 'indent' | 'plan';

export function commerceOpsDetailKind(exec: CommerceExecution): CommerceOpsDetailKind {
  if (liveTrip(exec)) return 'trip';
  if (exec.indent) return 'indent';
  return 'plan';
}

export function findCommerceExecutionByPlanId(
  executions: readonly CommerceExecution[],
  planId: string | undefined,
): CommerceExecution | undefined {
  if (!planId) return undefined;
  return executions.find(e => e.executionPlanId === planId);
}

export function findCommerceExecutionByIndentId(
  executions: readonly CommerceExecution[],
  indentId: string | undefined,
): CommerceExecution | undefined {
  if (!indentId) return undefined;
  return executions.find(e => e.indent?.id === indentId);
}

export function findCommerceExecutionByTripId(
  executions: readonly CommerceExecution[],
  tripId: string | undefined,
): CommerceExecution | undefined {
  if (!tripId) return undefined;
  return executions.find(e =>
    e.trip?.id === tripId || (e.trips ?? []).some(t => t.id === tripId),
  );
}

export function commerceOpsPrimaryPath(exec: CommerceExecution): string {
  return `/execution/plan/${exec.executionPlanId}`;
}

/** User-facing list identity: indent when present, else plan. Never trip number. */
export function commerceOpsCardTitle(exec: CommerceExecution): string {
  return exec.indent?.indentNumber || exec.planNumber || exec.trip?.tripNumber || '—';
}

/** Canonical Operations group: indent if present, else the published plan. */
export function commerceOpsGroupKey(exec: CommerceExecution): string {
  return exec.indent?.id ?? exec.executionPlanId;
}

/** Same indent must never appear as two Operations cards. Distinct indents stay distinct. */
export function collapseCommerceExecutionsToIndentGroups(
  executions: CommerceExecution[],
): CommerceExecution[] {
  const seen = new Map<string, number>();
  const out: CommerceExecution[] = [];
  for (const exec of executions) {
    const key = commerceOpsGroupKey(exec);
    const prevIdx = seen.get(key);
    if (prevIdx == null) {
      seen.set(key, out.length);
      out.push(exec);
      continue;
    }
    const prev = out[prevIdx];
    if (exec.stopCount > prev.stopCount || exec.orderCount > prev.orderCount) {
      out[prevIdx] = exec;
    }
  }
  return out;
}

export function commerceOpsStopPath(exec: CommerceExecution): string {
  const labels = exec.stops
    .slice()
    .sort((a, b) => a.sequence - b.sequence)
    .map(s => s.label)
    .filter(Boolean);
  if (labels.length >= 2) return labels.join(' → ');
  const route = commerceOpsRoute(exec);
  if (route.origin === '—' && route.dest === '—') return '—';
  return `${route.origin} → ${route.dest}`;
}

export type CommerceOpsTimelineMarker = 'done' | 'current' | 'pending';

export type CommerceOpsTimelineItem = {
  id: string;
  label: string;
  marker: CommerceOpsTimelineMarker;
};

function sesMarker(status: string | null | undefined): CommerceOpsTimelineMarker {
  const s = (status ?? '').trim().toLowerCase();
  if (s === 'completed') return 'done';
  if (s === 'arrived' || s === 'in_progress' || s === 'loading') return 'current';
  return 'pending';
}

function markCurrentAfterDone(items: CommerceOpsTimelineItem[]): CommerceOpsTimelineItem[] {
  if (items.some(i => i.marker === 'current')) return items;
  const firstPending = items.findIndex(i => i.marker === 'pending');
  if (firstPending < 0) return items;
  return items.map((item, i) => (i === firstPending ? { ...item, marker: 'current' } : item));
}

export function commerceOpsGroupTimeline(exec: CommerceExecution): CommerceOpsTimelineItem[] {
  const trip = liveTrip(exec);
  const hasOrders = exec.orderCount > 0 || exec.orders.length > 0;
  const allStopsDone = exec.stops.length > 0
    && exec.stops.every(s => (s.executionStatus ?? '').toLowerCase() === 'completed');
  const delivered = isFulfillmentDelivered(exec) || allStopsDone;

  const items: CommerceOpsTimelineItem[] = [
    { id: 'orders', label: 'Orders received', marker: hasOrders ? 'done' : 'pending' },
    { id: 'plan', label: 'Plan created', marker: 'done' },
    { id: 'indent', label: 'Indent created', marker: exec.indent ? 'done' : 'pending' },
    { id: 'shared', label: 'Shared to Operations', marker: exec.planStatus === 'published' ? 'done' : 'pending' },
    { id: 'transport', label: 'Transporter assigned', marker: trip ? 'done' : 'pending' },
    { id: 'driver', label: 'Driver assigned', marker: hasAssignedDriver(exec) ? 'done' : 'pending' },
    { id: 'vehicle', label: 'Vehicle assigned', marker: trip?.vehicleNumber ? 'done' : 'pending' },
    ...exec.stops.map(stop => ({
      id: stop.id,
      label: `${stop.type === 'pickup' ? 'Pickup' : 'Drop'} ${stop.label}`,
      marker: sesMarker(stop.executionStatus),
    })),
    { id: 'all-delivered', label: 'All orders delivered', marker: delivered ? 'done' : 'pending' },
  ];
  return markCurrentAfterDone(items);
}

export function commerceOpsOrderJourney(order: CommerceExecutionOrder): CommerceOpsTimelineItem[] {
  const dropLabel = order.dropLabel ? `Drop ${order.dropLabel}` : 'Drop';
  const pickupLabel = order.pickupLabel ? `Pickup ${order.pickupLabel}` : 'Pickup';
  return markCurrentAfterDone([
    { id: `${order.id}-pickup`, label: pickupLabel, marker: sesMarker(order.pickupStatus ?? null) },
    { id: `${order.id}-drop`, label: dropLabel, marker: sesMarker(order.deliveryStatus) },
    {
      id: `${order.id}-delivered`,
      label: 'Delivered',
      marker: (order.deliveryStatus ?? '').toLowerCase() === 'completed' ? 'done' : 'pending',
    },
  ]);
}
