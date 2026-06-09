import { aggregateCustomers } from "@/features/finance/aggregation/aggregateCustomers";
import { aggregateDrivers } from "@/features/finance/aggregation/aggregateDrivers";
import { aggregateSuppliers } from "@/features/finance/aggregation/aggregateSuppliers";
import type { DriverRow } from "@/features/drivers/services/drivers.service";
import type { ClientRow } from "@/features/clients/services/clients.service";
import type { SupplierRow } from "@/features/suppliers/services/suppliers.service";
import type { LedgerTx } from "@/features/finance/aggregation/types";
import {
  getMonthKeys,
  monthsForRange,
  type SalesDateRange,
} from "@/features/network/utils/connectionSalesAnalytics.util";
import type { NetworkOrgGoals } from "@/features/network/services/networkGoalsStorage.service";
import { isAssetExecutionTrip } from "@/features/trips/domain/tripExecutionModel";
import type { TripRow } from "@/features/trips/services/trips.service";
import type { VehicleRow } from "@/features/vehicles/services/vehicles.service";

export type GoalDimension = "client" | "supplier" | "vehicle" | "driver";

export type GoalsActuals = {
  clientSales: number;
  supplierCost: number;
  vehicleTrips: number;
  driverTrips: number;
};

export type PayableReceivableSnapshot = {
  receivableDue: number;
  receivableBilled: number;
  receivableCollected: number;
  supplierPayable: number;
  supplierPaid: number;
  driverPayable: number;
  driverPaid: number;
  totalPayable: number;
  netPosition: number;
};

export type GoalTargetRow = {
  id: string;
  dimension: GoalDimension;
  label: string;
  subtitle: string;
  actual: number;
  target: number;
  progressPct: number;
  unit: "inr" | "trips";
  status: "on_track" | "behind" | "unset";
};

const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

function monthLabelShort(monthKey: string): string {
  const [, m] = monthKey.split("-");
  const idx = parseInt(m, 10) - 1;
  const y = monthKey.split("-")[0]?.slice(2) ?? "";
  return `${MONTH_SHORT[idx] ?? m} '${y}`;
}

