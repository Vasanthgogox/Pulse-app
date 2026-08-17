import { aggregateCustomers } from "@/features/finance/aggregation/aggregateCustomers";
import { aggregateDrivers } from "@/features/finance/aggregation/aggregateDrivers";
import { aggregateSuppliers } from "@/features/finance/aggregation/aggregateSuppliers";
import type { DriverRow } from "@/features/drivers/services/drivers.service";
import type { ClientRow } from "@/features/clients/services/clients.service";
import type { SupplierRow } from "@/features/suppliers/services/suppliers.service";
import type { LedgerTx } from "@/features/finance/aggregation/types";
import {
  formatTripStatusLabel,
  getMonthKeys,
  type SalesDateRange,
} from "@/features/network/utils/connectionSalesAnalytics.util";
import { getTripOperationalDisplayCode } from "@/features/operations/display";
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
  getQuarterlyTarget,
  getYearlyTarget,
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

export function rollupLabel(selectedMonthKey: string, rollup: GoalsRollup): string {
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

export function computeTripMetrics(trips: readonly TripRow[]): GoalsActuals {
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

// ─── Performance: target-to-date, pacing, previous-period (Phase 1 Commit 4) ──
//
// These are pure calendar-math + trip-filtering helpers. None of them read
// or write NetworkGoalsStore differently than the existing month/quarter/
// year model already does -- no new persistent target record is introduced.
//
// Terminology (locked):
//   Period Target    -- the full target for the selected period.
//   Target-to-date    -- Period Target pro-rated by elapsed time in the period.
//   Achievement %      -- Actual / Period Target.
//   Pacing %           -- Actual / Target-to-date. NOT the same as Achievement % --
//                         a partial month's actual must never be compared against
//                         the whole month's target and called "on track".
//
// Deliberately NOT computed here for "pct"-unit metrics (e.g. margin %):
// target-to-date/pacing pro-ration assumes a cumulative metric (revenue,
// trips) that accrues over the period. A margin percentage is already a
// period-level ratio, not a cumulative sum -- "55% of the way to a 31%
// margin target by day 17" isn't a meaningful statement. Callers should
// only request target-to-date/pacing for "inr"/"trips" units.

function monthKeyToYM(monthKey: string): { y: number; m0: number } {
  const [y, m] = monthKey.split("-").map(Number);
  return { y: y || new Date().getFullYear(), m0: (m || 1) - 1 };
}

function ymToMonthKey(y: number, m0: number): string {
  return `${y}-${String(m0 + 1).padStart(2, "0")}`;
}

/** [start, end) calendar bounds of the selected period, at day granularity. */
export function periodBounds(
  selectedMonthKey: string,
  rollup: GoalsRollup,
): { start: Date; end: Date } {
  const { y, m0 } = monthKeyToYM(selectedMonthKey);
  if (rollup === "month") {
    return { start: new Date(y, m0, 1), end: new Date(y, m0 + 1, 1) };
  }
  if (rollup === "quarter") {
    const qStart0 = Math.floor(m0 / 3) * 3;
    return { start: new Date(y, qStart0, 1), end: new Date(y, qStart0 + 3, 1) };
  }
  return { start: new Date(y, 0, 1), end: new Date(y + 1, 0, 1) };
}

/**
 * The anchor month-key for "the same relative position, one period back" --
 * month -> previous month; quarter -> previous quarter, same month-within-
 * quarter offset; year -> same month, previous year. Uses native Date month
 * arithmetic so quarter/year boundaries (Jan, Q1) roll back correctly with
 * no manual cross-year handling.
 */
export function previousPeriodAnchorMonthKey(
  selectedMonthKey: string,
  rollup: GoalsRollup,
): string {
  const { y, m0 } = monthKeyToYM(selectedMonthKey);
  const shiftMonths = rollup === "month" ? 1 : rollup === "quarter" ? 3 : 12;
  const d = new Date(y, m0 - shiftMonths, 1);
  return ymToMonthKey(d.getFullYear(), d.getMonth());
}

/** Full (not to-date) target for the selected period, reusing the existing
 * per-granularity storage as-is -- month.aggregate, or the independently
 * stored quarterly/yearly target. No new storage, no derived summing. */
export function resolvePeriodTarget(
  store: NetworkGoalsStore,
  selectedMonthKey: string,
  rollup: GoalsRollup,
): SalesTargetMetrics {
  if (rollup === "month") {
    return getMonthStore(store, selectedMonthKey).aggregate;
  }
  if (rollup === "quarter") {
    return getQuarterlyTarget(store, quarterKeyFromSelectedMonth(selectedMonthKey));
  }
  return getYearlyTarget(store, monthKeyToYM(selectedMonthKey).y.toString());
}

function quarterKeyFromSelectedMonth(selectedMonthKey: string): string {
  const { y, m0 } = monthKeyToYM(selectedMonthKey);
  return `${y}-Q${Math.floor(m0 / 3) + 1}`;
}

/** 0..1, clamped. 0 before the period starts, 1 once it has fully elapsed. */
export function elapsedFraction(start: Date, end: Date, asOf: Date): number {
  const total = end.getTime() - start.getTime();
  if (total <= 0) return 0;
  const elapsed = asOf.getTime() - start.getTime();
  return Math.max(0, Math.min(1, elapsed / total));
}

/** Period target pro-rated by elapsed time. 0 for a future period; equals
 * the full target once the period has fully elapsed. */
export function computeTargetToDate(
  periodTargetValue: number,
  start: Date,
  end: Date,
  asOf: Date,
): number {
  if (periodTargetValue <= 0) return 0;
  return periodTargetValue * elapsedFraction(start, end, asOf);
}

/** null (not 0, not NaN) when there's no target to compare against --
 * callers must render "No target set", never a misleading 0%. */
export function achievementPct(actual: number, periodTargetValue: number): number | null {
  if (periodTargetValue <= 0) return null;
  return Math.round((actual / periodTargetValue) * 1000) / 10;
}

/** null when target-to-date is 0 (period hasn't started, or no target) --
 * dividing by zero must never surface as 0%, Infinity, or NaN. */
export function pacingPct(actual: number, targetToDateValue: number): number | null {
  if (targetToDateValue <= 0) return null;
  return Math.round((actual / targetToDateValue) * 1000) / 10;
}

function tripDate(trip: TripRow): Date | null {
  const raw = trip.pickup_date ?? trip.completed_at ?? trip.created_at;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isFinite(d.getTime()) ? d : null;
}

/** [start, end) — start inclusive, end exclusive, matching periodBounds. */
export function tripsInDateRange(
  trips: readonly TripRow[],
  start: Date,
  end: Date,
): TripRow[] {
  return trips.filter((trip) => {
    const d = tripDate(trip);
    return d != null && d.getTime() >= start.getTime() && d.getTime() < end.getTime();
  });
}

/**
 * Previous-period actual, using the SAME elapsed window as the current
 * period (e.g. Aug 1-17 vs Jul 1-17), not the full previous period --
 * comparing a partial current period against a full previous one would
 * overstate or understate the change. If the previous period is shorter
 * than the elapsed window (e.g. comparing 31 elapsed days against a
 * 28/29-day February), the window clamps to the previous period's own end
 * rather than spilling into the period before it.
 */
/** The previous-period trip list itself (same elapsed-window/clamping
 * logic as computePreviousPeriodActuals), for callers that need the raw
 * trips -- e.g. the Supplier/Asset breakdowns' per-entity growth%, which
 * can't be computed from a single pre-aggregated total. */
export function previousPeriodTripWindow(
  trips: readonly TripRow[],
  selectedMonthKey: string,
  rollup: GoalsRollup,
  asOf: Date,
): TripRow[] {
  const { start: curStart, end: curEnd } = periodBounds(selectedMonthKey, rollup);
  const elapsedMs = Math.max(
    0,
    Math.min(asOf.getTime(), curEnd.getTime()) - curStart.getTime(),
  );
  const prevAnchor = previousPeriodAnchorMonthKey(selectedMonthKey, rollup);
  const { start: prevStart, end: prevEnd } = periodBounds(prevAnchor, rollup);
  const windowEnd = new Date(
    Math.min(prevStart.getTime() + elapsedMs, prevEnd.getTime()),
  );
  return tripsInDateRange(trips, prevStart, windowEnd);
}

export function computePreviousPeriodActuals(
  trips: readonly TripRow[],
  selectedMonthKey: string,
  rollup: GoalsRollup,
  asOf: Date,
): GoalsActuals {
  return computeTripMetrics(previousPeriodTripWindow(trips, selectedMonthKey, rollup, asOf));
}

/** Percent change vs previous period. null when there's no previous actual
 * to compare against (division by zero) -- render "No previous period
 * data", never a fabricated +Infinity%/NaN%. */
export function changePct(actual: number, previousActual: number): number | null {
  if (previousActual <= 0) return null;
  return Math.round(((actual - previousActual) / previousActual) * 1000) / 10;
}

export type PerformanceKpiRow = {
  label: string;
  unit: "inr" | "trips" | "pct";
  actual: number;
  periodTarget: number;
  hasTarget: boolean;
  achievement: number | null;
  /** null for "pct"-unit metrics (see file-level note) -- pro-ration doesn't
   * apply to a ratio metric like margin %. */
  targetToDate: number | null;
  pacing: number | null;
  previousActual: number;
  hasPreviousData: boolean;
  changeVsPrevious: number | null;
  variance: number;
};

/** Bundles Period Target / Target-to-date / Actual / Achievement % /
 * Pacing % / vs Previous Period / Variance for one metric, so the panel
 * doesn't repeat this composition three times (revenue/trips/margin). */
export function buildPerformanceKpiRow(
  label: string,
  unit: "inr" | "trips" | "pct",
  actual: number,
  periodTargetValue: number,
  previousActual: number,
  selectedMonthKey: string,
  rollup: GoalsRollup,
  asOf: Date,
): PerformanceKpiRow {
  const hasTarget = periodTargetValue > 0;
  const supportsPacing = unit !== "pct";
  const { start, end } = periodBounds(selectedMonthKey, rollup);
  const targetToDate =
    supportsPacing && hasTarget ? computeTargetToDate(periodTargetValue, start, end, asOf) : null;
  return {
    label,
    unit,
    actual,
    periodTarget: periodTargetValue,
    hasTarget,
    achievement: hasTarget ? achievementPct(actual, periodTargetValue) : null,
    targetToDate,
    pacing: targetToDate != null ? pacingPct(actual, targetToDate) : null,
    previousActual,
    hasPreviousData: previousActual > 0,
    changeVsPrevious: changePct(actual, previousActual),
    variance: actual - periodTargetValue,
  };
}

// ─── Performance: cross-filter engine (Phase 1 Commit 5) ──────────────────────
//
// One shared filter/perspective pair drives every Performance visual -- not
// six independent per-perspective page layouts, not a second filter system
// inside the Sales/Asset panels underneath. Moved here (out of
// NetworkDesktopPerformancePanel.tsx, where Commit 2 first declared them) so
// the filtering functions below can reference the same types without a
// panel -> util -> panel dependency loop.

/** A view mode (which breakdown/grouping is showing), not a filter
 * dimension. Selecting a perspective must never itself change or clear
 * PerformanceCrossFilter. */
export type PerformancePerspective =
  | "aggregate"
  | "kam"
  | "client"
  | "region"
  | "supplier"
  | "asset";

export type PerformanceCrossFilter = {
  kamId: string | null;
  clientId: string | null;
  regionId: string | null;
  supplierId: string | null;
  assetId: string | null;
  performanceStatus: "behind" | "on_track" | "exceeded" | null;
  /** Day/week/month key selected on the trend chart. Not the global Period/
   * Granularity picker (Month/Quarter/Year) -- that remains separate global
   * context, per the locked Global-vs-cross-filter split. */
  trendPointKey: string | null;
};

export const EMPTY_PERFORMANCE_CROSS_FILTER: PerformanceCrossFilter = {
  kamId: null,
  clientId: null,
  regionId: null,
  supplierId: null,
  assetId: null,
  performanceStatus: null,
  trendPointKey: null,
};

/**
 * Client-id set implied by the CLIENT-DERIVED dimensions only (kamId,
 * regionId, clientId) -- never supplierId/assetId, which are direct
 * trip-level attributes with no client-id concept of their own.
 *
 * Returns null (meaning "no restriction") when none of the three client-
 * derived fields are set -- callers must treat null as "don't narrow",
 * not as "match nothing". When more than one is set simultaneously (e.g.
 * kamId + clientId, from drilling into one client inside a KAM's
 * breakdown), the result is their INTERSECTION, not a union -- narrowing
 * further, never widening back out.
 */
export function resolveClientIdsForFilter(
  crossFilter: Pick<PerformanceCrossFilter, "kamId" | "regionId" | "clientId">,
  clients: readonly { id: string }[],
  kamAssignments: Record<string, string>,
  clientRegions: Record<string, string>,
): Set<string> | null {
  const { kamId, regionId, clientId } = crossFilter;
  if (!kamId && !regionId && !clientId) return null;

  let ids: Set<string> | null = null;
  const narrow = (matches: (id: string) => boolean) => {
    const next = new Set(clients.map((c) => c.id).filter(matches));
    ids = ids == null ? next : new Set([...ids].filter((id) => next.has(id)));
  };

  if (kamId) narrow((id) => kamAssignments[id] === kamId);
  if (regionId) narrow((id) => clientRegions[id] === regionId);
  if (clientId) narrow((id) => id === clientId);

  return ids ?? new Set();
}

/**
 * Applies the full PerformanceCrossFilter to a trip list.
 *   - clientIdSet (from resolveClientIdsForFilter, above) narrows by the
 *     client-derived dimensions.
 *   - supplierId / assetId are direct trip-field matches (trip.supplier_id;
 *     trip.vehicle_id OR trip.driver_id -- vehicle and driver ids never
 *     collide across tables, so a single assetId field can match either
 *     without needing to know in advance which kind it is).
 * With an entirely empty crossFilter (clientIdSet null, supplierId/assetId
 * unset), returns the exact input array reference -- the "no cross-filter"
 * case must be identical to the pre-Performance, unfiltered calculation.
 */
export function filterTripsForCrossFilter(
  trips: readonly TripRow[],
  crossFilter: Pick<PerformanceCrossFilter, "supplierId" | "assetId">,
  clientIdSet: Set<string> | null,
): TripRow[] {
  const { supplierId, assetId } = crossFilter;
  if (clientIdSet == null && !supplierId && !assetId) return trips as TripRow[];
  return trips.filter((trip) => {
    if (clientIdSet != null && (!trip.client_id || !clientIdSet.has(trip.client_id))) {
      return false;
    }
    if (supplierId && trip.supplier_id !== supplierId) return false;
    if (assetId && trip.vehicle_id !== assetId && trip.driver_id !== assetId) return false;
    return true;
  });
}

/** All month keys spanning the FULL selected period (not to-date) -- e.g.
 * for a quarter, all three months, not just the months through the
 * selected one the way rollupMonthKeys (actuals) computes. Used only for
 * summing entity targets across a complete period. */
export function monthKeysInPeriod(selectedMonthKey: string, rollup: GoalsRollup): string[] {
  const { start, end } = periodBounds(selectedMonthKey, rollup);
  const keys: string[] = [];
  const cursor = new Date(start);
  while (cursor.getTime() < end.getTime()) {
    keys.push(ymToMonthKey(cursor.getFullYear(), cursor.getMonth()));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return keys;
}

/**
 * Period Target under the active cross-filter -- reusing existing entity
 * target storage, never inventing a new persistent KAM/Region/Asset target
 * record:
 *   - assetId set -> that one vehicle's or driver's own target (whichever
 *     bucket has it), independent of any client-side filter also active.
 *   - supplierId set (no assetId) -> no target exists for suppliers at all
 *     (no GoalFocus "supplier" case) -- hasTarget must be false, never a
 *     fabricated or allocated number.
 *   - otherwise -> clientIdSet null means the org-wide aggregate target
 *     (unchanged); clientIdSet non-null means the SUM of each matching
 *     client's own target across the full period's months. Per-client
 *     targets have no margin component (EntityTargetMetrics has no
 *     marginPct), so marginPct is always 0 here -- correctly making
 *     Margin show "no target set" under any entity-level filter, matching
 *     the same "don't fabricate" rule already applied to Supplier.
 */
export function resolveFilteredPeriodTarget(
  store: NetworkGoalsStore,
  selectedMonthKey: string,
  rollup: GoalsRollup,
  crossFilter: Pick<PerformanceCrossFilter, "supplierId" | "assetId">,
  clientIdSet: Set<string> | null,
): SalesTargetMetrics {
  const { supplierId, assetId } = crossFilter;

  if (assetId) {
    const keys = monthKeysInPeriod(selectedMonthKey, rollup);
    const vehicle = sumEntityTargetsForKeys(store, keys, "vehicle", assetId);
    const driver = sumEntityTargetsForKeys(store, keys, "driver", assetId);
    const target = vehicle.revenueInr > 0 || vehicle.tripCount > 0 ? vehicle : driver;
    return { revenueInr: target.revenueInr, tripCount: target.tripCount, marginPct: 0 };
  }

  if (supplierId) {
    return { revenueInr: 0, tripCount: 0, marginPct: 0 };
  }

  if (clientIdSet == null) {
    return resolvePeriodTarget(store, selectedMonthKey, rollup);
  }

  const { revenueInr, tripCount } = sumClientTargetsForIds(store, selectedMonthKey, rollup, clientIdSet);
  return { revenueInr, tripCount, marginPct: 0 };
}

/** Sums each client's own monthly target across the full selected period
 * (all months of a quarter/year, not just to-date) for a set of client
 * ids. Shared by resolveFilteredPeriodTarget and the KAM/Region breakdown
 * builders below -- one summing implementation, not duplicated per caller. */
function sumClientTargetsForIds(
  store: NetworkGoalsStore,
  selectedMonthKey: string,
  rollup: GoalsRollup,
  ids: Iterable<string>,
): EntityTargetMetrics {
  const keys = monthKeysInPeriod(selectedMonthKey, rollup);
  let revenueInr = 0;
  let tripCount = 0;
  for (const id of ids) {
    const t = sumEntityTargetsForKeys(store, keys, "client", id);
    revenueInr += t.revenueInr;
    tripCount += t.tripCount;
  }
  return { revenueInr, tripCount };
}

/**
 * Receivable is filtered by clientIdSet (a valid, direct client attribution
 * chain) when one is active. Payable (supplier + driver dues) has NO valid
 * KAM/Region/Client attribution -- callers must always compute Payable
 * from the FULL, unfiltered clients/suppliers/drivers/trips/transactions
 * and show a "Not affected by this filter" label whenever kamId or
 * regionId is set, never a fabricated filtered number. This function does
 * not compute Payable itself (that's computePayableReceivableSnapshot,
 * unchanged) -- it only answers whether the label should show.
 */
export function isPayableAffectedByFilter(
  crossFilter: Pick<PerformanceCrossFilter, "kamId" | "regionId">,
): boolean {
  return crossFilter.kamId == null && crossFilter.regionId == null;
}

// ─── Performance: KAM/Region/Supplier/Asset breakdowns (Phase 1 Commit 6) ─────
//
// All six perspectives now read from the SAME filteredTrips/filteredClients
// the KPI band and trend already use -- no separate analytics calculation.
// Two shapes, matching the commercial-vs-operational split already locked:
//   Commercial (KAM, Region, Client) -- has a real target to compare against
//     (client targets, summed via sumClientTargetsForIds -- reused, not
//     duplicated, from resolveFilteredPeriodTarget's own logic).
//   Operational (Supplier, Asset) -- no target concept exists for these
//     (no GoalFocus "supplier" case; Asset intentionally shown in the same
//     trips/sales/cost/margin shape as Supplier here, not target/
//     achievement, per the locked per-perspective column spec) -- shows
//     Previous period / Growth instead, reusing computeTripMetrics +
//     changePct, the same functions the KPI band already uses.
//
// Both only include entities with at least one matching trip in the
// current filtered context -- "operators who actually operated trips",
// not every supplier/KAM/region/asset that merely exists in the org.

export type PerformanceCommercialBreakdownRow = {
  id: string;
  name: string;
  actualRevenue: number;
  actualTrips: number;
  targetRevenue: number;
  hasTarget: boolean;
  achievement: number | null;
  previousActualRevenue: number;
  hasPreviousData: boolean;
  growthPct: number | null;
};

export type PerformanceOperationalBreakdownRow = {
  id: string;
  name: string;
  actualRevenue: number;
  actualTrips: number;
  actualCost: number;
  marginPct: number;
  previousActualRevenue: number;
  hasPreviousData: boolean;
  growthPct: number | null;
};

function groupTripsByKey(
  trips: readonly TripRow[],
  keyOf: (trip: TripRow) => string | null,
): Map<string, TripRow[]> {
  const map = new Map<string, TripRow[]>();
  for (const trip of trips) {
    const key = keyOf(trip);
    if (!key) continue;
    const bucket = map.get(key);
    if (bucket) bucket.push(trip);
    else map.set(key, [trip]);
  }
  return map;
}

/** KAM breakdown: only KAMs with at least one assigned client that has a
 * matching trip in the current filtered context -- an assigned-but-inactive
 * KAM doesn't clutter the table. Client attribution only, per the locked
 * rule -- there is no trip.kam_id; every row here traces back through
 * kamAssignments[client_id]. */
export function buildKamBreakdown(
  store: NetworkGoalsStore,
  trips: readonly TripRow[],
  previousTrips: readonly TripRow[],
  kamById: ReadonlyMap<string, { name: string }>,
  selectedMonthKey: string,
  rollup: GoalsRollup,
): PerformanceCommercialBreakdownRow[] {
  const { kamAssignments } = store;
  const byKam = new Map<string, Set<string>>(); // kamId -> client ids seen in trips
  const tripsByClient = groupTripsByKey(trips, (t) => t.client_id);
  const prevTripsByClient = groupTripsByKey(previousTrips, (t) => t.client_id);
  for (const clientId of tripsByClient.keys()) {
    const kamId = kamAssignments[clientId];
    if (!kamId) continue;
    const set = byKam.get(kamId) ?? new Set<string>();
    set.add(clientId);
    byKam.set(kamId, set);
  }

  const rows: PerformanceCommercialBreakdownRow[] = [];
  for (const [kamId, clientIds] of byKam) {
    let revenueInr = 0;
    let tripCount = 0;
    let prevRevenueInr = 0;
    for (const clientId of clientIds) {
      revenueInr += computeTripMetrics(tripsByClient.get(clientId) ?? []).revenueInr;
      tripCount += computeTripMetrics(tripsByClient.get(clientId) ?? []).tripCount;
      prevRevenueInr += computeTripMetrics(prevTripsByClient.get(clientId) ?? []).revenueInr;
    }
    const target = sumClientTargetsForIds(store, selectedMonthKey, rollup, clientIds);
    const hasTarget = target.revenueInr > 0;
    rows.push({
      id: kamId,
      name: kamById.get(kamId)?.name ?? kamId,
      actualRevenue: revenueInr,
      actualTrips: tripCount,
      targetRevenue: target.revenueInr,
      hasTarget,
      achievement: hasTarget ? achievementPct(revenueInr, target.revenueInr) : null,
      previousActualRevenue: prevRevenueInr,
      hasPreviousData: prevRevenueInr > 0,
      growthPct: changePct(revenueInr, prevRevenueInr),
    });
  }
  return rows.sort((a, b) => b.actualRevenue - a.actualRevenue);
}

/** Region breakdown -- identical shape and reasoning to KAM, grouped by
 * clientRegions[client_id] instead of kamAssignments. Same client-
 * attribution-only rule; no trip.region field exists or is invented. */
export function buildRegionBreakdown(
  store: NetworkGoalsStore,
  trips: readonly TripRow[],
  previousTrips: readonly TripRow[],
  selectedMonthKey: string,
  rollup: GoalsRollup,
): PerformanceCommercialBreakdownRow[] {
  const { clientRegions } = store;
  const byRegion = new Map<string, Set<string>>();
  const tripsByClient = groupTripsByKey(trips, (t) => t.client_id);
  const prevTripsByClient = groupTripsByKey(previousTrips, (t) => t.client_id);
  for (const clientId of tripsByClient.keys()) {
    const region = clientRegions[clientId];
    if (!region) continue;
    const set = byRegion.get(region) ?? new Set<string>();
    set.add(clientId);
    byRegion.set(region, set);
  }

  const rows: PerformanceCommercialBreakdownRow[] = [];
  for (const [region, clientIds] of byRegion) {
    let revenueInr = 0;
    let tripCount = 0;
    let prevRevenueInr = 0;
    for (const clientId of clientIds) {
      const m = computeTripMetrics(tripsByClient.get(clientId) ?? []);
      revenueInr += m.revenueInr;
      tripCount += m.tripCount;
      prevRevenueInr += computeTripMetrics(prevTripsByClient.get(clientId) ?? []).revenueInr;
    }
    const target = sumClientTargetsForIds(store, selectedMonthKey, rollup, clientIds);
    const hasTarget = target.revenueInr > 0;
    rows.push({
      id: region,
      name: region,
      actualRevenue: revenueInr,
      actualTrips: tripCount,
      targetRevenue: target.revenueInr,
      hasTarget,
      achievement: hasTarget ? achievementPct(revenueInr, target.revenueInr) : null,
      previousActualRevenue: prevRevenueInr,
      hasPreviousData: prevRevenueInr > 0,
      growthPct: changePct(revenueInr, prevRevenueInr),
    });
  }
  return rows.sort((a, b) => b.actualRevenue - a.actualRevenue);
}

/** Supplier breakdown -- direct trip.supplier_id grouping, no client
 * indirection. Only suppliers with a matching trip appear -- never every
 * supplier in the org roster. No target column, ever: no GoalFocus
 * "supplier" case exists in the target model, so hasTarget is not part of
 * this row shape at all (unlike the commercial rows, where it's an
 * explicit null-vs-real-target distinction). */
export function buildSupplierBreakdown(
  trips: readonly TripRow[],
  previousTrips: readonly TripRow[],
  supplierById: ReadonlyMap<string, { name: string }>,
): PerformanceOperationalBreakdownRow[] {
  const tripsBySupplier = groupTripsByKey(trips, (t) => t.supplier_id);
  const prevBySupplier = groupTripsByKey(previousTrips, (t) => t.supplier_id);

  const rows: PerformanceOperationalBreakdownRow[] = [];
  for (const [supplierId, supplierTrips] of tripsBySupplier) {
    const m = computeTripMetrics(supplierTrips);
    const prevM = computeTripMetrics(prevBySupplier.get(supplierId) ?? []);
    rows.push({
      id: supplierId,
      name: supplierById.get(supplierId)?.name ?? supplierId,
      actualRevenue: m.revenueInr,
      actualTrips: m.tripCount,
      actualCost: supplierTrips.reduce((sum, t) => sum + Math.max(0, Number(t.supplier_rate) || 0), 0),
      marginPct: m.marginPct,
      previousActualRevenue: prevM.revenueInr,
      hasPreviousData: prevM.revenueInr > 0,
      growthPct: changePct(m.revenueInr, prevM.revenueInr),
    });
  }
  return rows.sort((a, b) => b.actualRevenue - a.actualRevenue);
}

/** Asset breakdown -- direct trip.vehicle_id or trip.driver_id grouping,
 * same operational shape as Supplier (trips/sales/cost/margin/previous/
 * growth), per the locked per-perspective column spec -- not the target/
 * achievement shape, even though a per-asset target does exist in
 * NetworkGoalsStore (that target already surfaces via the existing Goals
 * "Asset" focus; this breakdown is deliberately the operational view). */
export function buildAssetBreakdown(
  trips: readonly TripRow[],
  previousTrips: readonly TripRow[],
  assetFocus: "vehicle" | "driver",
  assetById: ReadonlyMap<string, { name: string }>,
): PerformanceOperationalBreakdownRow[] {
  const keyOf = (t: TripRow) => (assetFocus === "vehicle" ? t.vehicle_id : t.driver_id);
  const tripsByAsset = groupTripsByKey(trips, keyOf);
  const prevByAsset = groupTripsByKey(previousTrips, keyOf);

  const rows: PerformanceOperationalBreakdownRow[] = [];
  for (const [assetId, assetTrips] of tripsByAsset) {
    const m = computeTripMetrics(assetTrips);
    const prevM = computeTripMetrics(prevByAsset.get(assetId) ?? []);
    rows.push({
      id: assetId,
      name: assetById.get(assetId)?.name ?? assetId,
      actualRevenue: m.revenueInr,
      actualTrips: m.tripCount,
      actualCost: assetTrips.reduce((sum, t) => sum + Math.max(0, Number(t.supplier_rate) || 0), 0),
      marginPct: m.marginPct,
      previousActualRevenue: prevM.revenueInr,
      hasPreviousData: prevM.revenueInr > 0,
      growthPct: changePct(m.revenueInr, prevM.revenueInr),
    });
  }
  return rows.sort((a, b) => b.actualRevenue - a.actualRevenue);
}

// ─── Performance: Trip evidence (Phase 2 Commit 1) ────────────────────────────
//
// A thin, read-only mapping over already-filtered/period-scoped trips -- no
// recalculation, no new query. Columns are locked to exactly what the
// Progress modal shows: Trip ID, Date, Client, Supplier/Operator, Vehicle,
// Driver, Sales, Cost, Margin, Status. Name resolution prefers the caller's
// own lookup maps (already built once in the panel) and falls back to the
// trip's own denormalized name fields, same convention as
// buildSalesTripTableRows.

export type PerformanceTripEvidenceRow = {
  id: string;
  tripRef: string;
  dateLabel: string;
  clientName: string;
  supplierName: string;
  vehicleName: string;
  driverName: string;
  sales: number;
  cost: number;
  margin: number;
  statusLabel: string;
};

export function buildPerformanceTripEvidenceRows(
  trips: readonly TripRow[],
  lookups: {
    supplierById?: ReadonlyMap<string, { name: string }>;
    vehicleById?: ReadonlyMap<string, { name: string }>;
    driverById?: ReadonlyMap<string, { name: string }>;
  } = {},
): PerformanceTripEvidenceRow[] {
  const sorted = [...trips].sort((a, b) => {
    const ad = a.pickup_date ?? a.completed_at ?? a.created_at ?? "";
    const bd = b.pickup_date ?? b.completed_at ?? b.created_at ?? "";
    return bd.localeCompare(ad);
  });

  return sorted.map((trip) => {
    const sales = Math.max(0, Number(trip.client_price) || 0);
    const cost = Math.max(0, Number(trip.supplier_rate) || 0);
    const storedMargin = Number(trip.margin);
    const margin = Number.isFinite(storedMargin) ? storedMargin : sales - cost;
    const rawDate = trip.pickup_date ?? trip.completed_at ?? trip.created_at;
    const date = rawDate ? new Date(rawDate) : null;
    return {
      id: trip.id,
      tripRef: getTripOperationalDisplayCode(trip),
      dateLabel: date && Number.isFinite(date.getTime()) ? date.toLocaleDateString("en-IN") : "—",
      clientName: trip.client_name?.trim() || "—",
      supplierName:
        (trip.supplier_id && lookups.supplierById?.get(trip.supplier_id)?.name) ||
        trip.supplier_name?.trim() ||
        "—",
      vehicleName:
        (trip.vehicle_id && lookups.vehicleById?.get(trip.vehicle_id)?.name) ||
        trip.vehicle_display_number?.trim() ||
        "—",
      driverName:
        (trip.driver_id && lookups.driverById?.get(trip.driver_id)?.name) ||
        trip.driver_display_name?.trim() ||
        "—",
      sales,
      cost,
      margin,
      statusLabel: formatTripStatusLabel(trip.status),
    };
  });
}
