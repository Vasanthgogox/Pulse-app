/**
 * Customer Health Score — pure TypeScript engine.
 * ============================================================================
 *
 * Mirrors `public.compute_client_health_score(uuid, uuid)` in
 * `supabase/migrations/20260828020000_analytics_rpcs.sql`. Use this in the
 * UI when the parent screen has already loaded trips + transactions for a
 * single client (e.g. `ClientDetailScreen`), avoiding an extra
 * server roundtrip. For leaderboards over many clients, prefer the server
 * RPC via `useCustomerHealthScoresQuery` to keep the calc consistent.
 *
 * Composite:
 *   profitability    30%
 *   payment-discipline 30%
 *   operations       20%
 *   consistency      10%
 *   growth           10%
 *
 * Window: last 6 months from `now`. Keep weights / window in lock-step with
 * the SQL function — if you tune one, tune the other.
 */

import type { CustomerHealthScore } from "../types/analytics.types";
import { scoreLevelFromValue } from "../types/analytics.types";

// ─────────────────────────────────────────────────────────────────────────────
// Input shapes — minimal projections so this util doesn't pull in the
// full `TripRow` / `LedgerRow` types from the trips / finance modules.
// ─────────────────────────────────────────────────────────────────────────────

export interface ClientScoreTripInput {
  id: string;
  client_id: string | null;
  client_price: number | null;
  margin: number | null;
  status: string | null;
  pickup_date: string | null;
  created_at: string | null;
}

export interface ClientScoreTxnInput {
  trip_id: string | null;
  amount_in: number | null;
  transaction_date: string | null;
  created_at: string | null;
}

