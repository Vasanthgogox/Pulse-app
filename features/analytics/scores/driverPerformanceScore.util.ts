/**
 * Driver Performance Score — pure TypeScript engine.
 * ============================================================================
 *
 * Mirrors `public.compute_driver_performance_score(uuid, uuid)` in
 * `supabase/migrations/20260828020000_analytics_rpcs.sql`.
 *
 * Composite:
 *   settlement       30%
 *   completion       25%
 *   on-time          20%
 *   productivity     15%
 *   ratings          10%
 *
 * Window: last 6 months. Keep in sync with the SQL implementation.
 *
 * Distinct from `computeDriverKpiSummary` (in
 * `features/drivers/components/analytics/driverAnalyticsUtils.ts`) which
 * uses a 3-factor composite (settlement 40 / completion 30 / rating 30).
 * The 3-factor version is preserved for the existing single-driver
 * Analytics tab; this 5-factor version is used by the new Fleet Ranking
 * + Earnings Analytics tabs and is the canonical score going forward.
 */

import type { DriverPerformanceScore } from "../types/analytics.types";
import { scoreLevelFromValue } from "../types/analytics.types";

// ─────────────────────────────────────────────────────────────────────────────
// Input shapes
// ─────────────────────────────────────────────────────────────────────────────

export interface DriverScoreTripInput {
  driver_id: string | null;
  client_price: number | null;
  driver_commission: number | null;
  supplier_rate: number | null;
  status: string | null;
  pickup_date: string | null;
  completed_at: string | null;
  created_at: string | null;
}

export interface DriverScoreTxnInput {
  contact_id: string | null;
  contact_type: string | null;
  amount_out: number | null;
  transaction_date: string | null;
  created_at: string | null;
}

export interface DriverScoreRatingInput {
  rating: number | null;
}

export interface DriverScoreOptions {
  now?: Date;
  windowMonths?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const MS_PER_DAY = 1000 * 60 * 60 * 24;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function pickupDateOf(t: DriverScoreTripInput): Date | null {
  const raw = t.pickup_date ?? t.created_at;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isFinite(d.getTime()) ? d : null;
}

function txnDateOf(t: DriverScoreTxnInput): Date | null {
  const raw = t.transaction_date ?? t.created_at;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isFinite(d.getTime()) ? d : null;
}

/** Mirror of the SQL commission fallback chain: explicit
 *  `driver_commission` → 10% of supplier_rate → 10% of client_price. */
function driverEarning(t: DriverScoreTripInput): number {
  if (t.driver_commission && t.driver_commission > 0) return t.driver_commission;
  if (t.supplier_rate && t.supplier_rate > 0) return t.supplier_rate * 0.1;
  return (t.client_price ?? 0) * 0.1;
}

// ─────────────────────────────────────────────────────────────────────────────
// Engine
// ─────────────────────────────────────────────────────────────────────────────

export function computeDriverPerformanceScore(
  driverId: string,
  trips: readonly DriverScoreTripInput[],
  transactions: readonly DriverScoreTxnInput[],
  ratings: readonly DriverScoreRatingInput[] = [],
  options: DriverScoreOptions = {},
): DriverPerformanceScore | null {
  const now = options.now ?? new Date();
  const windowMonths = options.windowMonths ?? 6;
  const windowStart = new Date(now);
  windowStart.setMonth(windowStart.getMonth() - windowMonths);

  const driverTrips = trips
    .filter((t) => t.driver_id === driverId)
    .map((t) => ({ trip: t, date: pickupDateOf(t) }))
    .filter(
      (entry): entry is { trip: DriverScoreTripInput; date: Date } =>
        entry.date !== null && entry.date >= windowStart,
    );

  if (driverTrips.length === 0 && transactions.length === 0) return null;

  let revenue = 0;
  let earnings = 0;
  let tripsCompleted = 0;
  let onTime = 0;
  let onTimeEligible = 0;
  const distinctMonthsSet = new Set<string>();

  for (const { trip, date } of driverTrips) {
    revenue += trip.client_price ?? 0;
    earnings += driverEarning(trip);
    if (trip.status === "completed") tripsCompleted += 1;
    distinctMonthsSet.add(`${date.getFullYear()}-${date.getMonth()}`);
    if (trip.completed_at && trip.pickup_date) {
      onTimeEligible += 1;
      const completed = new Date(trip.completed_at);
      const pickup = new Date(trip.pickup_date);
      if (
        Number.isFinite(completed.getTime()) &&
        Number.isFinite(pickup.getTime())
      ) {
        const allowedEnd = new Date(pickup.getTime() + MS_PER_DAY);
        if (completed <= allowedEnd) onTime += 1;
      }
    }
  }

  let paid = 0;
  for (const tx of transactions) {
    if (tx.contact_id !== driverId) continue;
    if (tx.contact_type !== "driver") continue;
    if ((tx.amount_out ?? 0) <= 0) continue;
    const txDate = txnDateOf(tx);
    if (!txDate || txDate < windowStart) continue;
    paid += tx.amount_out ?? 0;
  }

  const ratingValues = ratings
    .map((r) => r.rating)
    .filter((r): r is number => typeof r === "number" && Number.isFinite(r));
  const avgRating =
    ratingValues.length > 0
      ? ratingValues.reduce((a, b) => a + b, 0) / ratingValues.length
      : 0;

  const tripsTotal = driverTrips.length;
  const completionPct =
    tripsTotal > 0 ? (tripsCompleted / tripsTotal) * 100 : 0;
  const onTimePct =
    onTimeEligible > 0 ? (onTime / onTimeEligible) * 100 : 0;
  const settlementScore =
    earnings > 0 ? Math.min((paid / earnings) * 100, 100) : 100;
  const productivityScore = clamp(
    distinctMonthsSet.size > 0
      ? (tripsTotal / distinctMonthsSet.size) * 5
      : 0,
    0,
    100,
  );
  const ratingsScore =
    ratingValues.length > 0 ? Math.min(avgRating * 20, 100) : 70;

  const score = Math.round(
    settlementScore * 0.3 +
      completionPct * 0.25 +
      onTimePct * 0.2 +
      productivityScore * 0.15 +
      ratingsScore * 0.1,
  );

  return {
    score,
    level: scoreLevelFromValue(score),
    settlementScore: Math.round(settlementScore),
    completionScore: Math.round(completionPct),
    onTimeScore: Math.round(onTimePct),
    productivityScore: Math.round(productivityScore),
    ratingsScore: Math.round(ratingsScore),
    breakdown: {
      tripsTotal,
      tripsCompleted,
      onTime,
      onTimeEligible,
      revenue6m: revenue,
      earnings6m: earnings,
      paid6m: paid,
      distinctMonths: distinctMonthsSet.size,
      avgRating: Math.round(avgRating * 100) / 100,
      ratingCount: ratingValues.length,
    },
  };
}
