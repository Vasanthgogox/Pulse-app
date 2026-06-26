/**
 * Supplier Performance Analytics — pure compute utilities.
 * ============================================================================
 *
 * Powers `<SupplierAnalyticsTab>`. All functions are side-effect-free and
 * memoizable. Consumes trips + transactions already loaded by
 * `SupplierDetailScreen` (scoped to one supplier), so no extra fetches.
 *
 * Sections covered:
 *   • Header KPIs            — trips executed, revenue handled, margin
 *                              contribution, payable outstanding, on-time,
 *                              vehicle-quality score, cancellation %, …
 *   • Monthly trend          — payable + paid + outstanding per month
 *   • Operational metrics    — completion / on-time / cancellation /
 *                              acceptance / disputes / turnaround
 *   • Financial metrics      — payable trend, settlement-delay, advance
 *                              usage, margin contribution
 *   • Pricing stability      — supplier_rate stddev + per-km rate trend
 *   • Auto insights          — bullet messages for the InsightsPanel
 *
 * Window: last 12 months by default. Score engine + RPC layer use 6 months
 * to match `compute_supplier_reliability_score`. Keep those in lockstep
 * with the SQL definitions if anything is retuned.
 */

import type { LedgerRow } from "@/features/finance";
import type { TripRow } from "@/features/trips/services/trips.service";

import type {
  AnalyticsInsight,
  SupplierKpiHeader,
  SupplierReliabilityScore,
} from "@/features/analytics";

// ─────────────────────────────────────────────────────────────────────────────
// Constants & helpers
// ─────────────────────────────────────────────────────────────────────────────

const MS_PER_DAY = 1000 * 60 * 60 * 24;

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

