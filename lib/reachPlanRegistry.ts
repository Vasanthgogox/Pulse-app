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

/** Deliberately no exact audience count — "reach up to N" implied a delivery
 * guarantee this product doesn't (yet) enforce. Real accounted delivery is
 * Phase 2.3 (see docs/REACH_DELIVERY_ENGINE_DESIGN.md); until then, promise
 * outcomes, not counts. */
export function describeReachPlan(_plan: {
  estimated_reach_max: number;
  audience_scope: string;
}): string {
  return 'Promote your load to relevant fleet owners and shippers across Pulse';
}
