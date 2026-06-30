import { getIdentityDb as getSupabase } from '@/lib/supabase';
import type {
  ExecutionPlan, PlanStop, ExecutionRoute, ShipmentAllocation,
  ExecutionConstraints, MergeOptimizationMetrics, PlanStatus, PlanOrigin,
} from '@/types/commerce';

// ─── DB row shapes ────────────────────────────────────────────────────────────
interface PlanRow {
  id: string;
  plan_number: string;
  organization_id: string;
  status: string;
  origin: string;
  merge_score: number | null;
  planned_vehicle_type: string | null;
  constraints: Record<string, unknown>;
  correlation_id: string | null;
  lifecycle_stage: string | null;
  published_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  stops: StopRow[];
}

interface StopRow {
  id: string;
  stop_type: string;
  warehouse_id: string;
  sequence: number;
  label: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  pod_required: boolean;
  notes: string | null;
  warehouse: {
    id: string;
    name: string;
    address: string | null;
    city: string | null;
    state: string | null;
    pincode: string | null;
    latitude: number | null;
    longitude: number | null;
  } | null;
}

interface AllocationRow {
  id: string;
  execution_plan_id: string;
  sales_order_line_id: string;
  pickup_stop_id: string;
  drop_stop_id: string;
  quantity: number;
  weight_kg: number;
  volume_m3: number;
}

function stopRowToPlanStop(row: StopRow): PlanStop {
  const w = row.warehouse;
  return {
    stop_id:       row.id,
    label:         row.label ?? (w?.name ?? row.id),
    type:          row.stop_type as 'pickup' | 'drop',
    warehouse_id:  row.warehouse_id,
    address: {
      line1:   w?.address ?? '',
      city:    w?.city    ?? '',
      state:   w?.state   ?? '',
      pincode: w?.pincode ?? '',
      lat:     w?.latitude  ?? undefined,
      lng:     w?.longitude ?? undefined,
    },
    contact_name:  row.contact_name  ?? '',
    contact_phone: row.contact_phone ?? '',
    pod_required:  row.pod_required,
  };
}

function planRowToExecutionPlan(row: PlanRow, allocations: AllocationRow[]): ExecutionPlan {
  const stops = (row.stops ?? [])
    .sort((a, b) => a.sequence - b.sequence)
    .map(stopRowToPlanStop);
  const route: ExecutionRoute = { sequence: stops.map(s => s.stop_id) };
  const mappedAllocations: ShipmentAllocation[] = allocations
    .filter(a => a.execution_plan_id === row.id)
    .map(a => ({
      allocation_id:  a.id,
      order_id:       '',
      pickup_stop_id: a.pickup_stop_id,
      drop_stop_id:   a.drop_stop_id,
      weight_kg:      a.weight_kg,
      volume_m3:      a.volume_m3,
    }));

  const constraints = row.constraints as unknown as ExecutionConstraints;
  const optimization = row.merge_score != null ? {
    merge_score:             row.merge_score,
    vehicle_utilization_pct: (constraints?.max_weight_kg ? 0 : 0),
    distance_saved_km:       0,
    carbon_saved_kg:         0,
    savings_inr:             0,
    factors: {
      distance: 0, weight: 0, volume: 0, vehicle_fill: 0,
      delivery_window: 0, priority: 0, customer_sla: 0, revenue: 0, profit_margin: 0,
    },
  } as MergeOptimizationMetrics : undefined;

  return {
    id:              row.id,
    plan_number:     row.plan_number,
    status:          row.status as PlanStatus,
    origin:          row.origin as PlanOrigin,
    stops,
    route,
    allocations:     mappedAllocations,
    constraints:     constraints ?? { temperature: 'ambient', max_weight_kg: 0, max_volume_m3: 0, delivery_sla_hours: 24, hazmat: false, fragile: false },
    order_ids:       [],
    total_orders:    0,
    total_amount:    0,
    total_weight_kg: stops.reduce((_s, _st) => _s, 0),
    total_volume_m3: 0,
    optimization,
    correlation_id:    row.correlation_id ?? undefined,
    lifecycle_stage:   row.lifecycle_stage ?? undefined,
    published_at:      row.published_at ?? undefined,
    created_by:        row.created_by ?? '',
    created_at:        row.created_at,
    updated_at:        row.updated_at,
  };
}

const PLAN_SELECT = `
  id, plan_number, organization_id, status, origin, merge_score,
  planned_vehicle_type, constraints, correlation_id, lifecycle_stage,
  published_at, created_by, created_at, updated_at,
  stops:execution_plan_stops(
    id, stop_type, warehouse_id, sequence, label, contact_name, contact_phone, pod_required, notes,
    warehouse:client_warehouses!warehouse_id(id,name,address,city,state,pincode,latitude,longitude)
  )
`.trim();

