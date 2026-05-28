import type { VehiclePnLRow } from "@/features/vehicles/pnl";
import type {
  VehicleProfitabilityBreakdown,
  VehicleProfitabilityState,
} from "@/features/vehicles/pnl";

function roundCurrency(amount: number): number {
  return Math.round((Number(amount) || 0) * 100) / 100;
}

function ratio(numerator: number, denominator: number): number {
  const safeDenominator = Math.max(0, Number(denominator) || 0);
  if (safeDenominator <= 0) return 0;
  return Number((((Number(numerator) || 0) / safeDenominator) * 100).toFixed(2));
}

function deriveProfitabilityState(input: {
  revenue: number;
  netProfitability: number;
  maintenanceCost: number;
  operationalCost: number;
  ownershipCost: number;
  trips: number;
}): VehicleProfitabilityState {
  if (input.trips <= 0 && input.ownershipCost > 0) return "idle";
  if (input.revenue <= 0 && input.ownershipCost > 0) return "idle";
  if (input.netProfitability < 0) return "negative";
  if (input.maintenanceCost > 0 && input.maintenanceCost >= Math.max(0, input.operationalCost * 0.6)) {
    return "high_maintenance";
  }
  const marginPct = ratio(input.netProfitability, Math.max(1, input.revenue));
  if (marginPct < 12) return "low_margin";
  return "healthy";
}

export function selectVehicleProfitabilityBreakdown(
  row: VehiclePnLRow,
): VehicleProfitabilityBreakdown {
  const revenue = Math.max(0, Number(row.sales) || 0);
  const operationalCost = Math.max(0, Number(row.operationalExpense ?? row.expense) || 0);
  const ownershipCost = Math.max(0, Number(row.ownershipExpense ?? 0) || 0);
  const maintenanceCost = Math.max(0, Number(row.maintenanceExpense ?? 0) || 0);
  const allocatedCost = Math.max(0, Number(row.allocatedCost ?? 0) || 0);
  const unallocatedCost = Math.max(0, Number(row.unallocatedCost ?? 0) || 0);
  const outstandingPayables = Math.max(0, Number(row.outstandingPayables ?? 0) || 0);
  const netProfitability = roundCurrency(
    revenue - operationalCost - ownershipCost - outstandingPayables,
  );
  const allocationEfficiency = Math.min(100, Math.max(0, Number(row.allocationEfficiency ?? ratio(allocatedCost, ownershipCost))));
  return {
    vehicleId: row.id,
    revenue,
    operationalCost,
    ownershipCost,
    maintenanceCost,
    allocatedCost,
    unallocatedCost,
    outstandingPayables,
    netProfitability,
    profitabilityState: deriveProfitabilityState({
      revenue,
      netProfitability,
      maintenanceCost,
      operationalCost,
      ownershipCost,
      trips: row.trips,
    }),
    allocationEfficiency,
  };
}

export function selectVehicleOperationalMargin(
  breakdown: VehicleProfitabilityBreakdown,
): number {
  return ratio(
    breakdown.revenue - breakdown.operationalCost,
    Math.max(1, breakdown.revenue),
  );
}

export function selectVehicleOwnershipBurden(
  breakdown: VehicleProfitabilityBreakdown,
): number {
  return ratio(breakdown.ownershipCost, Math.max(1, breakdown.revenue));
}

export function selectVehicleAllocationExposure(
  breakdown: VehicleProfitabilityBreakdown,
): {
  allocatedCost: number;
  unallocatedCost: number;
  allocationEfficiency: number;
} {
  return {
    allocatedCost: breakdown.allocatedCost,
    unallocatedCost: breakdown.unallocatedCost,
    allocationEfficiency: breakdown.allocationEfficiency,
  };
}

export function selectVehicleIdleAssetExposure(
  breakdown: VehicleProfitabilityBreakdown,
): number {
  if (breakdown.revenue > 0) return 0;
  return roundCurrency(
    breakdown.ownershipCost + breakdown.outstandingPayables + breakdown.unallocatedCost,
  );
}

export function selectVehicleMaintenanceIntensity(
  breakdown: VehicleProfitabilityBreakdown,
): {
  maintenanceToRevenuePct: number;
  maintenanceToOperationalPct: number;
} {
  return {
    maintenanceToRevenuePct: ratio(
      breakdown.maintenanceCost,
      Math.max(1, breakdown.revenue),
    ),
    maintenanceToOperationalPct: ratio(
      breakdown.maintenanceCost,
      Math.max(1, breakdown.operationalCost),
    ),
  };
}

export function selectFleetProfitabilitySummary(
  rows: VehiclePnLRow[],
): {
  totalRevenue: number;
  totalOperationalCost: number;
  totalOwnershipCost: number;
  totalOutstandingPayables: number;
  totalUnallocatedCost: number;
  totalNetProfitability: number;
  healthy: number;
  lowMargin: number;
  negative: number;
  idle: number;
  highMaintenance: number;
  telemetry: string[];
} {
  const breakdowns = rows.map(selectVehicleProfitabilityBreakdown);
  const totalRevenue = roundCurrency(
    breakdowns.reduce((sum, breakdown) => sum + breakdown.revenue, 0),
  );
  const totalOperationalCost = roundCurrency(
    breakdowns.reduce((sum, breakdown) => sum + breakdown.operationalCost, 0),
  );
  const totalOwnershipCost = roundCurrency(
    breakdowns.reduce((sum, breakdown) => sum + breakdown.ownershipCost, 0),
  );
  const totalOutstandingPayables = roundCurrency(
    breakdowns.reduce((sum, breakdown) => sum + breakdown.outstandingPayables, 0),
  );
  const totalUnallocatedCost = roundCurrency(
    breakdowns.reduce((sum, breakdown) => sum + breakdown.unallocatedCost, 0),
  );
  const totalNetProfitability = roundCurrency(
    breakdowns.reduce((sum, breakdown) => sum + breakdown.netProfitability, 0),
  );
  const stateCount = {
    healthy: breakdowns.filter((item) => item.profitabilityState === "healthy").length,
    low_margin: breakdowns.filter((item) => item.profitabilityState === "low_margin").length,
    negative: breakdowns.filter((item) => item.profitabilityState === "negative").length,
    idle: breakdowns.filter((item) => item.profitabilityState === "idle").length,
    high_maintenance: breakdowns.filter((item) => item.profitabilityState === "high_maintenance").length,
  };
  const telemetry: string[] = [];
  if (stateCount.healthy > 0) telemetry.push("Healthy Margin");
  if (stateCount.negative > 0) telemetry.push("Negative Margin");
  if (stateCount.idle > 0) telemetry.push("Idle Asset Risk");
  if (stateCount.high_maintenance > 0) telemetry.push("Maintenance Escalating");
  if (totalOwnershipCost > totalOperationalCost && totalOwnershipCost > 0) {
    telemetry.push("Ownership Heavy");
  }
  if (totalUnallocatedCost > 0) telemetry.push("Allocation Pending");
  return {
    totalRevenue,
    totalOperationalCost,
    totalOwnershipCost,
    totalOutstandingPayables,
    totalUnallocatedCost,
    totalNetProfitability,
    healthy: stateCount.healthy,
    lowMargin: stateCount.low_margin,
    negative: stateCount.negative,
    idle: stateCount.idle,
    highMaintenance: stateCount.high_maintenance,
    telemetry,
  };
}
