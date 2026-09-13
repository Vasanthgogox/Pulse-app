/**
 * Presentation-only mapping from real Core status enums to business-facing
 * Commerce labels. Never writes back to indents/trips — purely a display
 * layer over the raw values returned by execution-visibility.service.ts.
 *
 * Source enums (confirmed live against production):
 *   indents.status: draft, broadcast, open, pending, quoted, awarded,
 *                    completed, expired, cancelled, closed
 *   trips.status:   draft, pending_acceptance, assigned, in_progress,
 *                    picked_up, in_transit, transit, at_pickup, loading,
 *                    at_drop, unloading, completed, cancelled, delivered,
 *                    done, active
 */
import type { CommerceExecution } from './services/execution-visibility.service';

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
