import type { IndentRow } from "@/features/indents";
import {
  summarizeStopsByType,
  type StopLocationInput,
} from "@/lib/platform/orchestration/summarizeStopLocations";

export type PlanStopLocationRow = {
  execution_plan_id: string;
  stop_type: string | null;
  label: string | null;
  city: string | null;
  state: string | null;
  address_line: string | null;
  warehouse?:
    | {
        name?: string | null;
        address?: string | null;
        city?: string | null;
        state?: string | null;
      }
    | {
        name?: string | null;
        address?: string | null;
        city?: string | null;
        state?: string | null;
      }[]
    | null;
};

export type ExecutionPlanRouteSummary = {
  pickup: string;
  drop: string;
};

function firstWarehouse(
  warehouse: PlanStopLocationRow["warehouse"],
): {
  address?: string | null;
  city?: string | null;
  state?: string | null;
} | null {
  if (!warehouse) return null;
  return Array.isArray(warehouse) ? (warehouse[0] ?? null) : warehouse;
}

export function planStopToLocationInput(row: PlanStopLocationRow): StopLocationInput | null {
  const type = row.stop_type === "pickup" || row.stop_type === "drop" ? row.stop_type : null;
  if (!type) return null;
  const warehouse = firstWarehouse(row.warehouse);
  return {
    type,
    label: row.label,
    address: {
      line1: row.address_line || warehouse?.address || null,
      city: row.city || warehouse?.city || null,
      state: row.state || warehouse?.state || null,
    },
  };
}

export function groupPlanStopsToRouteSummaries(
  rows: PlanStopLocationRow[],
): Record<string, ExecutionPlanRouteSummary> {
  const byPlan = new Map<string, StopLocationInput[]>();
  for (const row of rows) {
    const mapped = planStopToLocationInput(row);
    if (!mapped) continue;
    const planId = String(row.execution_plan_id ?? "").trim();
    if (!planId) continue;
    const list = byPlan.get(planId) ?? [];
    list.push(mapped);
    byPlan.set(planId, list);
  }

  const out: Record<string, ExecutionPlanRouteSummary> = {};
  for (const [planId, stops] of byPlan) {
    out[planId] = {
      pickup: summarizeStopsByType(stops, "pickup"),
      drop: summarizeStopsByType(stops, "drop"),
    };
  }
  return out;
}

export function indentDisplayOriginDest(
  load: Pick<IndentRow, "pickup_area" | "drop_location"> & {
    execution_plan_id?: unknown;
  },
  byPlanId: Record<string, ExecutionPlanRouteSummary> | undefined,
): { origin: string; dest: string } {
  const planId =
    typeof load.execution_plan_id === "string" ? load.execution_plan_id.trim() : "";
  const overlay = planId ? byPlanId?.[planId] : undefined;
  return {
    origin: overlay?.pickup || load.pickup_area || "—",
    dest: overlay?.drop || load.drop_location || "—",
  };
}
