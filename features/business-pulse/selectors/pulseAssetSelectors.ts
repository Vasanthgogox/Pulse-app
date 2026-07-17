import { computeDriverCommissionForTrip } from "@/features/finance/aggregation/aggregateDrivers";
import { isAssetExecutionTrip } from "@/features/trips/domain/tripExecutionModel";
import type { DriverRow } from "@/features/drivers/services/drivers.service";
import { buildVehiclePnLRows } from "./pulseSelectors";
import type { PulseDataset, PulseFilterState } from "../types";
import { applyPulseFiltersAssetOnly, type PulseScopedData } from "../lib/pulseDomainScope.util";
import { selectVehicleProfitabilityBreakdown } from "@/features/fleet";

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function driverOffer(driver: DriverRow) {
  return {
    payableAmount: driver.payable_amount ?? null,
    commissionPercent: driver.commission_percent ?? null,
    commissionPerKm: driver.commission_per_km ?? null,
  };
}

function toSettlementState(row: {
  posting_state?: string | null;
  reimbursement_state?: string | null;
  payment_owner?: string | null;
}): "healthy" | "attention" | "critical" {
  const paymentOwner = String(row.payment_owner ?? "").toLowerCase();
  const posting = String(row.posting_state ?? "").toLowerCase();
  const reimbursement = String(row.reimbursement_state ?? "").toLowerCase();
  if (paymentOwner !== "driver") return "healthy";
  if (posting !== "posted") return "attention";
  if (reimbursement === "reimbursed") return "healthy";
  if (!reimbursement) return "critical";
  return "attention";
}

export type AssetFleetSummary = {
  assetTripCount: number;
  activeVehicles: number;
  activeDrivers: number;
  totalRevenue: number;
  totalOperationalCost: number;
  totalOwnershipCost: number;
  totalMaintenanceCost: number;
  totalSettlementExposure: number;
  netFleetPnL: number;
};

export type AssetVehicleRow = {
  vehicleId: string;
  tripCount: number;
  revenue: number;
  operationalCost: number;
  ownershipCost: number;
  maintenanceCost: number;
  netProfitability: number;
  profitabilityState: string;
  operatorNames: string[];
};

export type AssetDriverPayrollRow = {
  driverId: string;
  driverName: string;
  tripCount: number;
  revenue: number;
  commissionDue: number;
  monthlySalary: number | null;
  settlementExposure: number;
  payableTotal: number;
  vehicleLabels: string[];
};

function settlementExposureForTrips(scoped: PulseScopedData, tripIds: Set<string>): number {
  let total = 0;
  for (const row of [...scoped.fuelRows, ...scoped.tollRows]) {
    if (!tripIds.has(row.trip_id)) continue;
    if (toSettlementState(row) === "healthy") continue;
    total += Math.max(0, toNumber(row.amount_inr));
  }
  return Number(total.toFixed(2));
}

export function selectAssetFleetSummary(
  dataset: PulseDataset,
  filters: PulseFilterState,
): AssetFleetSummary {
  const scoped = applyPulseFiltersAssetOnly(dataset, filters);
  const tripIds = new Set(scoped.trips.map((trip) => trip.id));
  const vehicleRows = buildVehiclePnLRows(scoped, tripIds);
  const breakdowns = vehicleRows.map((row) => ({
    pnl: row,
    breakdown: selectVehicleProfitabilityBreakdown(row),
  }));

  const totalRevenue = breakdowns.reduce((sum, row) => sum + row.breakdown.revenue, 0);
  const totalOperationalCost = breakdowns.reduce((sum, row) => sum + row.breakdown.operationalCost, 0);
  const totalOwnershipCost = breakdowns.reduce((sum, row) => sum + row.breakdown.ownershipCost, 0);
  const totalMaintenanceCost = breakdowns.reduce((sum, row) => sum + row.breakdown.maintenanceCost, 0);
  const netFleetPnL = breakdowns.reduce((sum, row) => sum + row.breakdown.netProfitability, 0);

  const driverIds = new Set(
    scoped.trips.map((trip) => String(trip.driver_id ?? "")).filter(Boolean),
  );

  return {
    assetTripCount: scoped.trips.length,
    activeVehicles: breakdowns.filter((row) => row.pnl.trips > 0).length,
    activeDrivers: driverIds.size,
    totalRevenue: Number(totalRevenue.toFixed(2)),
    totalOperationalCost: Number(totalOperationalCost.toFixed(2)),
    totalOwnershipCost: Number(totalOwnershipCost.toFixed(2)),
    totalMaintenanceCost: Number(totalMaintenanceCost.toFixed(2)),
    totalSettlementExposure: settlementExposureForTrips(scoped, tripIds),
    netFleetPnL: Number(netFleetPnL.toFixed(2)),
  };
}

