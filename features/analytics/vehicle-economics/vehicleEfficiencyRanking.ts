import type { VehicleEconomicsRow } from "./vehicleEconomicsEngine";

export interface VehicleEfficiencyRank {
  vehicleId: string;
  vehicleLabel: string;
  score: number;
  rank: number;
}

export function rankVehiclesByEfficiency(
  rows: VehicleEconomicsRow[],
): VehicleEfficiencyRank[] {
  const scored = rows.map((row) => {
    const utilization = row.utilizationPct ?? 0;
    const operatingPenalty = (row.operatingRatio ?? 0) * 100;
    const anomalyPenalty = row.expenseAnomaly ? 18 : 0;
    const score = Number(
      Math.max(0, Math.min(100, utilization - operatingPenalty - anomalyPenalty)).toFixed(
        2,
      ),
    );
    return {
      vehicleId: row.vehicleId,
      vehicleLabel: row.vehicleLabel,
      score,
      rank: 0,
    };
  });
  return scored
    .sort((a, b) => b.score - a.score)
    .map((entry, idx) => ({ ...entry, rank: idx + 1 }));
}
