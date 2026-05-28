import type { TripMileageMetrics } from "@/features/trips/operations/mileage/mileageEngine";
import type { ReimbursementState } from "@/features/trips/operations/types";

export interface OperationsDerivedMetrics {
  fuelEfficiencyKmPerLiter: number | null;
  maintenanceCostPerKm: number | null;
  operationalUtilizationPct: number | null;
  reimbursementPendingAmountInr: number;
  tollSpendPerKm: number | null;
  dryRunRatioPct: number | null;
  trustCompletionPct: number | null;
  approvalTurnaroundMinutes: number | null;
  postingRetryRatePct: number | null;
}

export function buildOperationsDerivedMetrics(input: {
  mileage: TripMileageMetrics;
  reimbursementStates: Array<{
    amountInr: number;
    state: ReimbursementState | null | undefined;
  }>;
  totalPostingRetries: number;
  totalPostingAttempts: number;
  trustChecksCompleted: number;
  trustChecksTotal: number;
  approvalTurnaroundMinutes: number | null;
}): OperationsDerivedMetrics {
  const distanceKm = Number(input.mileage.distanceKm ?? 0);
  const pendingReimbursement = input.reimbursementStates
    .filter((row) =>
      row.state === "reported" ||
      row.state === "approved" ||
      row.state === "reimbursement_pending",
    )
    .reduce((sum, row) => sum + Math.max(0, Number(row.amountInr) || 0), 0);
  const utilizationPct =
    distanceKm > 0
      ? Number(
          (((input.mileage.loadedMileageKm ?? 0) / Math.max(distanceKm, 1)) * 100).toFixed(2),
        )
      : null;
  const dryRunRatioPct =
    distanceKm > 0
      ? Number(
          (((input.mileage.dryRunMileageKm ?? 0) / Math.max(distanceKm, 1)) * 100).toFixed(2),
        )
      : null;
  const trustCompletionPct =
    input.trustChecksTotal > 0
      ? Number(((input.trustChecksCompleted / input.trustChecksTotal) * 100).toFixed(2))
      : null;
  const postingRetryRatePct =
    input.totalPostingAttempts > 0
      ? Number(((input.totalPostingRetries / input.totalPostingAttempts) * 100).toFixed(2))
      : null;
  return {
    fuelEfficiencyKmPerLiter: input.mileage.kmPerLiter,
    maintenanceCostPerKm:
      distanceKm > 0
        ? Number(((input.mileage.totalMaintenanceSpendInr ?? 0) / distanceKm).toFixed(2))
        : null,
    operationalUtilizationPct: utilizationPct,
    reimbursementPendingAmountInr: Math.round(pendingReimbursement * 100) / 100,
    tollSpendPerKm:
      distanceKm > 0
        ? Number(((input.mileage.totalTollSpendInr ?? 0) / distanceKm).toFixed(2))
        : null,
    dryRunRatioPct,
    trustCompletionPct,
    approvalTurnaroundMinutes: input.approvalTurnaroundMinutes,
    postingRetryRatePct,
  };
}
