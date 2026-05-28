export interface VehicleEconomicsInput {
  vehicleId: string;
  vehicleLabel: string;
  distanceKm: number;
  loadedDistanceKm: number;
  fuelSpendInr: number;
  maintenanceSpendInr: number;
  tollSpendInr: number;
  idleHours: number;
  activeTripCount: number;
}

export interface VehicleEconomicsRow {
  vehicleId: string;
  vehicleLabel: string;
  distanceKm: number;
  utilizationPct: number | null;
  fuelCostPerKm: number | null;
  maintenanceCostPerKm: number | null;
  tollCostPerKm: number | null;
  operatingRatio: number | null;
  idleCostEstimateInr: number;
  totalCostInr: number;
  efficiencyTrend: "up" | "flat" | "down";
  costVariancePct: number | null;
  expenseAnomaly: boolean;
}

function perKm(amount: number, distance: number): number | null {
  const safeDistance = Math.max(0, Number(distance) || 0);
  if (safeDistance <= 0) return null;
  return Number((Math.max(0, Number(amount) || 0) / safeDistance).toFixed(2));
}

export function buildVehicleEconomicsRows(
  rows: VehicleEconomicsInput[],
): VehicleEconomicsRow[] {
  const globalAvgCostPerKm =
    rows.reduce((sum, row) => {
      const totalCost = row.fuelSpendInr + row.maintenanceSpendInr + row.tollSpendInr;
      const cpk = perKm(totalCost, row.distanceKm);
      return sum + (cpk ?? 0);
    }, 0) / Math.max(rows.length, 1);

  return rows
    .map((row) => {
      const distanceKm = Math.max(0, Number(row.distanceKm) || 0);
      const loadedKm = Math.max(0, Number(row.loadedDistanceKm) || 0);
      const fuelSpend = Math.max(0, Number(row.fuelSpendInr) || 0);
      const maintenanceSpend = Math.max(0, Number(row.maintenanceSpendInr) || 0);
      const tollSpend = Math.max(0, Number(row.tollSpendInr) || 0);
      const totalCost = fuelSpend + maintenanceSpend + tollSpend;
      const totalCostPerKm = perKm(totalCost, distanceKm);
      const utilizationPct =
        distanceKm > 0 ? Number(((loadedKm / distanceKm) * 100).toFixed(2)) : null;
      const idleCostEstimateInr = Number(
        (Math.max(0, Number(row.idleHours) || 0) * 175).toFixed(2),
      );
      const operatingRatio =
        totalCostPerKm != null ? Number((totalCostPerKm / 100).toFixed(3)) : null;
      const variance =
        totalCostPerKm != null && globalAvgCostPerKm > 0
          ? Number(
              (((totalCostPerKm - globalAvgCostPerKm) / globalAvgCostPerKm) * 100).toFixed(
                2,
              ),
            )
          : null;
      const efficiencyTrend: "up" | "flat" | "down" =
        totalCostPerKm == null
          ? "flat"
          : totalCostPerKm < globalAvgCostPerKm * 0.9
            ? "up"
            : totalCostPerKm > globalAvgCostPerKm * 1.1
              ? "down"
              : "flat";
      return {
        vehicleId: row.vehicleId,
        vehicleLabel: row.vehicleLabel,
        distanceKm,
        utilizationPct,
        fuelCostPerKm: perKm(fuelSpend, distanceKm),
        maintenanceCostPerKm: perKm(maintenanceSpend, distanceKm),
        tollCostPerKm: perKm(tollSpend, distanceKm),
        operatingRatio,
        idleCostEstimateInr,
        totalCostInr: Number(totalCost.toFixed(2)),
        efficiencyTrend,
        costVariancePct: variance,
        expenseAnomaly:
          variance != null
            ? variance > 25 || row.activeTripCount <= 1
            : row.activeTripCount <= 1 && totalCost > 0,
      };
    })
    .sort((a, b) => b.totalCostInr - a.totalCostInr);
}
