import type { VehicleEconomicsRow } from "./vehicleEconomicsEngine";

export interface VehicleProfitabilitySnapshot {
  totalVehicleCount: number;
  avgFuelCostPerKm: number | null;
  avgMaintenanceCostPerKm: number | null;
  avgTollCostPerKm: number | null;
  avgOperatingRatio: number | null;
  anomalyCount: number;
}

function avg(values: Array<number | null>): number | null {
  const filtered = values.filter((value): value is number => value != null);
  if (filtered.length === 0) return null;
  return Number(
    (filtered.reduce((sum, value) => sum + value, 0) / filtered.length).toFixed(2),
  );
}

export function buildVehicleProfitabilitySnapshot(
  rows: VehicleEconomicsRow[],
): VehicleProfitabilitySnapshot {
  return {
    totalVehicleCount: rows.length,
    avgFuelCostPerKm: avg(rows.map((row) => row.fuelCostPerKm)),
    avgMaintenanceCostPerKm: avg(rows.map((row) => row.maintenanceCostPerKm)),
    avgTollCostPerKm: avg(rows.map((row) => row.tollCostPerKm)),
    avgOperatingRatio: avg(rows.map((row) => row.operatingRatio)),
    anomalyCount: rows.filter((row) => row.expenseAnomaly).length,
  };
}
