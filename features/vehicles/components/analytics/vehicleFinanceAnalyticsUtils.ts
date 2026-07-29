/**
 * Vehicle asset finance analytics — Metronic BI compute layer.
 */
import type { LedgerRow } from "@/features/finance";
import type { TripRow } from "@/features/trips/services/trips.service";
import { formatLaneRouteLabel } from "@/lib/placeCityState.util";
import type { MissionRow } from "./analyticsUtils";
import { computeKpiSummary, computeExpenseCategories } from "./analyticsUtils";

export type VehicleAnalyticsDateRange = "3m" | "6m" | "12m" | "all";

export interface VehicleMonthlyTrendPoint {
  monthKey: string;
  label: string;
  revenue: number;
  expense: number;
  profit: number;
  trips: number;
  marginPct: number;
}

export interface VehicleFinancialMetrics {
  revenue: number;
  expense: number;
  profit: number;
  marginPct: number;
  utilizationPct: number;
  revenuePerDay: number;
}

export interface VehicleOperationalMetrics {
  tripsTotal: number;
  tripsCompleted: number;
  tripsCancelled: number;
  completionPct: number;
  cancellationPct: number;
  onTimePct: number;
  totalKm: number;
}

export interface VehicleLaneBreakdown {
  id: string;
  label: string;
  trips: number;
  revenue: number;
  profit: number;
}

export interface VehicleLoadTypeBreakdown {
  label: string;
  trips: number;
  revenue: number;
}

const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function tripDate(t: TripRow): Date | null {
  const raw = t.pickup_date ?? t.created_at;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isFinite(d.getTime()) ? d : null;
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabelShort(key: string): string {
  const idx = parseInt(key.slice(5, 7), 10) - 1;
  return MONTH_SHORT[idx] ?? key.slice(5, 7);
}

function laneLabel(t: TripRow): string {
  return formatLaneRouteLabel(t.pickup_area, t.drop_location) || "Unspecified lane";
}

export function filterVehicleRowsByDateRange<T extends { trip: TripRow }>(
  rows: T[],
  range: VehicleAnalyticsDateRange,
): T[] {
  if (range === "all") return rows;
  const months = range === "3m" ? 3 : range === "6m" ? 6 : 12;
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  return rows.filter((row) => {
    const d = tripDate(row.trip);
    return d != null && d >= cutoff;
  });
}

export function filterTripsByDateRange(
  trips: TripRow[],
  range: VehicleAnalyticsDateRange,
): TripRow[] {
  if (range === "all") return trips;
  const months = range === "3m" ? 3 : range === "6m" ? 6 : 12;
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  return trips.filter((t) => {
    const d = tripDate(t);
    return d != null && d >= cutoff;
  });
}

export function computeVehicleFinancialMetrics(
  rows: readonly MissionRow[],
): VehicleFinancialMetrics {
  // No vehicle context here; this caller reads only the aggregate KPI fields
  // (revenue/expense/profit/margin/utilization), not vehicle-dependent renewals.
  const kpi = computeKpiSummary([...rows], null);
  return {
    revenue: kpi.totalRevenue,
    expense: kpi.totalExpense,
    profit: kpi.totalProfit,
    marginPct: kpi.netMargin,
    utilizationPct: kpi.utilizationPct,
    revenuePerDay: kpi.revenuePerDay,
  };
}

export function computeVehicleOperationalMetrics(
  trips: readonly TripRow[],
): VehicleOperationalMetrics {
  let completed = 0;
  let cancelled = 0;
  let onTime = 0;
  let onTimeEligible = 0;
  let km = 0;

  for (const t of trips) {
    if (t.status === "completed" || t.status === "delivered") completed += 1;
    if (t.status === "cancelled") cancelled += 1;
    km += Number(t.distance ?? 0);
    if (t.completed_at && t.pickup_date) {
      onTimeEligible += 1;
      const completedAt = new Date(t.completed_at);
      const pickup = new Date(t.pickup_date);
      if (completedAt <= new Date(pickup.getTime() + 86400000)) onTime += 1;
    }
  }

  const total = trips.length;
  return {
    tripsTotal: total,
    tripsCompleted: completed,
    tripsCancelled: cancelled,
    completionPct: total > 0 ? Math.round((completed / total) * 100) : 0,
    cancellationPct: total > 0 ? Math.round((cancelled / total) * 100) : 0,
    onTimePct: onTimeEligible > 0 ? Math.round((onTime / onTimeEligible) * 100) : 0,
    totalKm: Math.round(km),
  };
}

export function computeVehicleMonthlyTrend(
  rows: readonly MissionRow[],
  options: { monthsBack?: number } = {},
): VehicleMonthlyTrendPoint[] {
  const monthsBack = options.monthsBack ?? 12;
  const keys: string[] = [];
  const now = new Date();
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(monthKey(d));
  }

  return keys.map((key) => {
    const slice = rows.filter((r) => {
      const d = tripDate(r.trip);
      return d != null && monthKey(d) === key;
    });
    const revenue = slice.reduce((s, r) => s + r.sales, 0);
    const expense = slice.reduce((s, r) => s + r.expense, 0);
    const profit = revenue - expense;
    return {
      monthKey: key,
      label: monthLabelShort(key),
      revenue,
      expense,
      profit,
      trips: slice.length,
      marginPct: revenue > 0 ? (profit / revenue) * 100 : 0,
    };
  });
}

