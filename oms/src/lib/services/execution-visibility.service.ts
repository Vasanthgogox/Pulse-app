/**
 * Reads the authoritative, persisted execution state — execution_plans +
 * execution_plan_stops + the linked Core indent + the indent's linked Core
 * trip (+ its transport economics + supplier) + the plan's sales_orders
 * (+ each order's own drop-stop delivery state) — for the Commerce
 * Execution page. This is the ONLY read path that reflects what actually
 * exists in Core after a refresh/reopen — the local execution-store mirror
 * is an optimistic UI cache, not a source of truth.
 *
 * Uses the same authenticated, RLS-scoped Supabase client (getIdentityDb())
 * already used by orders.service.ts / execution-plans.service.ts. No new
 * gateway, endpoint, RPC, or migration required — every table read here
 * (execution_plans, execution_plan_stops, indents, trips, suppliers,
 * sales_orders, clients, shipment_allocations, sales_order_lines,
 * stop_execution_state) already has org-scoped SELECT RLS.
 *
 * Commerce origin needs no new column: an indent is Commerce-originated iff
 * indents.execution_plan_id IS NOT NULL (this table only exists to serve
 * Commerce-published plans), and a trip is Commerce-originated iff its
 * linked indent is. Since this service only ever queries plans owned by
 * Commerce in the first place, everything it returns is Commerce-originated
 * by construction.
 *
 * trips.indent_id has TWO foreign keys pointing at indents (indent_id and
 * source_indent_id, for the mover-asset shadow-trip case) — the embed below
 * must disambiguate via the exact constraint name (trips_indent_id_fkey,
 * confirmed live) or PostgREST raises a relationship-ambiguity error.
 *
 * Sales value vs. transport cost (hard product rule — do not blur these):
 *   Sales value  = sum(sales_orders.total_amount) — Commerce's own commercial value.
 *   Transport cost = trips.supplier_rate, and ONLY once a real trip exists.
 *   Before a trip exists, indents.supplier_target is a target/asking rate
 *   set by the indent creator, never an authoritative cost — it must never
 *   be labelled "cost", and is never derived from sales value or vice versa.
 *
 * Order-level delivery is derived from each order's own DROP stop's
 * stop_execution_state row (never from a shared pickup stop, and never by
 * inferring from trips.status — trip completion does not guarantee every
 * stop completed, confirmed by direct audit of the trip-completion code).
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
  id:             string;
  indentNumber:   string;
  /** Raw Core status (e.g. 'broadcast', 'awarded') — map via commerce-execution-status.ts for display. */
  status:         string;
  pickupArea:     string;
  dropLocation:   string;
  /** Target/asking transport rate set at indent creation — NEVER an authoritative cost. Null if unset/zero. */
  supplierTarget: number | null;
}

export interface CommerceExecutionTrip {
  id:           string;
  tripNumber:   string;
  /** Raw Core status (e.g. 'in_transit', 'delivered') — map via commerce-execution-status.ts for display. */
  status:       string;
  /** Authoritative transport cost once a trip exists. */
  supplierRate: number;
  supplierName: string | null;
}

export interface CommerceExecutionOrder {
  id:           string;
  orderNumber:  string;
  customerName: string;
  amount:       number;
  /** Raw stop_execution_state.status for this order's own drop stop — null if no trip/stop-state row exists yet. */
  deliveryStatus: string | null;
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
  orders:          CommerceExecutionOrder[];
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
  supplier_rate: number | null;
  suppliers: { name: string | null } | { name: string | null }[] | null;
}

