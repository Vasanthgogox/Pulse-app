/**
 * Vehicle Intelligence — KPI header + auto-derived insights.
 * ============================================================================
 *
 * Sits alongside the existing `analyticsUtils.ts`. This module focuses on
 * the new Phase-5 Intelligence overlay (composite score + insights bullets);
 * it intentionally *consumes* the already-computed `MissionRow[]` so we
 * don't recompute trip/expense joins twice.
 *
 * Exports:
 *   • `computeVehicleKpiHeader(missionRows, vehicleTrips, score, windowMonths)`
 *   • `deriveVehicleInsights(score, kpis, monthly)`
 */

import type { TripRow } from "@/features/trips/services/trips.service";
import type {
  AnalyticsInsight,
  VehicleKpiHeader,
  VehiclePerformanceScore,
} from "@/features/analytics";

import type { MissionRow } from "./analyticsUtils";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const MS_PER_DAY = 1000 * 60 * 60 * 24;

function asNumber(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function tripDate(t: TripRow): Date | null {
  const raw = t.pickup_date ?? t.created_at;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isFinite(d.getTime()) ? d : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// KPI header
// ─────────────────────────────────────────────────────────────────────────────

/** Build the Vehicle Intelligence KPI header from already-loaded mission
 *  rows. `vehicleTrips` is used for active-day calculation (we use trip
 *  dates as the proxy for "vehicle had activity"). */
export function computeVehicleKpiHeader(
  missionRows: readonly MissionRow[],
  vehicleTrips: readonly TripRow[],
  options: {
    score?: VehiclePerformanceScore | null;
    windowMonths?: number;
    now?: Date;
  } = {},
): VehicleKpiHeader {
  const windowMonths = options.windowMonths ?? 6;
  const now = options.now ?? new Date();
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - windowMonths);

  let revenue = 0;
  let expense = 0;
  let kmDriven = 0;
  let tripsCompleted = 0;
  for (const row of missionRows) {
    revenue += row.sales;
    expense += row.expense;
    kmDriven += asNumber(row.trip.distance);
    if (
      row.trip.status === "completed" ||
      row.trip.status === "started"
    ) {
      tripsCompleted += 1;
    }
  }
  const profit = revenue - expense;
  const marginPct = revenue > 0 ? (profit / revenue) * 100 : 0;

  // Active days = distinct days within the window the vehicle had a trip.
  const activeDaySet = new Set<string>();
  for (const t of vehicleTrips) {
    const d = tripDate(t);
    if (!d || d < cutoff) continue;
    activeDaySet.add(d.toISOString().slice(0, 10));
  }
  const activeDays = activeDaySet.size;

  // Utilization % = active days / total days in window. Capped 0..100.
  const totalDays = Math.max(
    1,
    Math.round((now.getTime() - cutoff.getTime()) / MS_PER_DAY),
  );
  const utilizationPct = Math.min(100, Math.round((activeDays / totalDays) * 100));

  return {
    tripsTotal: missionRows.length,
    tripsCompleted,
    revenue: Math.round(revenue),
    expense: Math.round(expense),
    profit: Math.round(profit),
    marginPct: Math.round(marginPct * 10) / 10,
    kmDriven: Math.round(kmDriven),
    activeDays,
    utilizationPct,
    performanceScore: options.score ? Math.round(options.score.score) : 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Auto Insights
// ─────────────────────────────────────────────────────────────────────────────

export interface VehicleMonthlyBuckets {
  /** Month label like "Aug". */
  label: string;
  revenue: number;
  expense: number;
  profit: number;
  tripCount: number;
}

/** Derive 0..N actionable insight bullets. Pure / memoizable. */
export function deriveVehicleInsights(
  score: VehiclePerformanceScore | null,
  kpis: VehicleKpiHeader,
  monthly: readonly VehicleMonthlyBuckets[] = [],
): AnalyticsInsight[] {
  const out: AnalyticsInsight[] = [];

  // Volume trend
  if (monthly.length >= 2) {
    const last = monthly[monthly.length - 1];
    const prev = monthly[monthly.length - 2];
    if (last && prev && prev.tripCount > 0) {
      const pct = ((last.tripCount - prev.tripCount) / prev.tripCount) * 100;
      if (pct >= 30) {
        out.push({
          id: "vol-up",
          tone: "positive",
          message: `Trip volume up ${Math.round(pct)}% vs last month — strong demand`,
        });
      } else if (pct <= -30) {
        out.push({
          id: "vol-down",
          tone: "warning",
          message: `Trip volume down ${Math.round(Math.abs(pct))}% vs last month — check availability or maintenance`,
        });
      }
    }
  }

  // Utilization
  if (kpis.utilizationPct >= 80) {
    out.push({
      id: "util-high",
      tone: "positive",
      message: `Vehicle is active ${kpis.utilizationPct}% of days — top utilization`,
    });
  } else if (kpis.utilizationPct > 0 && kpis.utilizationPct < 30) {
    out.push({
      id: "util-low",
      tone: "warning",
      message: `Vehicle active only ${kpis.utilizationPct}% of days — underutilized asset`,
    });
  }

  // Margin
  if (kpis.marginPct >= 20) {
    out.push({
      id: "margin-strong",
      tone: "positive",
      message: `${kpis.marginPct.toFixed(1)}% margin — high-yield vehicle`,
    });
  } else if (kpis.marginPct < 0 && kpis.revenue > 0) {
    out.push({
      id: "margin-loss",
      tone: "negative",
      message: `Operating at a loss (margin ${kpis.marginPct.toFixed(1)}%) — review costs`,
    });
  } else if (kpis.marginPct < 5 && kpis.revenue > 0) {
    out.push({
      id: "margin-thin",
      tone: "warning",
      message: `Margin only ${kpis.marginPct.toFixed(1)}% — thin profitability`,
    });
  }

  // Cost efficiency
  if (score) {
    if (score.breakdown.expenseRatio >= 80) {
      out.push({
        id: "expense-high",
        tone: "warning",
        message: `Expenses are ${score.breakdown.expenseRatio.toFixed(0)}% of revenue — investigate maintenance / fuel`,
      });
    } else if (
      score.costEfficiencyScore >= 85 &&
      score.breakdown.tripsTotal >= 5
    ) {
      out.push({
        id: "expense-low",
        tone: "positive",
        message: `Cost efficiency ${score.costEfficiencyScore}/100 — lean operating profile`,
      });
    }

    // Completion / cancellation signal
    if (score.breakdown.tripsTotal >= 5 && score.completionScore < 60) {
      out.push({
        id: "completion-low",
        tone: "warning",
        message: `Only ${score.completionScore}% completion — many trips not closing out`,
      });
    }

    // Consistency
    if (
      score.consistencyScore < 40 &&
      score.breakdown.distinctMonths >= 2
    ) {
      out.push({
        id: "consistency-low",
        tone: "warning",
        message: `Inconsistent monthly cadence (CV ${score.breakdown.tripsPerMonthCv}) — uneven booking flow`,
      });
    }

    // Composite headline
    if (score.level === "excellent") {
      out.push({
        id: "score-top",
        tone: "positive",
        message: `Score ${score.score}/100 — among the top performers in your fleet`,
      });
    } else if (score.level === "critical") {
      out.push({
        id: "score-critical",
        tone: "negative",
        message: `Score ${score.score}/100 — this asset is flagged as high-risk`,
      });
    }
  }

  return out;
}