export function computeVehicleLaneBreakdown(
  rows: readonly MissionRow[],
  options: { topN?: number } = {},
): VehicleLaneBreakdown[] {
  const topN = options.topN ?? 6;
  const map = new Map<string, VehicleLaneBreakdown>();
  for (const row of rows) {
    const label = laneLabel(row.trip);
    const entry = map.get(label) ?? {
      id: label,
      label,
      trips: 0,
      revenue: 0,
      profit: 0,
    };
    entry.trips += 1;
    entry.revenue += row.sales;
    entry.profit += row.profit;
    map.set(label, entry);
  }
  return [...map.values()]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, topN);
}

export function computeVehicleLoadTypeBreakdown(
  trips: readonly TripRow[],
  options: { topN?: number } = {},
): VehicleLoadTypeBreakdown[] {
  const topN = options.topN ?? 5;
  const map = new Map<string, VehicleLoadTypeBreakdown>();
  for (const t of trips) {
    const label = (t.load_type ?? "General freight").trim() || "General freight";
    const entry = map.get(label) ?? { label, trips: 0, revenue: 0 };
    entry.trips += 1;
    entry.revenue += Number(t.client_price ?? t.supplier_rate ?? 0);
    map.set(label, entry);
  }
  return [...map.values()]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, topN);
}

export function computeVehicleExpenseBuckets(rows: readonly MissionRow[]) {
  const cats = computeExpenseCategories([...rows]);
  return {
    bucket0_30: cats.find((c) => c.label.toLowerCase().includes("fuel"))?.amount ?? 0,
    bucket31_60: cats.find((c) => c.label.toLowerCase().includes("toll"))?.amount ?? 0,
    bucket61_90: cats.find((c) => c.label.toLowerCase().includes("driver"))?.amount ?? 0,
    bucket90Plus: cats
      .filter(
        (c) =>
          !c.label.toLowerCase().includes("fuel") &&
          !c.label.toLowerCase().includes("toll") &&
          !c.label.toLowerCase().includes("driver"),
      )
      .reduce((s, c) => s + c.amount, 0),
    categories: cats,
  };
}

export function deriveVehicleInsights(
  financial: VehicleFinancialMetrics,
  operations: VehicleOperationalMetrics,
): string[] {
  const lines: string[] = [];
  if (financial.profit < 0) {
    lines.push("Asset is running below break-even on filtered trips — review expense mix.");
  } else if (financial.marginPct >= 18) {
    lines.push("Strong net margin on this vehicle for the selected period.");
  }
  if (financial.utilizationPct < 40) {
    lines.push("Utilization is low — consider redeploying or matching more loads.");
  }
  if (operations.cancellationPct > 12) {
    lines.push("Cancellation rate is elevated — check assignment quality.");
  }
  if (lines.length === 0) {
    lines.push("Performance is stable for the current filter window.");
  }
  return lines;
}

export function filterLedgerByTripIds(
  txns: LedgerRow[],
  tripIds: Set<string>,
  range: VehicleAnalyticsDateRange,
): LedgerRow[] {
  let list = txns.filter((tx) => tx.trip_id != null && tripIds.has(tx.trip_id));
  if (range === "all") return list;
  const months = range === "3m" ? 3 : range === "6m" ? 6 : 12;
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  return list.filter((tx) => {
    const raw = tx.transaction_date ?? tx.created_at;
    if (!raw) return false;
    const d = new Date(raw);
    return Number.isFinite(d.getTime()) && d >= cutoff;
  });
}
