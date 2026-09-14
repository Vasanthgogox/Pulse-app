import { supabase } from "@/lib/supabase";
import {
  groupPlanStopsToRouteSummaries,
  type ExecutionPlanRouteSummary,
  type PlanStopLocationRow,
} from "@/features/network/utils/executionPlanRouteSummary";

export async function fetchExecutionPlanRouteSummaries(
  planIds: string[],
): Promise<Record<string, ExecutionPlanRouteSummary>> {
  const ids = [...new Set(planIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) return {};

  const { data, error } = await supabase()
    .from("execution_plan_stops")
    .select(
      "execution_plan_id, stop_type, sequence, label, city, state, address_line, latitude, longitude, warehouse:client_warehouses(city, state, address, name)",
    )
    .in("execution_plan_id", ids)
    .order("sequence", { ascending: true });

  if (error) throw new Error(error.message);
  return groupPlanStopsToRouteSummaries((data ?? []) as PlanStopLocationRow[]);
}
