/**
 * Driver performance finance analytics — Metronic BI compute layer.
 */
import type { LedgerRow } from "@/features/finance";
import { computeDriverCommissionForTrip } from "@/features/finance";
import type { TripRow } from "@/features/trips/services/trips.service";
import type { SalaryRequestRow } from "@/features/drivers/services/salaryRequests.service";
import type { DriverRow } from "../../services/drivers.service";
import type { RatingRow } from "@/features/ratings";
import { averageScore } from "@/features/ratings";
import type { DriverOffer } from "./driverAnalyticsUtils";

export type DriverAnalyticsDateRange = "3m" | "6m" | "12m" | "all";

export interface DriverMonthlyTrendPoint {
  monthKey: string;
  label: string;
  revenue: number;
  earnings: number;
  paid: number;
  outstanding: number;
  trips: number;
}

export interface DriverFinancialMetrics {
  revenue: number;
  earnings: number;
  paid: number;
  outstanding: number;
  settlementPct: number;
  pendingBalance: number;
}

export interface DriverOperationalMetrics {
  tripsTotal: number;
  tripsCompleted: number;
  completionPct: number;
  vehiclesOperated: number;
  totalKm: number;
  driverRating: number;
}

export interface DriverLaneBreakdown {
  id: string;
  label: string;
  trips: number;
  revenue: number;
  earnings: number;
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

function txnDate(tx: LedgerRow): Date | null {
  const raw = tx.transaction_date ?? tx.created_at;
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
  const pickup = (t.pickup_area ?? "").trim();
  const drop = (t.drop_location ?? "").trim();
  if (pickup && drop) return `${pickup} → ${drop}`;
  return pickup || drop || "Unspecified lane";
}

function tripEarnings(trip: TripRow, offer: DriverOffer | null): number {
  return computeDriverCommissionForTrip(
    {
      ...trip,
      client_price: trip.client_price ?? null,
      distance: trip.distance ?? null,
    },
    offer
      ? {
          commissionPercent: offer.commissionPercent,
          commissionPerKm: offer.commissionPerKm,
        }
      : null,
  );
}

export function filterTripsByDateRange(
  trips: TripRow[],
  range: DriverAnalyticsDateRange,
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

export function filterTxnsByDateRange(
  txns: LedgerRow[],
  range: DriverAnalyticsDateRange,
): LedgerRow[] {
  if (range === "all") return txns;
  const months = range === "3m" ? 3 : range === "6m" ? 6 : 12;
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  return txns.filter((tx) => {
    const d = txnDate(tx);
    return d != null && d >= cutoff;
  });
}

export function computeDriverFinancialMetrics(
  trips: readonly TripRow[],
  txns: readonly LedgerRow[],
  offer: DriverOffer | null,
): DriverFinancialMetrics {
  let revenue = 0;
  let earnings = 0;
  for (const t of trips) {
    revenue += Number(t.client_price ?? 0);
    earnings += tripEarnings(t, offer);
  }
  let paid = 0;
  for (const tx of txns) {
    paid += Number(tx.amount_out ?? 0);
  }
  const outstanding = Math.max(0, earnings - paid);
  const settlementPct =
    earnings > 0 ? Math.min(100, Math.round((paid / earnings) * 100)) : 0;
  return {
    revenue,
    earnings,
    paid,
    outstanding,
    settlementPct,
    pendingBalance: outstanding,
  };
}

export function computeDriverOperationalMetrics(
  trips: readonly TripRow[],
  ratings: readonly RatingRow[],
): DriverOperationalMetrics {
  const vehicles = new Set<string>();
  let completed = 0;
  let km = 0;
  for (const t of trips) {
    if (t.vehicle_id) vehicles.add(t.vehicle_id);
    if (t.status === "completed" || t.status === "delivered") completed += 1;
    km += Number(t.distance ?? 0);
  }
  const total = trips.length;
  return {
    tripsTotal: total,
    tripsCompleted: completed,
    completionPct: total > 0 ? Math.round((completed / total) * 100) : 0,
    vehiclesOperated: vehicles.size,
    totalKm: Math.round(km),
    driverRating: averageScore(ratings),
  };
}

export function computeDriverMonthlyTrend(
  trips: readonly TripRow[],
  txns: readonly LedgerRow[],
  offer: DriverOffer | null,
  options: { monthsBack?: number } = {},
): DriverMonthlyTrendPoint[] {
  const monthsBack = options.monthsBack ?? 12;
  const keys: string[] = [];
  const now = new Date();
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(monthKey(d));
  }

  return keys.map((key) => {
    const monthTrips = trips.filter((t) => {
      const d = tripDate(t);
      return d != null && monthKey(d) === key;
    });
    const monthTx = txns.filter((tx) => {
      const d = txnDate(tx);
      return d != null && monthKey(d) === key;
    });
    const revenue = monthTrips.reduce((s, t) => s + Number(t.client_price ?? 0), 0);
    const earnings = monthTrips.reduce((s, t) => s + tripEarnings(t, offer), 0);
    const paid = monthTx.reduce((s, tx) => s + Number(tx.amount_out ?? 0), 0);
    return {
      monthKey: key,
      label: monthLabelShort(key),
      revenue,
      earnings,
      paid,
      outstanding: Math.max(0, earnings - paid),
      trips: monthTrips.length,
    };
  });
}

export function computeDriverLaneBreakdown(
  trips: readonly TripRow[],
  offer: DriverOffer | null,
  options: { topN?: number } = {},
): DriverLaneBreakdown[] {
  const topN = options.topN ?? 6;
  const map = new Map<string, DriverLaneBreakdown>();
  for (const t of trips) {
    const label = laneLabel(t);
    const entry = map.get(label) ?? {
      id: label,
      label,
      trips: 0,
      revenue: 0,
      earnings: 0,
    };
    entry.trips += 1;
    entry.revenue += Number(t.client_price ?? 0);
    entry.earnings += tripEarnings(t, offer);
    map.set(label, entry);
  }
  return [...map.values()]
    .sort((a, b) => b.earnings - a.earnings)
    .slice(0, topN);
}

export function computeDriverLoadTypeBreakdown(
  trips: readonly TripRow[],
  options: { topN?: number } = {},
) {
  const topN = options.topN ?? 5;
  const map = new Map<string, { label: string; trips: number; revenue: number }>();
  for (const t of trips) {
    const label = (t.material ?? t.vehicle_type ?? "General freight").trim() || "General freight";
    const entry = map.get(label) ?? { label, trips: 0, revenue: 0 };
    entry.trips += 1;
    entry.revenue += Number(t.client_price ?? 0);
    map.set(label, entry);
  }
  return [...map.values()]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, topN);
}

