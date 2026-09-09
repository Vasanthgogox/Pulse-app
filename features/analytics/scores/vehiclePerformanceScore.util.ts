/**
 * Vehicle Performance Score — pure TypeScript engine.
 * ============================================================================
 *
 * Mirrors `public.compute_vehicle_performance_score(uuid, uuid)` in
 * `supabase/migrations/20260828040000_vehicle_score.sql`. Use this in the
 * UI when trips + transactions are already loaded for a single vehicle
 * (e.g. `VehicleDetailScreen`); use the SQL RPC for fleet-wide rankings.
 *
 * Composite:
 *   profitability    30%   margin % (clamped 0..100)
 *   utilization      25%   distinct active months / window
 *   completion       20%   completed / total
 *   cost-efficiency  15%   100 - operating-expense-ratio
 *   consistency      10%   1 - CV(trips per month)
 *
 * Window: last 6 months. Keep in lockstep with the SQL function.
 */

import type { VehiclePerformanceScore } from "../types/analytics.types";
import { scoreLevelFromValue } from "../types/analytics.types";

// ─────────────────────────────────────────────────────────────────────────────
// Input shapes
// ─────────────────────────────────────────────────────────────────────────────

export interface VehicleScoreTripInput {
  id: string;
  vehicle_id: string | null;
  client_price: number | null;
  status: string | null;
  distance: number | null;
  pickup_date: string | null;
  created_at: string | null;
}

export interface VehicleScoreTxnInput {
  trip_id: string | null;
  amount_out: number | null;
  contact_type?: "client" | "supplier" | "driver" | "dco" | null;
  transaction_date: string | null;
  created_at: string | null;
}

