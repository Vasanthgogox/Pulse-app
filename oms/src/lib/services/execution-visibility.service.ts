/**
 * Reads the authoritative, persisted execution state — execution_plans +
 * execution_plan_stops + the linked Core indent + the indent's linked Core
 * trip + the plan's sales_orders — for the Commerce Execution page. This is
 * the ONLY read path that reflects what actually exists in Core after a
 * refresh/reopen — the local execution-store mirror is an optimistic UI
 * cache, not a source of truth.
 *
 * Uses the same authenticated, RLS-scoped Supabase client (getIdentityDb())
 * already used by orders.service.ts / execution-plans.service.ts. No new
 * gateway, endpoint, or migration required — execution_plans,
 * execution_plan_stops, indents, trips, and sales_orders already have
 * org-member SELECT policies (is_org_member(organization_id), or the
 * equivalent transitive policy for trips).
 *
 * Commerce origin needs no new column: an indent is Commerce-originated iff
 * indents.execution_plan_id IS NOT NULL (this table only exists to serve
 * Commerce-published plans — see the Commerce Mini-Core Slice 1 audit), and
 * a trip is Commerce-originated iff its linked indent is. Since this service
 * only ever queries plans owned by Commerce in the first place, every
 * CommerceExecution/ExecutionJob it returns is Commerce-originated by
 * construction — the boolean flag is only meaningful on the Core side
 * (where Commerce and non-Commerce indents/trips are mixed together).
 *
 * trips.indent_id has TWO foreign keys pointing at indents (indent_id and
 * source_indent_id, for the mover-asset shadow-trip case) — the embed below
 * must disambiguate via the exact constraint name (trips_indent_id_fkey,
 * confirmed live) or PostgREST raises a relationship-ambiguity error.
 */
import { getIdentityDb as getSupabase } from '@/lib/supabase';
import { DEFAULT_TENANT } from '@/types/platform';
import { createEntityMetadata } from '@/lib/entity-metadata';
import type { ExecutionJob } from '@/types/execution';

export interface CommerceExecutionStop {
  id:         string;
  type:       'pickup' | 'drop';
  sequence:   number;
  label:      string;
  city:       string;
  sourceType: string;
}

export interface CommerceExecutionIndent {
  id:           string;
  indentNumber: string;
  /** Raw Core status (e.g. 'broadcast', 'awarded') — map via commerce-execution-status.ts for display. */
  status:       string;
  pickupArea:   string;
  dropLocation: string;
}

export interface CommerceExecutionTrip {
  id:         string;
  tripNumber: string;
  /** Raw Core status (e.g. 'in_transit', 'delivered') — map via commerce-execution-status.ts for display. */
  status:     string;
}

export interface CommerceExecution {
  executionPlanId: string;
  planNumber:      string;
  planStatus:      string;
  correlationId:   string | null;
  publishedAt:     string;
  createdAt:       string;
  orderCount:      number;
  totalAmount:     number;
  totalWeightKg:   number;
  stopCount:       number;
  stops:           CommerceExecutionStop[];
  indent:          CommerceExecutionIndent | null;
  trip:            CommerceExecutionTrip | null;
}

interface StopRow {
  id: string;
  stop_type: 'pickup' | 'drop';
  sequence: number;
  label: string | null;
  display_name: string | null;
  city: string | null;
  source_type: string | null;
  pod_required: boolean;
}

interface TripRow {
  id: string;
  trip_number: string | null;
  status: string;
}

interface IndentRow {
  id: string;
  indent_number: string | null;
  status: string;
  pickup_area: string | null;
  drop_location: string | null;
  trips: TripRow[] | TripRow | null;
}

interface PlanRow {
  id: string;
  plan_number: string;
  status: string;
  correlation_id: string | null;
  published_at: string | null;
  created_at: string;
  stops: StopRow[] | null;
  indents: IndentRow[] | IndentRow | null;
}

const PERSISTED_PLAN_SELECT = `
  id, plan_number, status, correlation_id, published_at, created_at,
  stops:execution_plan_stops(id, stop_type, sequence, label, display_name, city, source_type, pod_required),
  indents(
    id, indent_number, status, pickup_area, drop_location,
    trips!trips_indent_id_fkey(id, trip_number, status)
  )
`.trim();

function firstOf<T>(row: T[] | T | null): T | null {
  if (!row) return null;
  return Array.isArray(row) ? (row[0] ?? null) : row;
}

function stopRowToCommerceStop(row: StopRow): CommerceExecutionStop {
  return {
    id:         row.id,
    type:       row.stop_type,
    sequence:   row.sequence,
    label:      row.display_name ?? row.label ?? (row.stop_type === 'pickup' ? 'Pickup' : 'Drop'),
    city:       row.city ?? '',
    sourceType: row.source_type ?? 'manual',
  };
}

