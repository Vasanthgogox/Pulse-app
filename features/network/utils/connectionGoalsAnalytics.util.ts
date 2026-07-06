import { aggregateCustomers } from "@/features/finance/aggregation/aggregateCustomers";
import { aggregateDrivers } from "@/features/finance/aggregation/aggregateDrivers";
import { aggregateSuppliers } from "@/features/finance/aggregation/aggregateSuppliers";
import type { DriverRow } from "@/features/drivers/services/drivers.service";
import type { ClientRow } from "@/features/clients/services/clients.service";
import type { SupplierRow } from "@/features/suppliers/services/suppliers.service";
import type { LedgerTx } from "@/features/finance/aggregation/types";
import {
  getMonthKeys,
  type SalesDateRange,
} from "@/features/network/utils/connectionSalesAnalytics.util";
import type {
  EntityTargetMetrics,
  GoalFocus,
  NetworkGoalsMonthStore,
  NetworkGoalsStore,
  SalesTargetMetrics,
} from "@/features/network/services/networkGoalsStorage.service";
import {
  EMPTY_ENTITY_TARGET,
  EMPTY_SALES_TARGET,
  getMonthStore,
  monthLabelFromKey,
  previousMonthKey,
} from "@/features/network/services/networkGoalsStorage.service";
import { isAssetExecutionTrip } from "@/features/trips/domain/tripExecutionModel";
import type { TripRow } from "@/features/trips/services/trips.service";
import type { VehicleRow } from "@/features/vehicles/services/vehicles.service";

export type GoalsRollup = "month" | "quarter" | "year";

export type GoalsActuals = SalesTargetMetrics;

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
  metric: "revenue" | "trips" | "margin";
  label: string;
  subtitle: string;
  actual: number;
  target: number;
  progressPct: number;
  unit: "inr" | "trips" | "pct";
  status: "on_track" | "behind" | "unset";
};

export type EntityGoalRow = {
  id: string;
  name: string;
  meta: string;
  actualRevenue: number;
  actualTrips: number;
  targetRevenue: number;
  targetTrips: number;
  revenueProgressPct: number;
  tripProgressPct: number;
  hasTarget: boolean;
  /** userId of assigned KAM (client focus only) */
  kamUserId: string | null;
  /** Region label (client focus only) */
  region: string | null;
};

export type BalanceTrendPoint = {
  monthKey: string;
  label: string;
  receivable: number;
  payable: number;
};

