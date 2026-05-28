import type { TripMileageMetrics } from "../mileage/mileageEngine";

export interface OperationsDisplayMetrics {
  efficiencyLabel: string;
  fuelCostPerKmLabel: string;
  totalOpsSpendLabel: string;
}

function fmtCurrency(value: number): string {
  return `₹${Math.round(value).toLocaleString("en-IN")}`;
}

function fmtNumber(value: number, maxFractionDigits = 2): string {
  return value.toLocaleString("en-IN", { maximumFractionDigits: maxFractionDigits });
}

export function toOperationsDisplayMetrics(
  metrics: TripMileageMetrics,
): OperationsDisplayMetrics {
  const efficiencyLabel =
    metrics.kmPerLiter == null ? "—" : `${fmtNumber(metrics.kmPerLiter)} KM/L`;
  const fuelCostPerKmLabel =
    metrics.fuelCostPerKm == null ? "—" : `${fmtCurrency(metrics.fuelCostPerKm)}/KM`;
  const totalOpsSpendLabel = fmtCurrency(
    metrics.totalFuelSpendInr + metrics.totalTollSpendInr,
  );
  return { efficiencyLabel, fuelCostPerKmLabel, totalOpsSpendLabel };
}