export async function fetchExecutionPlans(organizationId: string): Promise<ExecutionPlan[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data: plans, error: planErr } = await sb
    .from('execution_plans')
    .select(PLAN_SELECT)
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (planErr) throw planErr;

  const planRows = plans as unknown as PlanRow[];
  const planIds = planRows.map(p => p.id);
  if (!planIds.length) return [];

  const { data: allocs, error: allocErr } = await sb
    .from('shipment_allocations')
    .select('id,execution_plan_id,sales_order_line_id,pickup_stop_id,drop_stop_id,quantity,weight_kg,volume_m3')
    .in('execution_plan_id', planIds);
  if (allocErr) throw allocErr;

  return planRows.map(p =>
    planRowToExecutionPlan(p, (allocs as unknown as AllocationRow[]) ?? []),
  );
}

export interface CreatePlanInput {
  organization_id: string;
  origin?: PlanOrigin;
  constraints: ExecutionConstraints;
  optimization?: MergeOptimizationMetrics;
  stops: Array<{
    warehouse_id: string;
    stop_type: 'pickup' | 'drop';
    sequence: number;
    label?: string;
    contact_name?: string;
    contact_phone?: string;
    pod_required?: boolean;
  }>;
  allocations: Array<{
    sales_order_line_id: string;
    pickup_stop_id_index: number;
    drop_stop_id_index: number;
    quantity: number;
    weight_kg?: number;
    volume_m3?: number;
  }>;
}

export async function createExecutionPlan(input: CreatePlanInput): Promise<ExecutionPlan> {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase not configured');

  const { data: planNumber, error: seqErr } = await sb.rpc('next_plan_number', {
    p_org_id: input.organization_id,
  });
  if (seqErr) throw seqErr;

  const { data: plan, error: planErr } = await sb
    .from('execution_plans')
    .insert({
      plan_number:         planNumber,
      organization_id:     input.organization_id,
      status:              'ready',
      origin:              input.origin ?? 'customer_orders',
      merge_score:         input.optimization?.merge_score,
      planned_vehicle_type: input.constraints.vehicle_type,
      constraints:         input.constraints,
    })
    .select('id')
    .single();
  if (planErr) throw planErr;

  const stopRows = input.stops.map(s => ({
    organization_id:  input.organization_id,
    execution_plan_id: plan.id,
    stop_type:         s.stop_type,
    warehouse_id:      s.warehouse_id,
    sequence:          s.sequence,
    label:             s.label,
    contact_name:      s.contact_name,
    contact_phone:     s.contact_phone,
    pod_required:      s.pod_required ?? (s.stop_type === 'drop'),
  }));
  const { data: createdStops, error: stopErr } = await sb
    .from('execution_plan_stops')
    .insert(stopRows)
    .select('id');
  if (stopErr) throw stopErr;

  const stopIds = (createdStops as { id: string }[]).map(s => s.id);
  if (input.allocations.length > 0) {
    const allocRows = input.allocations.map(a => ({
      organization_id:     input.organization_id,
      execution_plan_id:   plan.id,
      sales_order_line_id: a.sales_order_line_id,
      pickup_stop_id:      stopIds[a.pickup_stop_id_index],
      drop_stop_id:        stopIds[a.drop_stop_id_index],
      quantity:            a.quantity,
      weight_kg:           a.weight_kg ?? 0,
      volume_m3:           a.volume_m3 ?? 0,
    }));
    const { error: allocErr } = await sb.from('shipment_allocations').insert(allocRows);
    if (allocErr) throw allocErr;
  }

  const { data: full, error: fetchErr } = await sb
    .from('execution_plans')
    .select(PLAN_SELECT)
    .eq('id', plan.id)
    .single();
  if (fetchErr) throw fetchErr;

  const { data: allocs } = await sb
    .from('shipment_allocations')
    .select('id,execution_plan_id,sales_order_line_id,pickup_stop_id,drop_stop_id,quantity,weight_kg,volume_m3')
    .eq('execution_plan_id', plan.id);

  return planRowToExecutionPlan(full as unknown as PlanRow, (allocs as AllocationRow[]) ?? []);
}

export async function publishExecutionPlan(planId: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase not configured');
  const { error } = await sb
    .from('execution_plans')
    .update({
      status:       'published',
      published_at: new Date().toISOString(),
      updated_at:   new Date().toISOString(),
    })
    .eq('id', planId);
  if (error) throw error;
}

export async function updatePlanStatus(
  planId: string,
  status: PlanStatus,
  patch?: { correlation_id?: string; lifecycle_stage?: string },
): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase not configured');
  const { error } = await sb
    .from('execution_plans')
    .update({ status, ...patch, updated_at: new Date().toISOString() })
    .eq('id', planId);
  if (error) throw error;
}
