/**
 * Trip workflow event service.
 *
 * Append-only: every workflow step is a DB insert to trip_workflow_events.
 * Workflow state is DERIVED from events — never stored as mutable status columns.
 *
 * Idempotency:
 *   Single-occurrence events (invoice.generated, pod.uploaded, etc.) use a
 *   deterministic idempotency_key = `${tripId}:${eventType}`. DB has a UNIQUE
 *   index on this column. On conflict (23505) we return `alreadyExists: true`
 *   instead of an error — the call is a safe no-op.
 *
 *   Multi-occurrence events (future: partial payments) omit idempotency_key.
 */
import { supabase } from '@/lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export type TripWorkflowEventType =
  | 'trip.completed'
  | 'pod.uploaded'
  | 'invoice.generated'
  | 'supplier.payment_recorded'
  | 'client.payment_received';

/** All single-occurrence events — only one may exist per trip. */
const SINGLETON_EVENTS = new Set<TripWorkflowEventType>([
  'trip.completed',
  'pod.uploaded',
  'invoice.generated',
  'supplier.payment_recorded',
  'client.payment_received',
]);

export interface TripWorkflowEvent {
  id: string;
  trip_id: string;
  org_id: string;
  actor_id: string | null;
  event_type: TripWorkflowEventType;
  payload: Record<string, unknown>;
  idempotency_key: string | null;
  created_at: string;
}

export interface TripWorkflowState {
  tripCompleted: boolean;
  podUploaded: boolean;
  invoiceGenerated: boolean;
  supplierPaymentRecorded: boolean;
  clientPaymentReceived: boolean;
  /** Finance track: invoice + supplier + client receipt. */
  financeComplete: boolean;
  /** Documentation track: POD uploaded. */
  docComplete: boolean;
  /** True only when both tracks are fully done. */
  allDone: boolean;
  events: TripWorkflowEvent[];
  lastUpdatedAt: string | null;
}

// ─── State derivation (pure — testable without DB) ───────────────────────────

export function deriveWorkflowState(events: TripWorkflowEvent[]): TripWorkflowState {
  const sorted = [...events].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  const has = (t: TripWorkflowEventType) => sorted.some((e) => e.event_type === t);

  const tripCompleted = has('trip.completed');
  const podUploaded = has('pod.uploaded');
  const invoiceGenerated = has('invoice.generated');
  const supplierPaymentRecorded = has('supplier.payment_recorded');
  const clientPaymentReceived = has('client.payment_received');

  const financeComplete = invoiceGenerated && supplierPaymentRecorded && clientPaymentReceived;
  const docComplete = podUploaded;

  return {
    tripCompleted,
    podUploaded,
    invoiceGenerated,
    supplierPaymentRecorded,
    clientPaymentReceived,
    financeComplete,
    docComplete,
    allDone: financeComplete && docComplete,
    events: sorted,
    lastUpdatedAt: sorted.at(-1)?.created_at ?? null,
  };
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getTripWorkflowEvents(tripId: string): Promise<{
  error: Error | null;
  events: TripWorkflowEvent[];
}> {
  const { data, error } = await supabase()
    .from('trip_workflow_events')
    .select('*')
    .eq('trip_id', tripId)
    .order('created_at', { ascending: true });

  if (error) return { error: new Error(error.message), events: [] };
  return { error: null, events: (data ?? []) as TripWorkflowEvent[] };
}

// ─── Write ────────────────────────────────────────────────────────────────────

export async function recordTripWorkflowEvent(params: {
  tripId: string;
  orgId: string;
  eventType: TripWorkflowEventType;
  payload?: Record<string, unknown>;
}): Promise<{
  error: Error | null;
  event: TripWorkflowEvent | null;
  alreadyExists: boolean;
}> {
  const isSingleton = SINGLETON_EVENTS.has(params.eventType);
  const idempotencyKey = isSingleton
    ? `${params.tripId}:${params.eventType}`
    : null;

  const { data, error } = await supabase()
    .from('trip_workflow_events')
    .insert({
      trip_id: params.tripId,
      org_id: params.orgId,
      event_type: params.eventType,
      payload: params.payload ?? {},
      idempotency_key: idempotencyKey,
    })
    .select()
    .single();

  if (error) {
    // Postgres unique violation = event already recorded → safe no-op
    if (error.code === '23505' && idempotencyKey) {
      return { error: null, event: null, alreadyExists: true };
    }
    return { error: new Error(error.message), event: null, alreadyExists: false };
  }

  return { error: null, event: data as TripWorkflowEvent, alreadyExists: false };
}
