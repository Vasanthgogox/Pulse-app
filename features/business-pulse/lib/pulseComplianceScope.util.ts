import type { PulseComplianceState, PulseFilterState } from "@/features/business-pulse/types";

export type ComplianceScope = "all" | PulseComplianceState;

export function complianceScopeFromFilters(filters: PulseFilterState): ComplianceScope {
  if (filters.complianceStates.length !== 1) return "all";
  return filters.complianceStates[0];
}

export function complianceStatesForScope(
  scope: ComplianceScope,
): PulseFilterState["complianceStates"] {
  if (scope === "all") return [];
  return [scope];
}

const COMPLIANCE_SHORT: Record<PulseComplianceState, string> = {
  healthy: "Healthy",
  expiring_soon: "Expiring",
  critical: "Critical",
  missing: "Missing",
};

export function complianceTabLabel(state: PulseComplianceState, sharePct?: number): string {
  const base = COMPLIANCE_SHORT[state] ?? state;
  if (sharePct == null) return base;
  return `${base} ${sharePct}%`;
}