function asNumber(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Sample population standard deviation — matches `stddev_pop` in PG. */
function stddevPop(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface SupplierMonthlyTrendPoint {
  monthKey: string;
  label: string;
  payable: number;
  paid: number;
  outstanding: number;
  margin: number;
  trips: number;
  onTimePct: number;
  cancellationPct: number;
  avgSettlementDays: number;
}

export interface SupplierFinancialMetrics {
  revenueHandled: number;
  payable: number;
  marginContribution: number;
  marginContributionPct: number;
  paid: number;
  outstanding: number;
  advancesPaid: number;
  avgSettlementDays: number;
  contractProfitability: number;
}

export interface SupplierOperationalMetrics {
  tripsTotal: number;
  tripsCompleted: number;
  tripsCancelled: number;
  tripsInProgress: number;
  onTimePct: number;
  onTime: number;
  onTimeEligible: number;
  completionPct: number;
  cancellationPct: number;
  acceptancePct: number;
  averageTurnaroundDays: number;
  vehicleQualityScore: number;
  disputeCount: number;
}

export interface SupplierPricingStability {
  rateAvg: number;
  rateStddev: number;
  /** Coefficient of variation = stddev / avg. 0-1 — lower is more stable. */
  cv: number;
  /** 0-100 pricing-stability score: 100 when cv ≤ 0.05; 0 when cv ≥ 0.5. */
  stabilityScore: number;
  perKmAvg: number;
  perKmStddev: number;
  /** Each lane (pickup→drop) with its avg rate + stddev — useful to spot
   *  lanes where the supplier is wildly inconsistent. */
  lanes: Array<{
    id: string;
    label: string;
    trips: number;
    avgRate: number;
    stddev: number;
    cv: number;
  }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-trip payable attribution
// ─────────────────────────────────────────────────────────────────────────────

/** Map trip id → supplier payout (`amount_out`) for trips of this
 *  supplier. Outbound txns attached to a trip are treated as supplier
 *  settlement disbursements. */
function buildPayableByTripMap(
  trips: readonly TripRow[],
  txns: readonly LedgerRow[],
): Map<string, { paid: number; lastTxDate: Date | null }> {
  const map = new Map<string, { paid: number; lastTxDate: Date | null }>();
  const tripIds = new Set(trips.map((t) => t.id));
  for (const tx of txns) {
    if (!tx.trip_id || !tripIds.has(tx.trip_id)) continue;
    const amt = asNumber(tx.amount_out);
    if (amt <= 0) continue;
    const txd = txnDate(tx);
    const entry = map.get(tx.trip_id) ?? { paid: 0, lastTxDate: null };
    entry.paid += amt;
    if (txd && (!entry.lastTxDate || txd > entry.lastTxDate)) {
      entry.lastTxDate = txd;
    }
    map.set(tx.trip_id, entry);
  }
  return map;
}

/** Sum of `amount_out` txns whose description mentions "ADVANCE". */
function sumAdvanceTxns(
  trips: readonly TripRow[],
  txns: readonly LedgerRow[],
): number {
  const tripIds = new Set(trips.map((t) => t.id));
  let total = 0;
  for (const tx of txns) {
    if (!tx.trip_id || !tripIds.has(tx.trip_id)) continue;
    if (asNumber(tx.amount_out) <= 0) continue;
    if ((tx.description ?? "").toUpperCase().includes("ADVANCE")) {
      total += asNumber(tx.amount_out);
    }
  }
  return total;
}

// ─────────────────────────────────────────────────────────────────────────────
// KPI Header
// ─────────────────────────────────────────────────────────────────────────────

/** Build the per-supplier KPI header. Pass a precomputed reliability
 *  `score` if available so we can surface the composite score and a
 *  vehicle-quality / on-time signal in one place. */
export function computeSupplierKpiHeader(
  trips: readonly TripRow[],
  txns: readonly LedgerRow[],
  options: {
    now?: Date;
    windowMonths?: number;
    score?: SupplierReliabilityScore | null;
  } = {},
): SupplierKpiHeader {
  const now = options.now ?? new Date();
  const windowMonths = options.windowMonths ?? 12;
  const windowStart = new Date(now);
  windowStart.setMonth(windowStart.getMonth() - windowMonths);

  let revenue = 0;
  let payable = 0;
  let margin = 0;
  let trips_ = 0;
  let onTime = 0;
  let onTimeEligible = 0;
  let cancelled = 0;

  for (const t of trips) {
    const d = tripDate(t);
    if (!d || d < windowStart) continue;
    revenue += asNumber(t.client_price);
    payable += asNumber(t.supplier_rate);
    margin += asNumber(t.margin);
    trips_ += 1;
    if (t.status === "cancelled") cancelled += 1;
    if (t.completed_at && t.pickup_date) {
      onTimeEligible += 1;
      const completed = new Date(t.completed_at);
      const pickup = new Date(t.pickup_date);
      if (
        Number.isFinite(completed.getTime()) &&
        Number.isFinite(pickup.getTime())
      ) {
        if (completed <= new Date(pickup.getTime() + MS_PER_DAY)) onTime += 1;
      }
    }
  }

  // Outstanding payable = total payable − amount_out attributed to trips
  const payableByTrip = buildPayableByTripMap(trips, txns);
  let paid = 0;
  for (const t of trips) {
    const d = tripDate(t);
    if (!d || d < windowStart) continue;
    paid += payableByTrip.get(t.id)?.paid ?? 0;
  }

  const marginPct = revenue > 0 ? (margin / revenue) * 100 : 0;

  return {
    tripsExecuted: trips_,
    revenueHandled: revenue,
    marginContribution: margin,
    marginContributionPct: Math.round(marginPct * 100) / 100,
    outstanding: Math.max(payable - paid, 0),
    onTimePct:
      onTimeEligible > 0 ? Math.round((onTime / onTimeEligible) * 100) : 0,
    vehicleQualityScore: options.score
      ? Math.round((options.score.onTimeScore + options.score.completionScore) / 2)
      : onTimeEligible > 0
        ? Math.round((onTime / onTimeEligible) * 100)
        : 0,
    cancellationRatePct:
      trips_ > 0 ? Math.round((cancelled / trips_) * 1000) / 10 : 0,
    reliabilityScore: options.score
      ? Math.round(options.score.score)
      : 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Monthly trend
// ─────────────────────────────────────────────────────────────────────────────

export function computeSupplierMonthlyTrend(
  trips: readonly TripRow[],
  txns: readonly LedgerRow[],
  options: { now?: Date; monthsBack?: number } = {},
): SupplierMonthlyTrendPoint[] {
  const now = options.now ?? new Date();
  const monthsBack = options.monthsBack ?? 12;

  const keys: string[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(monthKey(d));
  }

  const payableByTrip = buildPayableByTripMap(trips, txns);

  return keys.map((key) => {
    let payable = 0;
    let paid = 0;
    let outstanding = 0;
    let margin = 0;
    let monthTrips = 0;
    let onTime = 0;
    let onTimeEligible = 0;
    let cancelled = 0;
    const settlementDays: number[] = [];

    for (const t of trips) {
      const d = tripDate(t);
      if (!d || monthKey(d) !== key) continue;
      const rate = asNumber(t.supplier_rate);
      const pay = payableByTrip.get(t.id);
      const paidForTrip = pay?.paid ?? 0;
      payable += rate;
      paid += Math.min(paidForTrip, rate);
      outstanding += Math.max(rate - paidForTrip, 0);
      margin += asNumber(t.margin);
      monthTrips += 1;
      if (t.status === "cancelled") cancelled += 1;
      if (pay?.lastTxDate && t.pickup_date) {
        const pickup = new Date(t.pickup_date);
        if (Number.isFinite(pickup.getTime())) {
          const days = Math.round(
            (pay.lastTxDate.getTime() - pickup.getTime()) / MS_PER_DAY,
          );
          if (days > 0) settlementDays.push(days);
        }
      }
      if (t.completed_at && t.pickup_date) {
        onTimeEligible += 1;
        const completed = new Date(t.completed_at);
        const pickup = new Date(t.pickup_date);
        if (
          Number.isFinite(completed.getTime()) &&
          Number.isFinite(pickup.getTime())
        ) {
          if (completed <= new Date(pickup.getTime() + MS_PER_DAY)) onTime += 1;
        }
      }
    }

    return {
      monthKey: key,
      label: monthLabelShort(key),
      payable,
      paid,
      outstanding,
      margin,
      trips: monthTrips,
      onTimePct:
        onTimeEligible > 0 ? Math.round((onTime / onTimeEligible) * 100) : 0,
      cancellationPct:
        monthTrips > 0 ? Math.round((cancelled / monthTrips) * 100) : 0,
      avgSettlementDays:
        settlementDays.length > 0
          ? Math.round(
              (settlementDays.reduce((a, b) => a + b, 0) /
                settlementDays.length) *
                10,
            ) / 10
          : 0,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Financial Intelligence
// ─────────────────────────────────────────────────────────────────────────────

export function computeSupplierFinancialMetrics(
  trips: readonly TripRow[],
  txns: readonly LedgerRow[],
  options: { now?: Date; windowMonths?: number } = {},
): SupplierFinancialMetrics {
  const now = options.now ?? new Date();
  const windowMonths = options.windowMonths ?? 12;
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - windowMonths);

  let revenue = 0;
  let payable = 0;
  let margin = 0;
  const payableByTrip = buildPayableByTripMap(trips, txns);
  let paid = 0;
  const settlementDays: number[] = [];

  for (const t of trips) {
    const d = tripDate(t);
    if (!d || d < cutoff) continue;
    revenue += asNumber(t.client_price);
    payable += asNumber(t.supplier_rate);
    margin += asNumber(t.margin);
    const pay = payableByTrip.get(t.id);
    paid += pay?.paid ?? 0;
    if (pay?.lastTxDate && t.pickup_date) {
      const pickup = new Date(t.pickup_date);
      if (Number.isFinite(pickup.getTime())) {
        const days = Math.round(
          (pay.lastTxDate.getTime() - pickup.getTime()) / MS_PER_DAY,
        );
        if (days > 0) settlementDays.push(days);
      }
    }
  }

  const advancesPaid = sumAdvanceTxns(trips, txns);
  const outstanding = Math.max(payable - paid, 0);

  return {
    revenueHandled: revenue,
    payable,
    marginContribution: margin,
    marginContributionPct:
      revenue > 0 ? Math.round((margin / revenue) * 1000) / 10 : 0,
    paid,
    outstanding,
    advancesPaid,
    avgSettlementDays:
      settlementDays.length > 0
        ? Math.round(
            (settlementDays.reduce((a, b) => a + b, 0) /
              settlementDays.length) *
              10,
          ) / 10
        : 0,
    contractProfitability: revenue - payable,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Operational Intelligence
// ─────────────────────────────────────────────────────────────────────────────

export function computeSupplierOperationalMetrics(
  trips: readonly TripRow[],
  txns: readonly LedgerRow[],
  options: { now?: Date; windowMonths?: number } = {},
): SupplierOperationalMetrics {
  const now = options.now ?? new Date();
  const windowMonths = options.windowMonths ?? 12;
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - windowMonths);

  let tripsTotal = 0;
  let tripsCompleted = 0;
  let tripsCancelled = 0;
  let tripsInProgress = 0;
  let tripsAccepted = 0;
  let onTime = 0;
  let onTimeEligible = 0;
  const turnaround: number[] = [];

  for (const t of trips) {
    const d = tripDate(t);
    if (!d || d < cutoff) continue;
    tripsTotal += 1;
    if (t.status === "completed") tripsCompleted += 1;
    if (t.status === "cancelled") tripsCancelled += 1;
    if (
      t.status === "assigned" ||
      t.status === "in_progress" ||
      t.status === "started"
    ) {
      tripsInProgress += 1;
    }
    // Acceptance ≈ everything that isn't `pending` / `declined` / `rejected`
    if (
      t.status !== "pending" &&
      t.status !== "declined" &&
      t.status !== "rejected" &&
      t.status !== "cancelled"
    ) {
      tripsAccepted += 1;
    }
    if (t.completed_at && t.pickup_date) {
      onTimeEligible += 1;
      const completed = new Date(t.completed_at);
      const pickup = new Date(t.pickup_date);
      if (
        Number.isFinite(completed.getTime()) &&
        Number.isFinite(pickup.getTime())
      ) {
        if (completed <= new Date(pickup.getTime() + MS_PER_DAY)) onTime += 1;
        const days =
          (completed.getTime() - pickup.getTime()) / MS_PER_DAY;
        if (days > 0) turnaround.push(days);
      }
    }
  }

  // Disputes — trips referenced by a "DISPUTE" / "DEDUCTION" txn.
  const tripIds = new Set(trips.map((t) => t.id));
  const disputed = new Set<string>();
  for (const tx of txns) {
    if (!tx.trip_id || !tripIds.has(tx.trip_id)) continue;
    const desc = (tx.description ?? "").toUpperCase();
    if (desc.includes("DISPUTE") || desc.includes("DEDUCTION")) {
      disputed.add(tx.trip_id);
    }
  }

  const completionPct =
    tripsTotal > 0 ? Math.round((tripsCompleted / tripsTotal) * 1000) / 10 : 0;
  const cancellationPct =
    tripsTotal > 0 ? Math.round((tripsCancelled / tripsTotal) * 1000) / 10 : 0;
  const acceptancePct =
    tripsTotal > 0 ? Math.round((tripsAccepted / tripsTotal) * 1000) / 10 : 0;
  const onTimePct =
    onTimeEligible > 0 ? Math.round((onTime / onTimeEligible) * 100) : 0;

  // Vehicle quality ≈ blended completion + on-time (proxy until we have
  // an explicit driver-rating / vehicle-condition signal stored per trip).
  const vehicleQualityScore = Math.round(
    completionPct * 0.6 + onTimePct * 0.4,
  );

  return {
    tripsTotal,
    tripsCompleted,
    tripsCancelled,
    tripsInProgress,
    onTime,
    onTimeEligible,
    onTimePct,
    completionPct,
    cancellationPct,
    acceptancePct,
    averageTurnaroundDays:
      turnaround.length > 0
        ? Math.round(
            (turnaround.reduce((a, b) => a + b, 0) / turnaround.length) * 10,
          ) / 10
        : 0,
    vehicleQualityScore,
    disputeCount: disputed.size,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Pricing Stability
// ─────────────────────────────────────────────────────────────────────────────

export function computeSupplierPricingStability(
  trips: readonly TripRow[],
  options: { now?: Date; windowMonths?: number; topLanes?: number } = {},
): SupplierPricingStability {
  const now = options.now ?? new Date();
  const windowMonths = options.windowMonths ?? 12;
  const topLanes = options.topLanes ?? 5;
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - windowMonths);

  const rates: number[] = [];
  const perKm: number[] = [];
  const byLane = new Map<string, number[]>();

  for (const t of trips) {
    const d = tripDate(t);
    if (!d || d < cutoff) continue;
    const rate = asNumber(t.supplier_rate);
    if (rate <= 0) continue;
    rates.push(rate);
    const dist = asNumber(t.distance);
    if (dist > 0) perKm.push(rate / dist);
    const pickup = (t.pickup_area ?? "").trim();
    const drop = (t.drop_location ?? "").trim();
    const laneId = pickup && drop ? `${pickup} → ${drop}` : pickup || drop;
    if (!laneId) continue;
    const arr = byLane.get(laneId) ?? [];
    arr.push(rate);
    byLane.set(laneId, arr);
  }

  const rateAvg = rates.length > 0
    ? rates.reduce((a, b) => a + b, 0) / rates.length
    : 0;
  const rateStddev = stddevPop(rates);
  const cv = rateAvg > 0 ? rateStddev / rateAvg : 0;

  // Stability score: 100 at cv≤0.05, 0 at cv≥0.5, linear in between.
  const stabilityScore = Math.max(
    0,
    Math.min(100, Math.round(((0.5 - cv) / (0.5 - 0.05)) * 100)),
  );

  const perKmAvg = perKm.length > 0
    ? perKm.reduce((a, b) => a + b, 0) / perKm.length
    : 0;
  const perKmStddev = stddevPop(perKm);

  const lanes = Array.from(byLane.entries())
    .filter(([, arr]) => arr.length >= 2)
    .map(([label, arr]) => {
      const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
      const sd = stddevPop(arr);
      return {
        id: label,
        label,
        trips: arr.length,
        avgRate: Math.round(avg),
        stddev: Math.round(sd),
        cv: avg > 0 ? Math.round((sd / avg) * 1000) / 1000 : 0,
      };
    })
    .sort((a, b) => b.trips - a.trips)
    .slice(0, topLanes);

  return {
    rateAvg: Math.round(rateAvg),
    rateStddev: Math.round(rateStddev),
    cv: Math.round(cv * 1000) / 1000,
    stabilityScore,
    perKmAvg: Math.round(perKmAvg * 100) / 100,
    perKmStddev: Math.round(perKmStddev * 100) / 100,
    lanes,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Lane / load / payable aging (Metronic BI dashboard)
// ─────────────────────────────────────────────────────────────────────────────

function laneLabel(t: TripRow): string {
  const pickup = (t.pickup_area ?? "").trim();
  const drop = (t.drop_location ?? "").trim();
  return pickup && drop
    ? `${pickup} → ${drop}`
    : pickup || drop || "Unspecified lane";
}

export interface SupplierLaneBreakdown {
  id: string;
  label: string;
  payable: number;
  trips: number;
}

export function computeSupplierLaneBreakdown(
  trips: readonly TripRow[],
  options: { topN?: number } = {},
): SupplierLaneBreakdown[] {
  const map = new Map<string, { payable: number; trips: number }>();
  for (const t of trips) {
    const lane = laneLabel(t);
    const entry = map.get(lane) ?? { payable: 0, trips: 0 };
    entry.payable += asNumber(t.supplier_rate);
    entry.trips += 1;
    map.set(lane, entry);
  }
  const rows: SupplierLaneBreakdown[] = Array.from(map.entries()).map(
    ([label, agg]) => ({
      id: label,
      label,
      payable: agg.payable,
      trips: agg.trips,
    }),
  );
  rows.sort((a, b) => b.payable - a.payable);
  return rows.slice(0, options.topN ?? 6);
}

export interface SupplierLoadTypeBreakdown {
  id: string;
  label: string;
  payable: number;
  trips: number;
}

export function computeSupplierLoadTypeBreakdown(
  trips: readonly TripRow[],
  options: { topN?: number } = {},
): SupplierLoadTypeBreakdown[] {
  const map = new Map<string, { payable: number; trips: number }>();
  for (const t of trips) {
    const loadType = (t.load_type ?? "").trim() || "Unspecified";
    const entry = map.get(loadType) ?? { payable: 0, trips: 0 };
    entry.payable += asNumber(t.supplier_rate);
    entry.trips += 1;
    map.set(loadType, entry);
  }
  const rows = Array.from(map.entries()).map(([label, agg]) => ({
    id: label,
    label,
    payable: agg.payable,
    trips: agg.trips,
  }));
  rows.sort((a, b) => b.payable - a.payable);
  return rows.slice(0, options.topN ?? 5);
}

export interface SupplierPayableAging {
  outstanding: number;
  bucket0_30: number;
  bucket31_60: number;
  bucket61_90: number;
  bucket90Plus: number;
  totalOverdueTrips: number;
}

export function computeSupplierPayableAging(
  trips: readonly TripRow[],
  txns: readonly LedgerRow[],
  options: { now?: Date } = {},
): SupplierPayableAging {
  const now = options.now ?? new Date();
  const payableByTrip = buildPayableByTripMap(trips, txns);

  let bucket0_30 = 0;
  let bucket31_60 = 0;
  let bucket61_90 = 0;
  let bucket90Plus = 0;
  let overdueTrips = 0;

  for (const t of trips) {
    const rate = asNumber(t.supplier_rate);
    if (rate <= 0) continue;
    const paid = payableByTrip.get(t.id)?.paid ?? 0;
    const outstanding = rate - paid;
    if (outstanding <= 0) continue;
    const dateAnchor = t.pickup_date ? new Date(t.pickup_date) : tripDate(t);
    if (!dateAnchor || !Number.isFinite(dateAnchor.getTime())) continue;
    const daysOld = Math.max(
      0,
      Math.round((now.getTime() - dateAnchor.getTime()) / MS_PER_DAY),
    );
    overdueTrips += 1;
    if (daysOld <= 30) bucket0_30 += outstanding;
    else if (daysOld <= 60) bucket31_60 += outstanding;
    else if (daysOld <= 90) bucket61_90 += outstanding;
    else bucket90Plus += outstanding;
  }

  return {
    outstanding: bucket0_30 + bucket31_60 + bucket61_90 + bucket90Plus,
    bucket0_30,
    bucket31_60,
    bucket61_90,
    bucket90Plus,
    totalOverdueTrips: overdueTrips,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Auto Insights
// ─────────────────────────────────────────────────────────────────────────────

export function deriveSupplierInsights(
  monthly: readonly SupplierMonthlyTrendPoint[],
  kpis: SupplierKpiHeader,
  ops: SupplierOperationalMetrics,
  pricing: SupplierPricingStability,
  financial: SupplierFinancialMetrics,
): AnalyticsInsight[] {
  const out: AnalyticsInsight[] = [];
  if (monthly.length === 0) return out;

  const last = monthly[monthly.length - 1];
  const prev = monthly[monthly.length - 2];

  // Volume trend
  if (last && prev && prev.trips > 0) {
    const pct = ((last.trips - prev.trips) / prev.trips) * 100;
    if (pct >= 25) {
      out.push({
        id: "vol-up",
        tone: "positive",
        message: `Trip volume up ${Math.round(pct)}% vs last month — strong availability signal`,
      });
    } else if (pct <= -30) {
      out.push({
        id: "vol-down",
        tone: "warning",
        message: `Trip volume down ${Math.round(Math.abs(pct))}% vs last month — check availability`,
      });
    }
  }

  // Outstanding payable
  if (financial.outstanding > 0 && financial.payable > 0) {
    const pct = (financial.outstanding / financial.payable) * 100;
    if (pct >= 25) {
      out.push({
        id: "payable-high",
        tone: "warning",
        message: `${pct.toFixed(0)}% of payable is outstanding — settlement bottleneck`,
      });
    }
  }

  // Settlement delay
  if (financial.avgSettlementDays >= 30) {
    out.push({
      id: "settle-slow",
      tone: "warning",
      message: `Average settlement is ${financial.avgSettlementDays} days — supplier may push back on availability`,
    });
  } else if (financial.avgSettlementDays > 0 && financial.avgSettlementDays <= 7) {
    out.push({
      id: "settle-fast",
      tone: "positive",
      message: `Fast settlement (${financial.avgSettlementDays}d avg) — supports preferred-vendor status`,
    });
  }

  // Margin contribution
  if (
    kpis.marginContributionPct >= 15 &&
    financial.revenueHandled > 0
  ) {
    out.push({
      id: "margin-strong",
      tone: "positive",
      message: `${kpis.marginContributionPct.toFixed(1)}% margin contribution — financially attractive`,
    });
  } else if (
    kpis.marginContributionPct < 5 &&
    financial.revenueHandled > 0
  ) {
    out.push({
      id: "margin-thin",
      tone: "warning",
      message: `Margin contribution only ${kpis.marginContributionPct.toFixed(1)}% — renegotiate pricing`,
    });
  }

  // On-time
  if (ops.onTimeEligible >= 5 && ops.onTimePct < 60) {
    out.push({
      id: "ontime-low",
      tone: "warning",
      message: `On-time delivery ${ops.onTimePct}% — chronic delay signal`,
    });
  } else if (ops.onTimeEligible >= 5 && ops.onTimePct >= 90) {
    out.push({
      id: "ontime-high",
      tone: "positive",
      message: `${ops.onTimePct}% on-time — operational excellence`,
    });
  }

  // Cancellations
  if (ops.cancellationPct >= 15) {
    out.push({
      id: "cancel-high",
      tone: "negative",
      message: `Cancellation rate ${ops.cancellationPct}% — last-minute pull-out risk`,
    });
  }

  // Pricing stability
  if (pricing.stabilityScore >= 90 && pricing.rateAvg > 0) {
    out.push({
      id: "pricing-stable",
      tone: "positive",
      message: `Pricing is highly stable (CV ${pricing.cv}) — easy to forecast cost`,
    });
  } else if (pricing.stabilityScore < 50 && pricing.rateAvg > 0) {
    out.push({
      id: "pricing-volatile",
      tone: "warning",
      message: `Pricing volatility (CV ${pricing.cv}) — request stable rate cards`,
    });
  }

  // Disputes
  if (ops.disputeCount > 0) {
    out.push({
      id: "disputes",
      tone: "warning",
      message: `${ops.disputeCount} trip${ops.disputeCount === 1 ? "" : "s"} flagged with disputes / deductions`,
    });
  }

  return out;
}