interface IndentRow {
  id: string;
  indent_number: string | null;
  status: string;
  pickup_area: string | null;
  drop_location: string | null;
  supplier_target: number | null;
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

interface SalesOrderRow {
  id: string;
  execution_plan_id: string;
  order_number: string;
  total_amount: number | null;
  total_weight_kg: number | null;
  clients: { name: string | null } | { name: string | null }[] | null;
}

interface AllocationRow {
  drop_stop_id: string;
  sales_order_lines: { sales_order_id: string } | { sales_order_id: string }[] | null;
}

const PERSISTED_PLAN_SELECT = `
  id, plan_number, status, correlation_id, published_at, created_at,
  stops:execution_plan_stops(id, stop_type, sequence, label, display_name, city, source_type, pod_required),
  indents(
    id, indent_number, status, pickup_area, drop_location, supplier_target,
    trips!trips_indent_id_fkey(id, trip_number, status, supplier_rate, suppliers(name))
  )
`.trim();

function firstOf<T>(row: T[] | T | null): T | null {
  if (!row) return null;
  return Array.isArray(row) ? (row[0] ?? null) : row;
}

function asArray<T>(row: T[] | T | null | undefined): T[] {
  if (!row) return [];
  return Array.isArray(row) ? row : [row];
}

function tripProgressRank(status: string): number {
  if (status === 'cancelled') return 0;
  if (status === 'completed' || status === 'delivered' || status === 'done') return 50;
  if (
    status === 'in_progress' || status === 'picked_up' || status === 'in_transit'
    || status === 'transit' || status === 'at_pickup' || status === 'loading'
    || status === 'at_drop' || status === 'unloading' || status === 'active'
  ) return 40;
  if (status === 'assigned') return 30;
  if (status === 'pending_acceptance') return 20;
  if (status === 'draft') return 10;
  return 15;
}

function pickBestTrip(trips: TripRow[] | TripRow | null | undefined): TripRow | null {
  const list = asArray(trips);
  if (!list.length) return null;
  const live = list.filter(t => t.status !== 'cancelled');
  const pool = live.length ? live : list;
  return pool.slice().sort((a, b) => tripProgressRank(b.status) - tripProgressRank(a.status))[0] ?? null;
}

function pickBestIndent(indents: IndentRow[] | IndentRow | null | undefined): IndentRow | null {
  const list = asArray(indents);
  if (!list.length) return null;
  const withLiveTrip = list.filter(i => {
    const trip = pickBestTrip(i.trips);
    return trip != null && trip.status !== 'cancelled';
  });
  if (withLiveTrip.length) {
    return withLiveTrip.find(i => i.status === 'awarded' || i.status === 'completed') ?? withLiveTrip[0];
  }
  return list.find(i => i.status === 'awarded')
    ?? list.find(i => i.status === 'completed')
    ?? list.find(i => i.status === 'broadcast' || i.status === 'open' || i.status === 'quoted')
    ?? list[0];
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
  orders: CommerceExecutionOrder[],
): CommerceExecution {
  const indentRow = pickBestIndent(row.indents);
  const tripRow = indentRow ? pickBestTrip(indentRow.trips) : null;
  const supplier = tripRow ? firstOf(tripRow.suppliers) : null;
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
      id:             indentRow.id,
      indentNumber:   indentRow.indent_number ?? indentRow.id,
      status:         indentRow.status,
      pickupArea:     indentRow.pickup_area ?? '',
      dropLocation:   indentRow.drop_location ?? '',
      supplierTarget: indentRow.supplier_target && indentRow.supplier_target > 0 ? indentRow.supplier_target : null,
    } : null,
    trip: tripRow ? {
      id:           tripRow.id,
      tripNumber:   tripRow.trip_number ?? tripRow.id,
      status:       tripRow.status,
      supplierRate: tripRow.supplier_rate ?? 0,
      supplierName: supplier?.name ?? null,
    } : null,
    orders,
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

/**
 * Embed only follows trips.indent_id. Core also links mover/award trips via
 * source_indent_id, and a plan can have more than one indent. Hydrate both
 * FKs so Commerce trip status matches Pulse Core.
 */
async function hydrateTripsFromIndentLinks(planRows: PlanRow[]): Promise<void> {
  const indentIds = [...new Set(planRows.flatMap(row => asArray(row.indents).map(i => i.id)))];
  if (!indentIds.length) return;
  const sb = getSupabase();
  if (!sb) return;

  const { data, error } = await sb
    .from('trips')
    .select('id, trip_number, status, supplier_rate, indent_id, source_indent_id, suppliers(name)')
    .or(`indent_id.in.(${indentIds.join(',')}),source_indent_id.in.(${indentIds.join(',')})`);
  if (error || !data?.length) return;

  type LinkedTrip = TripRow & { indent_id: string | null; source_indent_id: string | null };
  const byIndent = new Map<string, TripRow[]>();
  const add = (indentId: string | null, trip: LinkedTrip) => {
    if (!indentId) return;
    const list = byIndent.get(indentId) ?? [];
    if (!list.some(existing => existing.id === trip.id)) list.push(trip);
    byIndent.set(indentId, list);
  };
  for (const trip of data as LinkedTrip[]) {
    add(trip.indent_id, trip);
    add(trip.source_indent_id, trip);
  }

  for (const row of planRows) {
    for (const indent of asArray(row.indents)) {
      const extra = byIndent.get(indent.id) ?? [];
      const merged = asArray(indent.trips);
      for (const trip of extra) {
        if (!merged.some(existing => existing.id === trip.id)) merged.push(trip);
      }
      indent.trips = merged;
    }
  }
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
  await hydrateTripsFromIndentLinks(planRows);

  const tripIdByPlanId = new Map<string, string>();
  for (const row of planRows) {
    const indentRow = pickBestIndent(row.indents);
    const tripRow = indentRow ? pickBestTrip(indentRow.trips) : null;
    if (tripRow) tripIdByPlanId.set(row.id, tripRow.id);
  }

  const { data: orders, error: orderErr } = await sb
    .from('sales_orders')
    .select('id, execution_plan_id, order_number, total_amount, total_weight_kg, clients(name)')
    .in('execution_plan_id', planIds);
  if (orderErr) throw orderErr;
  const orderRows = (orders ?? []) as unknown as SalesOrderRow[];

  const { data: allocations, error: allocErr } = await sb
    .from('shipment_allocations')
    .select('drop_stop_id, sales_order_lines(sales_order_id)')
    .in('execution_plan_id', planIds);
  if (allocErr) throw allocErr;
  const allocationRows = (allocations ?? []) as unknown as AllocationRow[];

  const dropStopIdByOrderId = new Map<string, string>();
  for (const alloc of allocationRows) {
    const line = firstOf(alloc.sales_order_lines);
    if (line && !dropStopIdByOrderId.has(line.sales_order_id)) {
      dropStopIdByOrderId.set(line.sales_order_id, alloc.drop_stop_id);
    }
  }

  const tripIds = [...new Set(tripIdByPlanId.values())];
  const stopStatusByTripAndStop = new Map<string, string>();
  if (tripIds.length) {
    const { data: stopStates, error: stopErr } = await sb
      .from('stop_execution_state')
      .select('trip_id, stop_id, status')
      .in('trip_id', tripIds);
    if (stopErr) throw stopErr;
    for (const s of (stopStates ?? []) as { trip_id: string; stop_id: string; status: string }[]) {
      stopStatusByTripAndStop.set(`${s.trip_id}:${s.stop_id}`, s.status);
    }
  }

  const summaryByPlan = new Map<string, { count: number; amount: number; weightKg: number }>();
  const ordersByPlan = new Map<string, CommerceExecutionOrder[]>();
  for (const o of orderRows) {
    const client = firstOf(o.clients);
    const cur = summaryByPlan.get(o.execution_plan_id) ?? { count: 0, amount: 0, weightKg: 0 };
    cur.count += 1;
    cur.amount += o.total_amount ?? 0;
    cur.weightKg += o.total_weight_kg ?? 0;
    summaryByPlan.set(o.execution_plan_id, cur);

    const tripId = tripIdByPlanId.get(o.execution_plan_id);
    const dropStopId = dropStopIdByOrderId.get(o.id);
    const deliveryStatus = tripId && dropStopId
      ? stopStatusByTripAndStop.get(`${tripId}:${dropStopId}`) ?? null
      : null;

    const list = ordersByPlan.get(o.execution_plan_id) ?? [];
    list.push({
      id:             o.id,
      orderNumber:    o.order_number,
      customerName:   client?.name ?? '—',
      amount:         o.total_amount ?? 0,
      deliveryStatus,
    });
    ordersByPlan.set(o.execution_plan_id, list);
  }

  return planRows.map(row =>
    planRowToCommerceExecution(
      row,
      summaryByPlan.get(row.id) ?? { count: 0, amount: 0, weightKg: 0 },
      ordersByPlan.get(row.id) ?? [],
    ),
  );
}

/** Rich, lifecycle-oriented shape for the Commerce Execution UI (plan → orders → stops → indent → trip). */
export async function fetchCommerceExecutions(organizationId: string): Promise<CommerceExecution[]> {
  return queryCommerceExecutions(organizationId);
}