function planRowToCommerceExecution(
  row: PlanRow,
  orderSummary: { count: number; amount: number; weightKg: number },
): CommerceExecution {
  const indentRow = firstOf(row.indents);
  const tripRow = indentRow ? firstOf(indentRow.trips) : null;
  const stops = (row.stops ?? []).slice().sort((a, b) => a.sequence - b.sequence);

  return {
    executionPlanId: row.id,
    planNumber:      row.plan_number,
    planStatus:      row.status,
    correlationId:   row.correlation_id,
    publishedAt:     row.published_at ?? row.created_at,
    createdAt:       row.created_at,
    orderCount:      orderSummary.count,
    totalAmount:     orderSummary.amount,
    totalWeightKg:   orderSummary.weightKg,
    stopCount:       stops.length,
    stops:           stops.map(stopRowToCommerceStop),
    indent: indentRow ? {
      id:           indentRow.id,
      indentNumber: indentRow.indent_number ?? indentRow.id,
      status:       indentRow.status,
      pickupArea:   indentRow.pickup_area ?? '',
      dropLocation: indentRow.drop_location ?? '',
    } : null,
    trip: tripRow ? {
      id:         tripRow.id,
      tripNumber: tripRow.trip_number ?? tripRow.id,
      status:     tripRow.status,
    } : null,
  };
}

/**
 * Builds a full ExecutionJob for a persisted plan, for the pre-existing
 * local execution-store reconciliation (ExecutionProvider). `command` is
 * populated with real values only where the old job-mirror UI (and the
 * local demo dispatch/driver simulation, out of scope here) actually reads
 * them — `summary.orderCount`/`summary.totalAmount` — everything else is a
 * safe, unused placeholder so that type isn't loosened just for this read
 * path. The new Commerce Execution UI reads CommerceExecution directly
 * instead (see fetchCommerceExecutions below).
 */
export function toExecutionJob(exec: CommerceExecution, organizationId: string): ExecutionJob {
  return {
    id:              `JOB-${exec.executionPlanId}`,
    correlationId:   exec.correlationId ?? exec.executionPlanId,
    executionPlanId: exec.executionPlanId,
    planNumber:      exec.planNumber,
    command: {
      tenant:          DEFAULT_TENANT,
      meta:            createEntityMetadata({
        id: exec.executionPlanId, status: 'published', tenant: DEFAULT_TENANT,
        source: 'commerce', createdBy: 'system',
        createdAt: exec.createdAt, updatedAt: exec.publishedAt,
      }),
      workspaceId:     organizationId,
      requestedBy:     '',
      executionPlanId: exec.executionPlanId,
      planNumber:      exec.planNumber,
      vehicleType:     '',
      stops:           [],
      route:           { sequence: [] },
      allocations:     [],
      orders:          [],
      constraints:     { temperature: 'ambient', max_weight_kg: 0, max_volume_m3: 0, delivery_sla_hours: 24, hazmat: false, fragile: false },
      summary: {
        orderCount:    exec.orderCount,
        totalAmount:   exec.totalAmount,
        totalWeightKg: exec.totalWeightKg,
        currency:      'INR',
      },
    },
    status:     'received',
    stops:      exec.stops.map(s => ({
      stopId: s.id, sequence: s.sequence, label: s.label, type: s.type,
      city: s.city, status: 'pending', podRequired: false,
    })),
    indentId:   exec.indent?.id,
    indentCode: exec.indent?.indentNumber,
    receivedAt: exec.publishedAt,
  };
}

async function queryCommerceExecutions(organizationId: string): Promise<CommerceExecution[]> {
  const sb = getSupabase();
  if (!sb || !organizationId) return [];

  const { data: plans, error: planErr } = await sb
    .from('execution_plans')
    .select(PERSISTED_PLAN_SELECT)
    .eq('organization_id', organizationId)
    .eq('status', 'published')
    .is('deleted_at', null)
    .order('published_at', { ascending: false });
  if (planErr) throw planErr;

  const planRows = (plans ?? []) as unknown as PlanRow[];
  if (!planRows.length) return [];

  const planIds = planRows.map(p => p.id);
  const { data: orders, error: orderErr } = await sb
    .from('sales_orders')
    .select('execution_plan_id, total_amount, total_weight_kg')
    .in('execution_plan_id', planIds);
  if (orderErr) throw orderErr;

  const summaryByPlan = new Map<string, { count: number; amount: number; weightKg: number }>();
  for (const o of (orders ?? []) as { execution_plan_id: string; total_amount: number | null; total_weight_kg: number | null }[]) {
    const cur = summaryByPlan.get(o.execution_plan_id) ?? { count: 0, amount: 0, weightKg: 0 };
    cur.count += 1;
    cur.amount += o.total_amount ?? 0;
    cur.weightKg += o.total_weight_kg ?? 0;
    summaryByPlan.set(o.execution_plan_id, cur);
  }

  return planRows.map(row =>
    planRowToCommerceExecution(row, summaryByPlan.get(row.id) ?? { count: 0, amount: 0, weightKg: 0 }),
  );
}

/** Rich, lifecycle-oriented shape for the Commerce Execution UI (plan → orders → stops → indent → trip). */
export async function fetchCommerceExecutions(organizationId: string): Promise<CommerceExecution[]> {
  return queryCommerceExecutions(organizationId);
}