function tripMonthKey(trip: TripRow): string | null {
  const raw = trip.pickup_date ?? trip.completed_at ?? trip.created_at;
  if (!raw) return null;
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function progressPct(actual: number, target: number): number {
  if (target <= 0) return 0;
  return Math.min(100, Math.round((actual / target) * 100));
}

function goalStatus(
  actual: number,
  target: number,
  higherIsBetter = true,
): GoalTargetRow["status"] {
  if (target <= 0) return "unset";
  if (!higherIsBetter) {
    return actual <= target * 1.05 ? "on_track" : "behind";
  }
  return actual >= target * 0.85 ? "on_track" : "behind";
}

function sumEntityTargets(
  bucket: Record<string, EntityTargetMetrics>,
): EntityTargetMetrics {
  let revenueInr = 0;
  let tripCount = 0;
  for (const row of Object.values(bucket)) {
    revenueInr += row.revenueInr;
    tripCount += row.tripCount;
  }
  return { revenueInr, tripCount };
}

/** Month keys included in rollup for a selected month. */
export function rollupMonthKeys(
  selectedMonthKey: string,
  rollup: GoalsRollup,
): string[] {
  const [y, m] = selectedMonthKey.split("-").map(Number);
  if (!y || !m) return [selectedMonthKey];

  if (rollup === "month") return [selectedMonthKey];

  if (rollup === "quarter") {
    const qStartMonth = Math.floor((m - 1) / 3) * 3 + 1;
    const keys: string[] = [];
    for (let mo = qStartMonth; mo <= m; mo += 1) {
      keys.push(`${y}-${String(mo).padStart(2, "0")}`);
    }
    return keys;
  }

  const keys: string[] = [];
  for (let mo = 1; mo <= m; mo += 1) {
    keys.push(`${y}-${String(mo).padStart(2, "0")}`);
  }
  return keys;
}

function rollupLabel(selectedMonthKey: string, rollup: GoalsRollup): string {
  if (rollup === "month") return monthLabelFromKey(selectedMonthKey);
  const [y, m] = selectedMonthKey.split("-").map(Number);
  if (rollup === "quarter") {
    const q = Math.ceil(m / 3);
    return `Q${q} '${String(y).slice(2)}`;
  }
  return `YTD '${String(y).slice(2)}`;
}

function tripsInMonthKeys(
  trips: readonly TripRow[],
  monthKeys: readonly string[],
): TripRow[] {
  const set = new Set(monthKeys);
  return trips.filter((trip) => {
    const key = tripMonthKey(trip);
    return key != null && set.has(key);
  });
}

function txMonthKey(tx: LedgerTx): string | null {
  const raw = tx.transaction_date ?? tx.created_at;
  if (!raw) return null;
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function transactionsInMonthKeys(
  transactions: readonly LedgerTx[],
  monthKeys: readonly string[],
): LedgerTx[] {
  const set = new Set(monthKeys);
  return transactions.filter((tx) => {
    const key = txMonthKey(tx);
    return key != null && set.has(key);
  });
}

function computeTripMetrics(trips: readonly TripRow[]): GoalsActuals {
  let revenueInr = 0;
  let tripCount = 0;
  let totalCost = 0;

  for (const trip of trips) {
    const sales = Number(trip.client_price);
    const cost = Number(trip.supplier_rate);
    if (Number.isFinite(sales)) revenueInr += Math.max(0, sales);
    if (Number.isFinite(cost)) totalCost += Math.max(0, cost);
    tripCount += 1;
  }

  const marginPct =
    revenueInr > 0
      ? Math.round(((revenueInr - totalCost) / revenueInr) * 1000) / 10
      : 0;

  return { revenueInr, tripCount, marginPct };
}

function sumAggregateTargets(
  store: NetworkGoalsStore,
  monthKeys: readonly string[],
): SalesTargetMetrics {
  let revenueInr = 0;
  let tripCount = 0;
  let marginWeighted = 0;
  let marginWeight = 0;

  for (const key of monthKeys) {
    const month = getMonthStore(store, key);
    revenueInr += month.aggregate.revenueInr;
    tripCount += month.aggregate.tripCount;
    if (month.aggregate.marginPct > 0) {
      const weight = month.aggregate.revenueInr || 1;
      marginWeighted += month.aggregate.marginPct * weight;
      marginWeight += weight;
    }
  }

  const marginPct =
    marginWeight > 0 ? Math.round((marginWeighted / marginWeight) * 10) / 10 : 0;

  return { revenueInr, tripCount, marginPct };
}

function sumEntityTargetsForKeys(
  store: NetworkGoalsStore,
  monthKeys: readonly string[],
  focus: GoalFocus,
  entityId: string,
): EntityTargetMetrics {
  let revenueInr = 0;
  let tripCount = 0;
  for (const key of monthKeys) {
    const month = getMonthStore(store, key);
    const bucket =
      focus === "client"
        ? month.clients
        : focus === "vehicle"
          ? month.vehicles
          : month.drivers;
    const row = bucket[entityId] ?? EMPTY_ENTITY_TARGET;
    revenueInr += row.revenueInr;
    tripCount += row.tripCount;
  }
  return { revenueInr, tripCount };
}

export function computeGoalsActualsForRollup(
  trips: readonly TripRow[],
  selectedMonthKey: string,
  rollup: GoalsRollup,
): GoalsActuals {
  const keys = rollupMonthKeys(selectedMonthKey, rollup);
  return computeTripMetrics(tripsInMonthKeys(trips, keys));
}

export function computePayableReceivableSnapshot(
  clients: readonly ClientRow[],
  suppliers: readonly SupplierRow[],
  drivers: readonly DriverRow[],
  trips: readonly TripRow[],
  transactions: readonly LedgerTx[],
  monthKeys?: readonly string[],
): PayableReceivableSnapshot {
  const hasScope = Boolean(monthKeys && monthKeys.length > 0);
  const scopedTrips = hasScope ? tripsInMonthKeys(trips, monthKeys!) : trips;
  const scopedTx = hasScope
    ? transactionsInMonthKeys(transactions, monthKeys!)
    : transactions;
  const customerAgg = aggregateCustomers(clients, scopedTrips, scopedTx);
  const supplierAgg = aggregateSuppliers(suppliers, scopedTrips, scopedTx);
  const driverAgg = aggregateDrivers(drivers, scopedTrips, scopedTx);

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

export function buildBalanceTrendPoints(
  trips: readonly TripRow[],
  monthKeys: readonly string[],
): BalanceTrendPoint[] {
  return monthKeys.map((key) => {
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
      label: monthLabelFromKey(key),
      receivable,
      payable,
    };
  });
}

export function buildGoalSummaryRows(
  store: NetworkGoalsStore,
  actuals: GoalsActuals,
  selectedMonthKey: string,
  rollup: GoalsRollup,
): GoalTargetRow[] {
  const keys = rollupMonthKeys(selectedMonthKey, rollup);
  const targets = sumAggregateTargets(store, keys);
  const periodLabel = rollupLabel(selectedMonthKey, rollup);

  return [
    {
      id: "goal-revenue",
      metric: "revenue",
      label: "Sales revenue",
      subtitle: `${periodLabel} · client billing target`,
      actual: actuals.revenueInr,
      target: targets.revenueInr,
      progressPct: progressPct(actuals.revenueInr, targets.revenueInr),
      unit: "inr",
      status: goalStatus(actuals.revenueInr, targets.revenueInr),
    },
    {
      id: "goal-trips",
      metric: "trips",
      label: "Trip count",
      subtitle: `${periodLabel} · fleet execution target`,
      actual: actuals.tripCount,
      target: targets.tripCount,
      progressPct: progressPct(actuals.tripCount, targets.tripCount),
      unit: "trips",
      status: goalStatus(actuals.tripCount, targets.tripCount),
    },
    {
      id: "goal-margin",
      metric: "margin",
      label: "Margin %",
      subtitle: `${periodLabel} · sales minus supplier cost`,
      actual: actuals.marginPct,
      target: targets.marginPct,
      progressPct: progressPct(actuals.marginPct, targets.marginPct),
      unit: "pct",
      status: goalStatus(actuals.marginPct, targets.marginPct),
    },
  ];
}

function entityActualsForFocus(
  focus: GoalFocus,
  trips: readonly TripRow[],
  monthKeys: readonly string[],
): Map<string, { name: string; revenue: number; trips: number }> {
  const scoped = tripsInMonthKeys(trips, monthKeys);
  const tallies = new Map<string, { name: string; revenue: number; trips: number }>();

  for (const trip of scoped) {
    if (focus === "client") {
      if (!trip.client_id) continue;
      const name = trip.client_name?.trim() || "Client";
      const prev = tallies.get(trip.client_id) ?? { name, revenue: 0, trips: 0 };
      const sales = Number(trip.client_price);
      tallies.set(trip.client_id, {
        name,
        revenue:
          prev.revenue +
          (Number.isFinite(sales) ? Math.max(0, sales) : 0),
        trips: prev.trips + 1,
      });
    } else if (focus === "vehicle") {
      if (!trip.vehicle_id || !isAssetExecutionTrip(trip)) continue;
      const name = trip.vehicle_display_number?.trim() || "Vehicle";
      const prev = tallies.get(trip.vehicle_id) ?? { name, revenue: 0, trips: 0 };
      const sales = Number(trip.client_price);
      tallies.set(trip.vehicle_id, {
        name: String(name),
        revenue:
          prev.revenue +
          (Number.isFinite(sales) ? Math.max(0, sales) : 0),
        trips: prev.trips + 1,
      });
    } else {
      if (!trip.driver_id || !isAssetExecutionTrip(trip)) continue;
      const name = trip.driver_display_name?.trim() || "Driver";
      const prev = tallies.get(trip.driver_id) ?? { name, revenue: 0, trips: 0 };
      const sales = Number(trip.client_price);
      tallies.set(trip.driver_id, {
        name,
        revenue:
          prev.revenue +
          (Number.isFinite(sales) ? Math.max(0, sales) : 0),
        trips: prev.trips + 1,
      });
    }
  }

  return tallies;
}

export function buildEntityGoalRows(
  focus: GoalFocus,
  store: NetworkGoalsStore,
  clients: readonly ClientRow[],
  drivers: readonly DriverRow[],
  vehicles: readonly VehicleRow[],
  trips: readonly TripRow[],
  selectedMonthKey: string,
  rollup: GoalsRollup,
  limit = 12,
): EntityGoalRow[] {
  const monthKeys = rollupMonthKeys(selectedMonthKey, rollup);
  const actuals = entityActualsForFocus(focus, trips, monthKeys);

  if (focus === "client") {
    for (const c of clients) {
      if (!actuals.has(c.id)) {
        actuals.set(c.id, {
          name: (c.name ?? c.contact_person ?? "Client").trim(),
          revenue: 0,
          trips: 0,
        });
      }
    }
  } else if (focus === "driver") {
    for (const d of drivers) {
      if (!actuals.has(d.id)) {
        actuals.set(d.id, {
          name: (d.name ?? "Driver").trim(),
          revenue: 0,
          trips: 0,
        });
      }
    }
  } else {
    for (const v of vehicles) {
      if (!actuals.has(v.id)) {
        actuals.set(v.id, {
          name: (v.vehicle_number ?? "Vehicle").trim(),
          revenue: 0,
          trips: 0,
        });
      }
    }
  }

  const kamAssignments = store.kamAssignments ?? {};
  const clientRegions = store.clientRegions ?? {};

  const rows: EntityGoalRow[] = [...actuals.entries()].map(([id, row]) => {
    const target = sumEntityTargetsForKeys(store, monthKeys, focus, id);
    const hasTarget = target.revenueInr > 0 || target.tripCount > 0;
    return {
      id,
      name: row.name,
      meta:
        focus === "client"
          ? `${row.trips} trips · client sales`
          : `${row.trips} trips · asset revenue`,
      actualRevenue: row.revenue,
      actualTrips: row.trips,
      targetRevenue: target.revenueInr,
      targetTrips: target.tripCount,
      revenueProgressPct: progressPct(row.revenue, target.revenueInr),
      tripProgressPct: progressPct(row.trips, target.tripCount),
      hasTarget,
      kamUserId: focus === "client" ? (kamAssignments[id] ?? null) : null,
      region: focus === "client" ? (clientRegions[id] ?? null) : null,
    };
  });

  return rows
    .sort(
      (a, b) =>
        b.actualRevenue - a.actualRevenue ||
        b.actualTrips - a.actualTrips ||
        a.name.localeCompare(b.name),
    )
    .slice(0, limit);
}

/** Client-level revenue targets for selected month only (for inline month editor). */
export function clientTargetsForMonth(
  monthStore: NetworkGoalsMonthStore,
): Array<{ id: string; target: EntityTargetMetrics }> {
  return Object.entries(monthStore.clients).map(([id, target]) => ({
    id,
    target,
  }));
}

export function getRecentMonthKeys(count = 3, now = new Date()): string[] {
  return getMonthKeys(count, now);
}

export type GoalsPeriodSummary = {
  rollupLabel: string;
  monthKeys: string[];
  aggregateTarget: SalesTargetMetrics;
  clientTargetSum: EntityTargetMetrics;
  vehicleTargetSum: EntityTargetMetrics;
  driverTargetSum: EntityTargetMetrics;
};

export function buildPeriodSummary(
  store: NetworkGoalsStore,
  selectedMonthKey: string,
  rollup: GoalsRollup,
): GoalsPeriodSummary {
  const monthKeys = rollupMonthKeys(selectedMonthKey, rollup);
  let clientTargetSum = { ...EMPTY_ENTITY_TARGET };
  let vehicleTargetSum = { ...EMPTY_ENTITY_TARGET };
  let driverTargetSum = { ...EMPTY_ENTITY_TARGET };

  for (const key of monthKeys) {
    const month = getMonthStore(store, key);
    const c = sumEntityTargets(month.clients);
    const v = sumEntityTargets(month.vehicles);
    const d = sumEntityTargets(month.drivers);
    clientTargetSum = {
      revenueInr: clientTargetSum.revenueInr + c.revenueInr,
      tripCount: clientTargetSum.tripCount + c.tripCount,
    };
    vehicleTargetSum = {
      revenueInr: vehicleTargetSum.revenueInr + v.revenueInr,
      tripCount: vehicleTargetSum.tripCount + v.tripCount,
    };
    driverTargetSum = {
      revenueInr: driverTargetSum.revenueInr + d.revenueInr,
      tripCount: driverTargetSum.tripCount + d.tripCount,
    };
  }

  return {
    rollupLabel: rollupLabel(selectedMonthKey, rollup),
    monthKeys,
    aggregateTarget: sumAggregateTargets(store, monthKeys),
    clientTargetSum,
    vehicleTargetSum,
    driverTargetSum,
  };
}

/** Balance widget period maps to month keys anchored to selected month. */
export function balancePeriodMonthKeys(
  period: SalesDateRange,
  anchorMonthKey?: string,
): string[] {
  const now = new Date();
  const fallback = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const anchor = anchorMonthKey ?? fallback;
  if (period === "3m") return [anchor];
  if (period === "6m") return rollupMonthKeys(anchor, "quarter");
  if (period === "12m") return rollupMonthKeys(anchor, "year");
  const keys: string[] = [anchor];
  let cursor = anchor;
  for (let i = 0; i < 17; i += 1) {
    const prev = previousMonthKey(cursor);
    if (!prev) break;
    keys.unshift(prev);
    cursor = prev;
  }
  return keys;
}

export type EntityMonthPerformance = {
  monthKey: string;
  label: string;
  actualRevenue: number;
  actualTrips: number;
  targetRevenue: number;
  targetTrips: number;
  revenueProgressPct: number;
  tripProgressPct: number;
};

export type EntityGoalRecommendation = {
  recommendedRevenue: number;
  recommendedTrips: number;
  rationale: string;
};

/** Three calendar months immediately before the selected target month. */
export function getPriorMonthKeys(
  selectedMonthKey: string,
  count = 3,
): string[] {
  const keys: string[] = [];
  let cursor = selectedMonthKey;
  for (let i = 0; i < count; i++) {
    const prev = previousMonthKey(cursor);
    if (!prev) break;
    keys.unshift(prev);
    cursor = prev;
  }
  return keys;
}

function entityTargetForMonth(
  store: NetworkGoalsStore,
  monthKey: string,
  focus: GoalFocus,
  entityId: string,
): EntityTargetMetrics {
  const month = getMonthStore(store, monthKey);
  const bucket =
    focus === "client"
      ? month.clients
      : focus === "vehicle"
        ? month.vehicles
        : month.drivers;
  return bucket[entityId] ?? { ...EMPTY_ENTITY_TARGET };
}

export function buildEntityMonthlyPerformance(
  focus: GoalFocus,
  entityId: string,
  trips: readonly TripRow[],
  store: NetworkGoalsStore,
  monthKeys: readonly string[],
): EntityMonthPerformance[] {
  return monthKeys.map((monthKey) => {
    const actuals = entityActualsForFocus(focus, trips, [monthKey]);
    const row = actuals.get(entityId) ?? { name: "", revenue: 0, trips: 0 };
    const target = entityTargetForMonth(store, monthKey, focus, entityId);
    return {
      monthKey,
      label: monthLabelFromKey(monthKey),
      actualRevenue: row.revenue,
      actualTrips: row.trips,
      targetRevenue: target.revenueInr,
      targetTrips: target.tripCount,
      revenueProgressPct: progressPct(row.revenue, target.revenueInr),
      tripProgressPct: progressPct(row.trips, target.tripCount),
    };
  });
}

export function recommendEntityGoalTarget(
  history: readonly EntityMonthPerformance[],
  previousMonthTarget: EntityTargetMetrics,
  focus: GoalFocus,
): EntityGoalRecommendation {
  const trailing = history.filter((h) => h.actualRevenue > 0 || h.actualTrips > 0);
  const avgRevenue =
    trailing.length > 0
      ? trailing.reduce((sum, h) => sum + h.actualRevenue, 0) / trailing.length
      : 0;
  const avgTrips =
    trailing.length > 0
      ? trailing.reduce((sum, h) => sum + h.actualTrips, 0) / trailing.length
      : 0;
  const last = history[history.length - 1];
  const prevRevenue = previousMonthTarget.revenueInr;
  const prevTrips = previousMonthTarget.tripCount;

  if (focus === "client") {
    if (prevRevenue > 0 && last) {
      const hitRate = progressPct(last.actualRevenue, prevRevenue);
      if (hitRate >= 90) {
        return {
          recommendedRevenue: Math.round(prevRevenue * 1.08),
          recommendedTrips: 0,
          rationale:
            "Client beat last month's target — suggest an 8% stretch for the new month.",
        };
      }
      if (hitRate >= 70) {
        return {
          recommendedRevenue: Math.round(prevRevenue),
          recommendedTrips: 0,
          rationale:
            "Performance was close to target — carry the same revenue goal forward.",
        };
      }
      return {
        recommendedRevenue: Math.round(
          Math.max(avgRevenue * 1.1, last.actualRevenue * 1.05, 0),
        ),
        recommendedTrips: 0,
        rationale:
          "Below prior target — recommend a realistic uplift from the 3-month average.",
      };
    }
    const base = Math.max(avgRevenue, last?.actualRevenue ?? 0);
    return {
      recommendedRevenue: Math.round(base > 0 ? base * 1.12 : 0),
      recommendedTrips: 0,
      rationale:
        base > 0
          ? "No prior target — base recommendation on trailing client sales."
          : "No sales history yet — set an introductory target manually.",
    };
  }

  if (prevRevenue > 0 || prevTrips > 0) {
    const revHit = prevRevenue > 0 && last
      ? progressPct(last.actualRevenue, prevRevenue)
      : 100;
    const tripHit = prevTrips > 0 && last
      ? progressPct(last.actualTrips, prevTrips)
      : 100;
    const blended = Math.round((revHit + tripHit) / 2);
    if (blended >= 85) {
      return {
        recommendedRevenue: Math.round(prevRevenue * 1.05),
        recommendedTrips: Math.max(0, Math.round(prevTrips * 1.05)),
        rationale: "Asset is on track — modest 5% stretch on revenue and trips.",
      };
    }
    return {
      recommendedRevenue: Math.round(Math.max(avgRevenue, last?.actualRevenue ?? 0)),
      recommendedTrips: Math.max(0, Math.round(Math.max(avgTrips, last?.actualTrips ?? 0))),
      rationale: "Recommend aligning with recent actual performance.",
    };
  }

  return {
    recommendedRevenue: Math.round(avgRevenue * 1.1),
    recommendedTrips: Math.max(0, Math.round(avgTrips * 1.1)),
    rationale: "No saved target — use trailing 3-month averages as a starting point.",
  };
}

export { EMPTY_SALES_TARGET };