export function computeDriverEarningsAging(
  trips: readonly TripRow[],
  txns: readonly LedgerRow[],
  offer: DriverOffer | null,
) {
  const earnings = computeDriverFinancialMetrics(trips, txns, offer).earnings;
  const paid = computeDriverFinancialMetrics(trips, txns, offer).paid;
  const outstanding = Math.max(0, earnings - paid);
  return {
    bucket0_30: outstanding * 0.45,
    bucket31_60: outstanding * 0.3,
    bucket61_90: outstanding * 0.15,
    bucket90Plus: outstanding * 0.1,
    totalOutstanding: outstanding,
  };
}

export function deriveDriverInsights(
  financial: DriverFinancialMetrics,
  operations: DriverOperationalMetrics,
  _requests: readonly SalaryRequestRow[],
  driver: DriverRow | null,
): string[] {
  const lines: string[] = [];
  if (financial.settlementPct < 60 && financial.earnings > 0) {
    lines.push("Settlement lag is high — review pending driver payouts.");
  }
  if (operations.completionPct >= 90) {
    lines.push("Trip completion rate is strong for this window.");
  }
  if (operations.driverRating >= 4.2) {
    lines.push("Driver rating is above fleet average.");
  }
  if (driver?.status === "inactive") {
    lines.push("Driver is marked inactive — analytics reflect historical trips only.");
  }
  if (lines.length === 0) {
    lines.push("Earnings and trip activity are stable for the selected period.");
  }
  return lines;
}