export interface VehicleScoreOptions {
  now?: Date;
  windowMonths?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function pickupDateOf(t: VehicleScoreTripInput): Date | null {
  const raw = t.pickup_date ?? t.created_at;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isFinite(d.getTime()) ? d : null;
}

/** Population standard deviation — matches PG's `stddev_pop`. */
function stddevPop(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Engine
// ─────────────────────────────────────────────────────────────────────────────

export function computeVehiclePerformanceScore(
  vehicleId: string,
  trips: readonly VehicleScoreTripInput[],
  transactions: readonly VehicleScoreTxnInput[],
  options: VehicleScoreOptions = {},
): VehiclePerformanceScore | null {
  const now = options.now ?? new Date();
  const windowMonths = options.windowMonths ?? 6;
  const windowStart = new Date(now);
  windowStart.setMonth(windowStart.getMonth() - windowMonths);

  // 1. Restrict trips to vehicle + window.
  const vehicleTrips = trips
    .filter((t) => t.vehicle_id === vehicleId)
    .map((t) => ({ trip: t, date: pickupDateOf(t) }))
    .filter(
      (entry): entry is { trip: VehicleScoreTripInput; date: Date } =>
        entry.date !== null && entry.date >= windowStart,
    );

  if (vehicleTrips.length === 0) return null;

  // 2. Aggregate.
  const tripsTotal = vehicleTrips.length;
  let tripsCompleted = 0;
  let tripsCancelled = 0;
  let revenue = 0;
  let distance = 0;
  const monthBuckets = new Map<string, number>();
  const tripIdSet = new Set<string>();

  for (const { trip, date } of vehicleTrips) {
    tripIdSet.add(trip.id);
    if (trip.status === "completed") tripsCompleted += 1;
    if (trip.status === "cancelled") tripsCancelled += 1;
    revenue += Number(trip.client_price ?? 0);
    distance += Number(trip.distance ?? 0);
    const mk = monthKey(date);
    monthBuckets.set(mk, (monthBuckets.get(mk) ?? 0) + 1);
  }

  // 3. Expense from transactions attached to these trips, excluding driver
  //    compensation (matches SQL convention) and DCO settlement (DCO-6:
  //    same reasoning — a DCO's payment is labor+ownership compensation,
  //    not a vehicle running cost like fuel/toll/maintenance).
  let expense = 0;
  for (const tx of transactions) {
    if (!tx.trip_id || !tripIdSet.has(tx.trip_id)) continue;
    if (tx.contact_type === "driver" || tx.contact_type === "dco") continue;
    const out = Number(tx.amount_out ?? 0);
    if (out <= 0) continue;
    expense += out;
  }

  // 4. Sub-scores.
  const marginPct = revenue > 0 ? ((revenue - expense) / revenue) * 100 : 0;
  const expenseRatio = revenue > 0 ? (expense / revenue) * 100 : 0;
  const completionPct = (tripsCompleted / tripsTotal) * 100;
  const distinctMonths = monthBuckets.size;
  const monthTripCounts = Array.from(monthBuckets.values());
  const tripsPerMonthAvg =
    monthTripCounts.length > 0
      ? monthTripCounts.reduce((a, b) => a + b, 0) / monthTripCounts.length
      : 0;
  const tripsPerMonthStddev = stddevPop(monthTripCounts);
  const tripsPerMonthCv =
    tripsPerMonthAvg > 0 ? tripsPerMonthStddev / tripsPerMonthAvg : 0;

  const profitabilityScore = clamp(marginPct, 0, 100);
  const utilizationScore = clamp(distinctMonths * (100 / windowMonths), 0, 100);
  const completionScore = clamp(completionPct, 0, 100);
  const costEfficiencyScore = clamp(100 - expenseRatio, 0, 100);
  const consistencyScore =
    tripsPerMonthAvg === 0 ? 0 : clamp(100 - tripsPerMonthCv * 100, 0, 100);

  const score = Math.round(
    profitabilityScore * 0.30 +
      utilizationScore * 0.25 +
      completionScore * 0.20 +
      costEfficiencyScore * 0.15 +
      consistencyScore * 0.10,
  );

  return {
    score,
    level: scoreLevelFromValue(score),
    profitabilityScore: Math.round(profitabilityScore),
    utilizationScore: Math.round(utilizationScore),
    completionScore: Math.round(completionScore),
    costEfficiencyScore: Math.round(costEfficiencyScore),
    consistencyScore: Math.round(consistencyScore),
    breakdown: {
      tripsTotal,
      tripsCompleted,
      tripsCancelled,
      revenue: Math.round(revenue * 100) / 100,
      expense: Math.round(expense * 100) / 100,
      profit: Math.round((revenue - expense) * 100) / 100,
      marginPct: Math.round(marginPct * 100) / 100,
      expenseRatio: Math.round(expenseRatio * 100) / 100,
      distance: Math.round(distance * 100) / 100,
      distinctMonths,
      tripsPerMonthAvg: Math.round(tripsPerMonthAvg * 100) / 100,
      tripsPerMonthCv: Math.round(tripsPerMonthCv * 1000) / 1000,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Badge derivation
// ─────────────────────────────────────────────────────────────────────────────

/** Derive `VehicleBadge`s from a computed score. Mirrors the badge logic
 *  in `<VehicleIntelligenceSection>` — pure / memoizable. */
export function deriveVehicleBadges(
  score: VehiclePerformanceScore | null,
): ReadonlyArray<
  | "top_earner"
  | "high_risk"
  | "most_utilized"
  | "underutilized"
  | "cost_efficient"
  | "expensive"
  | "consistent"
> {
  if (!score) return [];
  const out: Array<
    | "top_earner"
    | "high_risk"
    | "most_utilized"
    | "underutilized"
    | "cost_efficient"
    | "expensive"
    | "consistent"
  > = [];

  if (score.level === "excellent") out.push("top_earner");
  if (score.level === "critical") out.push("high_risk");
  if (score.utilizationScore >= 90) out.push("most_utilized");
  if (score.utilizationScore < 40 && score.breakdown.tripsTotal > 0)
    out.push("underutilized");
  if (
    score.costEfficiencyScore >= 80 &&
    score.profitabilityScore >= 70
  )
    out.push("cost_efficient");
  if (
    score.breakdown.expenseRatio >= 80 ||
    score.breakdown.marginPct < 0
  )
    out.push("expensive");
  if (score.consistencyScore >= 80) out.push("consistent");

  return out;
}
