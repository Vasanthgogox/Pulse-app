/**
 * Pulse Reach — plan display metadata.
 *
 * Price, name, and estimated reach are DB-driven (`reach_plans` table,
 * editable from Control Tower) — never hardcoded here. This file only holds
 * static per-code icon/color (never shown as copy) plus a helper that
 * describes reach from the plan row itself ("Reach up to N verified fleet
 * owners"), so the number is never duplicated between DB and client.
 */

export type ReachPlanCode = 'basic' | 'boost' | 'max';

export interface ReachPlanDisplayMeta {
  code: ReachPlanCode;
  icon: string;   // lucide-react-native icon name
  color: string;
}

export const REACH_PLAN_DISPLAY: Record<ReachPlanCode, ReachPlanDisplayMeta> = {
  basic: { code: 'basic', icon: 'Rocket', color: '#4D3636' },
  boost: { code: 'boost', icon: 'Zap',    color: '#d97706' },
  max:   { code: 'max',   icon: 'Flame',  color: '#E82127' },
};

export function getReachPlanDisplay(code: string): ReachPlanDisplayMeta | undefined {
  return REACH_PLAN_DISPLAY[code as ReachPlanCode];
}

/** "Reach up to 25 verified fleet owners" — driven by the plan row, not restated in code. */
export function describeReachPlan(plan: {
  estimated_reach_max: number;
  audience_scope: string;
}): string {
  const audience = plan.audience_scope.replace(/_/g, ' ');
  return `Reach up to ${plan.estimated_reach_max} ${audience}`;
}
