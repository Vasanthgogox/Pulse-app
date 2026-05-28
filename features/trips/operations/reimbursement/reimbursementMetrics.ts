import type { EnterpriseReimbursementState } from "./reimbursementEngine";

export interface ReimbursementMetricInput {
  amountInr: number;
  state: EnterpriseReimbursementState;
}

export interface ReimbursementMetrics {
  pendingCount: number;
  pendingAmountInr: number;
  approvedCount: number;
  reimbursedCount: number;
  rejectedCount: number;
  disputedCount: number;
}

export function buildReimbursementMetrics(
  entries: ReimbursementMetricInput[],
): ReimbursementMetrics {
  let pendingCount = 0;
  let pendingAmountInr = 0;
  let approvedCount = 0;
  let reimbursedCount = 0;
  let rejectedCount = 0;
  let disputedCount = 0;
  for (const entry of entries) {
    if (entry.state === "pending_review") {
      pendingCount += 1;
      pendingAmountInr += Math.max(0, Number(entry.amountInr) || 0);
    } else if (entry.state === "approved") {
      approvedCount += 1;
    } else if (entry.state === "reimbursed") {
      reimbursedCount += 1;
    } else if (entry.state === "rejected") {
      rejectedCount += 1;
    } else if (entry.state === "disputed") {
      disputedCount += 1;
    }
  }
  return {
    pendingCount,
    pendingAmountInr: Math.round(pendingAmountInr * 100) / 100,
    approvedCount,
    reimbursedCount,
    rejectedCount,
    disputedCount,
  };
}