function tripMonthKey(trip: TripRow): string | null {
  const raw = trip.pickup_date ?? trip.completed_at ?? trip.created_at;
  if (!raw) return null;
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function tripInDateRange(trip: TripRow, dateRange: SalesDateRange): boolean {
  const monthKey = tripMonthKey(trip);
  if (!monthKey) return dateRange === "all";
  const keys = getMonthKeys(monthsForRange(dateRange));
  return keys.includes(monthKey);
}

function tripsInRange(trips: readonly TripRow[], dateRange: SalesDateRange): TripRow[] {
  return trips.filter((trip) => tripInDateRange(trip, dateRange));
}

function progressPct(actual: number, target: number): number {
  if (target <= 0) return 0;
  return Math.min(100, Math.round((actual / target) * 100));
}

function goalStatus(
  actual: number,
  target: number,
): GoalTargetRow["status"] {
  if (target <= 0) return "unset";
  return actual >= target * 0.85 ? "on_track" : "behind";
}

export function computeGoalsActuals(
  trips: readonly TripRow[],
  dateRange: SalesDateRange,
): GoalsActuals {
  const rows = tripsInRange(trips, dateRange);
  let clientSales = 0;
  let supplierCost = 0;
  let vehicleTrips = 0;
  let driverTrips = 0;

  for (const trip of rows) {
    const sales = Number(trip.client_price);
    const cost = Number(trip.supplier_rate);
    if (Number.isFinite(sales)) clientSales += Math.max(0, sales);
    if (Number.isFinite(cost)) supplierCost += Math.max(0, cost);
    if (trip.vehicle_id && isAssetExecutionTrip(trip)) vehicleTrips += 1;
    if (trip.driver_id && isAssetExecutionTrip(trip)) driverTrips += 1;
  }

  return { clientSales, supplierCost, vehicleTrips, driverTrips };
}

export function computePayableReceivableSnapshot(
  clients: readonly ClientRow[],
  suppliers: readonly SupplierRow[],
  drivers: readonly DriverRow[],
  trips: readonly TripRow[],
  transactions: readonly LedgerTx[],
): PayableReceivableSnapshot {
  const customerAgg = aggregateCustomers(clients, trips, transactions);
  const supplierAgg = aggregateSuppliers(suppliers, trips, transactions);
  const driverAgg = aggregateDrivers(drivers, trips, transactions);

  let receivableBilled = 0;
  let receivableCollected = 0;
  for (const row of customerAgg.rows) {
    receivableBilled += Number(row.billed ?? 0);
    receivableCollected += Number(row.received ?? 0);
  }

  let supplierPayable = 0;
  let supplierPaid = 0;
  for (const row of supplierAgg.rows) {
    supplierPayable += Number(row.payables ?? row.due ?? 0);
    supplierPaid += Number(row.paid ?? 0);
  }

  let driverPayable = 0;
  let driverPaid = 0;
  for (const row of driverAgg.rows) {
    driverPayable += Number(row.due ?? row.pending ?? 0);
    driverPaid += Number(row.paid ?? 0);
  }

  const receivableDue = customerAgg.totals.totalOut;
  const totalPayable = supplierAgg.totals.totalOut + driverAgg.totals.totalOut;

  return {
    receivableDue,
    receivableBilled,
    receivableCollected,
    supplierPayable,
    supplierPaid,
    driverPayable,
    driverPaid,
    totalPayable,
    netPosition: receivableDue - totalPayable,
  };
}

export type BalanceTrendPoint = {
  monthKey: string;
  label: string;
  receivable: number;
  payable: number;
};

export function buildBalanceTrendPoints(
  trips: readonly TripRow[],
  dateRange: SalesDateRange,
): BalanceTrendPoint[] {
  const keys = getMonthKeys(monthsForRange(dateRange));
  return keys.map((key) => {
    let receivable = 0;
    let payable = 0;
    for (const trip of trips) {
      if (tripMonthKey(trip) !== key) continue;
      const sales = Number(trip.client_price);
      const cost = Number(trip.supplier_rate);
      if (Number.isFinite(sales)) receivable += Math.max(0, sales);
      if (Number.isFinite(cost)) payable += Math.max(0, cost);
    }
    return {
      monthKey: key,
      label: monthLabelShort(key),
      receivable,
      payable,
    };
  });
}

export function buildGoalSummaryRows(
  goals: NetworkOrgGoals,
  actuals: GoalsActuals,
): GoalTargetRow[] {
  return [
    {
      id: "goal-client",
      dimension: "client",
      label: "Client sales",
      subtitle: "Revenue from client billing",
      actual: actuals.clientSales,
      target: goals.clientSalesInr,
      progressPct: progressPct(actuals.clientSales, goals.clientSalesInr),
      unit: "inr",
      status: goalStatus(actuals.clientSales, goals.clientSalesInr),
    },
    {
      id: "goal-supplier",
      dimension: "supplier",
      label: "Supplier cost",
      subtitle: "Market payout budget",
      actual: actuals.supplierCost,
      target: goals.supplierCostInr,
      progressPct: progressPct(actuals.supplierCost, goals.supplierCostInr),
      unit: "inr",
      status: goalStatus(actuals.supplierCost, goals.supplierCostInr),
    },
    {
      id: "goal-vehicle",
      dimension: "vehicle",
      label: "Vehicle trips",
      subtitle: "Asset fleet executions",
      actual: actuals.vehicleTrips,
      target: goals.vehicleTrips,
      progressPct: progressPct(actuals.vehicleTrips, goals.vehicleTrips),
      unit: "trips",
      status: goalStatus(actuals.vehicleTrips, goals.vehicleTrips),
    },
    {
      id: "goal-driver",
      dimension: "driver",
      label: "Driver trips",
      subtitle: "Assigned driver missions",
      actual: actuals.driverTrips,
      target: goals.driverTrips,
      progressPct: progressPct(actuals.driverTrips, goals.driverTrips),
      unit: "trips",
      status: goalStatus(actuals.driverTrips, goals.driverTrips),
    },
  ];
}

export function buildTopEntityGoalRows(
  dimension: GoalDimension,
  clients: readonly ClientRow[],
  suppliers: readonly SupplierRow[],
  drivers: readonly DriverRow[],
  vehicles: readonly VehicleRow[],
  trips: readonly TripRow[],
  dateRange: SalesDateRange,
  limit = 6,
): Array<{
  id: string;
  name: string;
  meta: string;
  value: number;
  trips: number;
}> {
  const scoped = tripsInRange(trips, dateRange);
  const tallies = new Map<string, { name: string; value: number; trips: number }>();

  if (dimension === "client") {
    for (const trip of scoped) {
      if (!trip.client_id) continue;
      const name = trip.client_name?.trim() || "Client";
      const prev = tallies.get(trip.client_id) ?? { name, value: 0, trips: 0 };
      const sales = Number(trip.client_price);
      tallies.set(trip.client_id, {
        name,
        value: prev.value + (Number.isFinite(sales) ? Math.max(0, sales) : 0),
        trips: prev.trips + 1,
      });
    }
    for (const c of clients) {
      if (!tallies.has(c.id)) {
        tallies.set(c.id, {
          name: (c.name ?? c.contact_person ?? "Client").trim(),
          value: 0,
          trips: 0,
        });
      }
    }
  } else if (dimension === "supplier") {
    for (const trip of scoped) {
      if (!trip.supplier_id) continue;
      const name = trip.supplier_name?.trim() || "Supplier";
      const prev = tallies.get(trip.supplier_id) ?? { name, value: 0, trips: 0 };
      const cost = Number(trip.supplier_rate);
      tallies.set(trip.supplier_id, {
        name,
        value: prev.value + (Number.isFinite(cost) ? Math.max(0, cost) : 0),
        trips: prev.trips + 1,
      });
    }
    for (const s of suppliers) {
      if (!tallies.has(s.id)) {
        tallies.set(s.id, {
          name: (s.name ?? s.company_name ?? "Supplier").trim(),
          value: 0,
          trips: 0,
        });
      }
    }
  } else if (dimension === "vehicle") {
    for (const trip of scoped) {
      if (!trip.vehicle_id || !isAssetExecutionTrip(trip)) continue;
      const name =
        trip.vehicle_display_number?.trim() ||
        vehicles.find((v) => v.id === trip.vehicle_id)?.vehicle_number ||
        "Vehicle";
      const prev = tallies.get(trip.vehicle_id) ?? { name, value: 0, trips: 0 };
      const sales = Number(trip.client_price);
      tallies.set(trip.vehicle_id, {
        name: String(name),
        value: prev.value + (Number.isFinite(sales) ? Math.max(0, sales) : 0),
        trips: prev.trips + 1,
      });
    }
  } else {
    for (const trip of scoped) {
      if (!trip.driver_id || !isAssetExecutionTrip(trip)) continue;
      const name = trip.driver_display_name?.trim() || "Driver";
      const prev = tallies.get(trip.driver_id) ?? { name, value: 0, trips: 0 };
      tallies.set(trip.driver_id, {
        name,
        value: prev.value,
        trips: prev.trips + 1,
      });
    }
    for (const d of drivers) {
      if (!tallies.has(d.id)) {
        tallies.set(d.id, {
          name: (d.name ?? "Driver").trim(),
          value: 0,
          trips: 0,
        });
      }
    }
  }

  return [...tallies.entries()]
    .map(([id, row]) => ({
      id,
      name: row.name,
      meta:
        dimension === "client" || dimension === "supplier"
          ? `${row.trips} trips`
          : dimension === "vehicle"
            ? `${row.trips} trips · sales`
            : `${row.trips} trips`,
      value: row.value,
      trips: row.trips,
    }))
    .sort((a, b) => b.trips - a.trips || b.value - a.value)
    .slice(0, limit);
}
