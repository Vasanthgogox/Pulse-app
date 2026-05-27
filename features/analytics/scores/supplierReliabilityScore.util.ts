/**
 * Supplier Reliability Score — pure TypeScript engine.
 * ============================================================================
 *
 * Mirrors `public.compute_supplier_reliability_score(uuid, uuid)` in
 * `supabase/migrations/20260828020000_analytics_rpcs.sql`. Use this in the
 * `SupplierDetailScreen` analytics tab when trips are already cached;
 * use the server RPC for fleet-wide rankings.
 *
 * Composite:
 *   completion       30%
 *   on-time          25%
 *   cancellation     20%
 *   availability     15%
 *   pricing-stability 10%
 *
 * Window: last 6 months. Keep in sync with the SQL implementation.
 */

import type { SupplierReliabilityScore } from "../types/analytics.types";
import { scoreLevelFromValue } from "../types/analytics.types";

// ─────────────────────────────────────────────────────────────────────────────
// Input shape
// ─────────────────────────────────────────────────────────────────────────────

export interface SupplierScoreTripInput {
  id: string;
  supplier_id: string | null;
  supplier_rate: number | null;
  status: string | null;
  pickup_date: string | null;
  completed_at: string | null;
  created_at: string | null;
}

export interface SupplierScoreOptions {
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

function pickupDateOf(t: SupplierScoreTripInput): Date | null {
  const raw = t.pickup_date ?? t.created_at;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isFinite(d.getTime()) ? d : null;
}

/** Sample population standard deviation — matches PG's `stddev_pop`. */
function stddevPop(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

// ─────────────────────────────────────────────────────────────────────────────
// Engine
// ─────────────────────────────────────────────────────────────────────────────

export function computeSupplierReliabilityScore(
  supplierId: string,
  trips: readonly SupplierScoreTripInput[],
  options: SupplierScoreOptions = {},
): SupplierReliabilityScore | null {
  const now = options.now ?? new Date();
  const windowMonths = options.windowMonths ?? 6;
  const windowStart = new Date(now);
  windowStart.setMonth(windowStart.getMonth() - windowMonths);

  const supplierTrips = trips
    .filter((t) => t.supplier_id === supplierId)
    .map((t) => ({ trip: t, date: pickupDateOf(t) }))
    .filter(
      (entry): entry is { trip: SupplierScoreTripInput; date: Date } =>
        entry.date !== null && entry.date >= windowStart,
    );

  if (supplierTrips.length === 0) return null;

  let tripsCompleted = 0;
  let tripsCancelled = 0;
  let onTime = 0;
  let onTimeEligible = 0;
  const distinctMonthsSet = new Set<string>();
  const supplierRates: number[] = [];

  for (const { trip, date } of supplierTrips) {
    if (trip.status === "completed") tripsCompleted += 1;
    if (trip.status === "cancelled") tripsCancelled += 1;
    distinctMonthsSet.add(`${date.getFullYear()}-${date.getMonth()}`);
    if (trip.supplier_rate && trip.supplier_rate > 0)
      supplierRates.push(trip.supplier_rate);
    // On-time: completed within +1 day of pickup_date.
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
  const tripsTotal = supplierTrips.length;
  const completionPct = (tripsCompleted / tripsTotal) * 100;
  const cancellationPct = (tripsCancelled / tripsTotal) * 100;
  const onTimePct =
    onTimeEligible > 0 ? (onTime / onTimeEligible) * 100 : 0;
  const rateAvg =
    supplierRates.length > 0
      ? supplierRates.reduce((a, b) => a + b, 0) / supplierRates.length
      : 0;
  const rateStddev = stddevPop(supplierRates);

  const completionScore = completionPct;
  const onTimeScore = onTimePct;
  const cancellationScore = Math.max(100 - cancellationPct * 4, 0);
  const availabilityScore = clamp(
    (distinctMonthsSet.size / windowMonths) * 100,
    0,
    100,
  );
  const pricingScore =
    rateAvg === 0
      ? 100
      : clamp(100 - (rateStddev / rateAvg) * 200, 0, 100);

  const score = Math.round(
    completionScore * 0.3 +
      onTimeScore * 0.25 +
      cancellationScore * 0.2 +
      availabilityScore * 0.15 +
      pricingScore * 0.1,
  );

  return {
    score,
    level: scoreLevelFromValue(score),
    completionScore: Math.round(completionScore),
    onTimeScore: Math.round(onTimeScore),
    cancellationScore: Math.round(cancellationScore),
    availabilityScore: Math.round(availabilityScore),
    pricingScore: Math.round(pricingScore),
    breakdown: {
      tripsTotal,
      tripsCompleted,
      tripsCancelled,
      onTime,
      onTimeEligible,
      completionPct: Math.round(completionPct * 100) / 100,
      cancellationPct: Math.round(cancellationPct * 100) / 100,
      onTimePct: Math.round(onTimePct * 100) / 100,
      distinctMonths: distinctMonthsSet.size,
      rateStddev: Math.round(rateStddev * 100) / 100,
      rateAvg: Math.round(rateAvg * 100) / 100,
    },
  };
}

/** Derive `SupplierBadge`s from a computed score. */
export function deriveSupplierBadges(
  score: SupplierReliabilityScore | null,
): ReadonlyArray<
  | "preferred"
  | "high_risk"
  | "reliable"
  | "low_quality"
  | "best_value"
  | "frequent_canceller"
> {
  if (!score) return [];
  const out: Array<
    | "preferred"
    | "high_risk"
    | "reliable"
    | "low_quality"
    | "best_value"
    | "frequent_canceller"
  > = [];
  if (score.level === "excellent") out.push("preferred");
  if (score.level === "critical") out.push("high_risk");
  if (score.completionScore >= 90 && score.onTimeScore >= 85)
    out.push("reliable");
  if (score.completionScore < 60 || score.onTimeScore < 50)
    out.push("low_quality");
  if (score.pricingScore >= 90 && score.completionScore >= 80)
    out.push("best_value");
  if (score.breakdown.cancellationPct >= 15) out.push("frequent_canceller");
  return out;
}