export function selectAssetFleetVehicles(
  dataset: PulseDataset,
  filters: PulseFilterState,
  driverNameById: Map<string, string>,
): AssetVehicleRow[] {
  const scoped = applyPulseFiltersAssetOnly(dataset, filters);
  const tripIds = new Set(scoped.trips.map((trip) => trip.id));
  const operatorsByVehicle = new Map<string, Set<string>>();

  for (const trip of scoped.trips) {
    const vehicleId = String(trip.vehicle_id ?? "");
    const driverId = String(trip.driver_id ?? "");
    if (!vehicleId || !driverId) continue;
    const names = operatorsByVehicle.get(vehicleId) ?? new Set<string>();
    const name = driverNameById.get(driverId);
    if (name) names.add(name);
    operatorsByVehicle.set(vehicleId, names);
  }

  return buildVehiclePnLRows(scoped, tripIds)
    .map((row) => ({ pnl: row, breakdown: selectVehicleProfitabilityBreakdown(row) }))
    .filter(({ pnl }) => pnl.trips > 0)
    .map(({ pnl, breakdown }) => ({
      vehicleId: breakdown.vehicleId,
      tripCount: pnl.trips,
      revenue: breakdown.revenue,
      operationalCost: breakdown.operationalCost,
      ownershipCost: breakdown.ownershipCost,
      maintenanceCost: breakdown.maintenanceCost,
      netProfitability: breakdown.netProfitability,
      profitabilityState: breakdown.profitabilityState,
      operatorNames: Array.from(operatorsByVehicle.get(breakdown.vehicleId) ?? []).slice(0, 3),
    }))
    .sort((a, b) => b.netProfitability - a.netProfitability);
}

export function selectAssetDriverPayroll(
  dataset: PulseDataset,
  filters: PulseFilterState,
  vehicleLabelById: Map<string, string>,
): AssetDriverPayrollRow[] {
  const scoped = applyPulseFiltersAssetOnly(dataset, filters);
  const driversById = new Map(scoped.drivers.map((driver) => [driver.id, driver]));
  const tripToDriver = new Map<string, string>();

  const byDriver = new Map<
    string,
    {
      tripCount: number;
      revenue: number;
      commissionDue: number;
      vehicleIds: Set<string>;
    }
  >();

  for (const trip of scoped.trips) {
    if (!isAssetExecutionTrip(trip)) continue;
    const driverId = String(trip.driver_id ?? "");
    if (!driverId) continue;
    tripToDriver.set(trip.id, driverId);
    const driver = driversById.get(driverId);
    if (!driver) continue;

    const row = byDriver.get(driverId) ?? {
      tripCount: 0,
      revenue: 0,
      commissionDue: 0,
      vehicleIds: new Set<string>(),
    };
    row.tripCount += 1;
    row.revenue += Math.max(0, toNumber(trip.client_price));
    row.commissionDue += computeDriverCommissionForTrip(trip, driverOffer(driver));
    if (trip.vehicle_id) row.vehicleIds.add(String(trip.vehicle_id));
    byDriver.set(driverId, row);
  }

  const settlementByDriver = new Map<string, number>();
  for (const row of [...scoped.fuelRows, ...scoped.tollRows]) {
    const driverId = tripToDriver.get(row.trip_id);
    if (!driverId) continue;
    if (toSettlementState(row) === "healthy") continue;
    settlementByDriver.set(
      driverId,
      (settlementByDriver.get(driverId) ?? 0) + Math.max(0, toNumber(row.amount_inr)),
    );
  }

  return Array.from(byDriver.entries())
    .map(([driverId, metric]) => {
      const driver = driversById.get(driverId);
      const monthlySalary =
        driver?.payable_amount != null && Number(driver.payable_amount) > 0
          ? Number(driver.payable_amount)
          : null;
      const settlementExposure = Number((settlementByDriver.get(driverId) ?? 0).toFixed(2));
      const commissionDue = Number(metric.commissionDue.toFixed(2));
      const payableTotal = Number((commissionDue + settlementExposure).toFixed(2));

      return {
        driverId,
        driverName: driver?.name ?? "Driver",
        tripCount: metric.tripCount,
        revenue: Number(metric.revenue.toFixed(2)),
        commissionDue,
        monthlySalary,
        settlementExposure,
        payableTotal,
        vehicleLabels: Array.from(metric.vehicleIds)
          .map((id) => vehicleLabelById.get(id) ?? id)
          .slice(0, 3),
      };
    })
    .filter((row) => row.tripCount > 0)
    .sort((a, b) => b.payableTotal - a.payableTotal);
}