export interface ClientHealthScoreOptions {
  /** Reference timestamp — defaults to `Date.now()`. Override for tests
   *  or for "what-if" historical scoring. */
  now?: Date;
  /** Look-back window in months. Defaults to 6 — matches the SQL RPC. */
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

function pickupDateOf(t: ClientScoreTripInput): Date | null {
  const raw = t.pickup_date ?? t.created_at;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isFinite(d.getTime()) ? d : null;
}

function txnDateOf(t: ClientScoreTxnInput): Date | null {
  const raw = t.transaction_date ?? t.created_at;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isFinite(d.getTime()) ? d : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Engine
// ─────────────────────────────────────────────────────────────────────────────

/** Compute the Customer Health Score for one client. Returns null if the
 *  client has no trips in the window AND no transactions — the dashboard
 *  uses this to show an "Insufficient data" badge instead of a fake 0. */
export function computeCustomerHealthScore(
  clientId: string,
  trips: readonly ClientScoreTripInput[],
  transactions: readonly ClientScoreTxnInput[],
  options: ClientHealthScoreOptions = {},
): CustomerHealthScore | null {
  const now = options.now ?? new Date();
  const windowMonths = options.windowMonths ?? 6;
  const windowStart = new Date(now);
  windowStart.setMonth(windowStart.getMonth() - windowMonths);
  const recentStart = new Date(now);
  recentStart.setMonth(recentStart.getMonth() - 3);

  // 1. Restrict trips to this client + window.
  const clientTrips = trips.filter((t) => t.client_id === clientId);
  const tripsInWindow = clientTrips
    .map((t) => ({ trip: t, date: pickupDateOf(t) }))
    .filter(
      (entry): entry is { trip: ClientScoreTripInput; date: Date } =>
        entry.date !== null && entry.date >= windowStart,
    );

  if (tripsInWindow.length === 0 && transactions.length === 0) return null;

  // 2. Aggregate trip metrics.
  let revenue = 0;
  let margin = 0;
  let tripsTotal = 0;
  let tripsCompleted = 0;
  let recentRevenue = 0;
  let priorRevenue = 0;
  const distinctMonthsSet = new Set<string>();
  const tripIdsInWindow = new Set<string>();
  const tripPickupById = new Map<string, Date>();

  for (const { trip, date } of tripsInWindow) {
    revenue += trip.client_price ?? 0;
    margin += trip.margin ?? 0;
    tripsTotal += 1;
    if (trip.status === "completed") tripsCompleted += 1;
    distinctMonthsSet.add(`${date.getFullYear()}-${date.getMonth()}`);
    tripIdsInWindow.add(trip.id);
    tripPickupById.set(trip.id, date);
    if (date >= recentStart) recentRevenue += trip.client_price ?? 0;
    else priorRevenue += trip.client_price ?? 0;
  }

  // 3. Aggregate payment metrics. We need delay days from trip pickup_date.
  let collected = 0;
  const delays: number[] = [];
  for (const tx of transactions) {
    if (!tx.trip_id || !tripIdsInWindow.has(tx.trip_id)) continue;
    if ((tx.amount_in ?? 0) <= 0) continue;
    collected += tx.amount_in ?? 0;
    const pickup = tripPickupById.get(tx.trip_id);
    const txDate = txnDateOf(tx);
    if (pickup && txDate) {
      const days = Math.round((txDate.getTime() - pickup.getTime()) / MS_PER_DAY);
      if (days > 0) delays.push(days);
    }
  }
  const avgPaymentDelay =
    delays.length > 0
      ? delays.reduce((a, b) => a + b, 0) / delays.length
      : 0;
  const outstanding = Math.max(revenue - collected, 0);
  const marginPct = revenue > 0 ? (margin / revenue) * 100 : 0;

  // 4. Sub-scores (each 0..100).
  const profitabilityScore = clamp(marginPct * 4, 0, 100);

  const paymentScore = (() => {
    if (revenue === 0) return 100;
    if (delays.length === 0) return 80;
    if (avgPaymentDelay <= 7) return 100;
    if (avgPaymentDelay <= 15) return 85;
    if (avgPaymentDelay <= 30) return 70;
    if (avgPaymentDelay <= 45) return 55;
    if (avgPaymentDelay <= 60) return 40;
    return 25;
  })();

  const operationsScore =
    tripsTotal === 0 ? 100 : (tripsCompleted / tripsTotal) * 100;

  const consistencyScore = clamp(
    (distinctMonthsSet.size / windowMonths) * 100,
    0,
    100,
  );

  const growthScore = (() => {
    if (priorRevenue === 0 && recentRevenue > 0) return 100;
    if (priorRevenue === 0) return 50;
    return clamp(
      ((recentRevenue - priorRevenue) / priorRevenue) * 100 + 50,
      0,
      100,
    );
  })();

  const score = Math.round(
    profitabilityScore * 0.3 +
      paymentScore * 0.3 +
      operationsScore * 0.2 +
      consistencyScore * 0.1 +
      growthScore * 0.1,
  );

  return {
    score,
    level: scoreLevelFromValue(score),
    profitabilityScore: Math.round(profitabilityScore),
    paymentScore: Math.round(paymentScore),
    operationsScore: Math.round(operationsScore),
    consistencyScore: Math.round(consistencyScore),
    growthScore: Math.round(growthScore),
    breakdown: {
      revenue6m: revenue,
      margin6m: margin,
      marginPct: Math.round(marginPct * 100) / 100,
      collected6m: collected,
      outstanding6m: outstanding,
      avgPaymentDelay: Math.round(avgPaymentDelay * 10) / 10,
      tripsTotal,
      tripsCompleted,
      distinctMonths: distinctMonthsSet.size,
      recentRevenue,
      priorRevenue,
    },
  };
}

/** Derive `ClientBadge`s from a computed score + a recent-revenue
 *  signal. Pure and side-effect-free — safe to call inside `useMemo`. */
export function deriveCustomerBadges(
  score: CustomerHealthScore | null,
): ReadonlyArray<
  "premium" | "high_risk" | "fast_paying" | "high_margin" | "strategic" | "growing" | "declining"
> {
  if (!score) return [];
  const out: Array<
    "premium" | "high_risk" | "fast_paying" | "high_margin" | "strategic" | "growing" | "declining"
  > = [];
  if (score.level === "excellent") out.push("premium");
  if (score.level === "critical") out.push("high_risk");
  if (score.paymentScore >= 90 && score.breakdown.avgPaymentDelay <= 7)
    out.push("fast_paying");
  if (score.breakdown.marginPct >= 20) out.push("high_margin");
  if (score.score >= 75 && score.breakdown.revenue6m >= 500000)
    out.push("strategic");
  if (
    score.breakdown.priorRevenue > 0 &&
    score.breakdown.recentRevenue >= score.breakdown.priorRevenue * 1.2
  )
    out.push("growing");
  if (
    score.breakdown.priorRevenue > 0 &&
    score.breakdown.recentRevenue <= score.breakdown.priorRevenue * 0.7
  )
    out.push("declining");
  return out;
}
