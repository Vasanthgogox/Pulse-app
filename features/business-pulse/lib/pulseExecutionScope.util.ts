import type { PulseFilterState } from "@/features/business-pulse/types";

export type ExecutionScope = "all" | "asset" | "aggregate";

export function executionScopeFromFilters(filters: PulseFilterState): ExecutionScope {
  const models = filters.executionModels;
  if (models.length === 0) return "all";
  if (models.includes("asset") && !models.includes("aggregate")) return "asset";
  if (models.includes("aggregate") && !models.includes("asset")) return "aggregate";
  return "all";
}

export function executionModelsForScope(
  scope: ExecutionScope,
): PulseFilterState["executionModels"] {
  if (scope === "all") return [];
  return [scope];
}

export function executionScopeLabel(scope: ExecutionScope): string {
  if (scope === "asset") return "Asset";
  if (scope === "aggregate") return "Aggregate";
  return "All models";
}
