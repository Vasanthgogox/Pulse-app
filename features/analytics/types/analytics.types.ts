/**
 * Analytics — shared types
 * ============================================================================
 *
 * Single source of truth for analytics models used by:
 *   • Driver Intelligence Hub (`features/drivers/components/analytics/`)
 *   • Client Performance Analytics (`features/clients/components/analytics/`)
 *   • Supplier Reliability Analytics (`features/suppliers/components/analytics/`)
 *
 * Mirror of the SQL row shapes returned by:
 *   • `get_client_monthly_analytics`
 *   • `get_supplier_monthly_analytics`
 *   • `get_driver_monthly_analytics`
 *   • `compute_client_health_score`
 *   • `compute_supplier_reliability_score`
 *   • `compute_driver_performance_score`
 *
 * (See `supabase/migrations/20260828020000_analytics_rpcs.sql`.)
 *
 * Conventions
 * -----------
 * • Score level union is shared with `compliance.types` so a single
 *   `<ScoreCard>` component can render both. Keep `excellent / good /
 *   warning / critical` in lock-step with `complianceScore.util.ts`.
 * • All monetary fields are `numeric` on the server but typed as
 *   `number | null` here — Supabase returns numerics as strings in some
 *   environments; we coerce in the service layer.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Common
// ─────────────────────────────────────────────────────────────────────────────

/** Period granularity for analytics dashboards. Drives both the
 *  period-picker UI and the bucket size of trend charts.
 *
 *  `lifetime` is only meaningful for single-entity views (driver,
 *  client, supplier); fleet dashboards use one of the bucketed values. */
export type AnalyticsPeriod = "monthly" | "quarterly" | "yearly" | "lifetime";

/** 0–100 score level — shared with compliance. */
export type ScoreLevel = "excellent" | "good" | "warning" | "critical" | "unknown";

/** A single point on a trend chart. `label` is human-readable
 *  (e.g. "Aug '26"); `period` is the raw bucket key (`"2026-08"`). */
export interface TrendPoint {
  period: string;
  label: string;
  value: number;
}

/** A named series for multi-line / multi-bar trend charts.
 *  Optional `colorToken` maps to a `Theme.chartSeriesN` key so palette
 *  changes stay centralized. */
export interface TrendSeries {
  id: string;
  label: string;
  colorToken?:
    | "chartSeries1"
    | "chartSeries2"
    | "chartSeries3"
    | "chartSeries4"
    | "chartSeries5"
    | "chartSeries6";
  points: TrendPoint[];
}

/** Score with breakdown — shape returned by all three `compute_*_score`
 *  RPCs. The discriminated `kind` lets downstream code use the same
 *  `<ScoreCard>` component while accessing strongly-typed sub-scores. */
export interface AnalyticsScoreBase {
  score: number;
  level: ScoreLevel;
}

// ─────────────────────────────────────────────────────────────────────────────
// Client analytics
// ─────────────────────────────────────────────────────────────────────────────

/** Row returned by `get_client_monthly_analytics`. */
export interface ClientMonthlyAnalyticsRow {
  period: string;
  revenue: number;
  margin: number;
  margin_pct: number;
  trip_count: number;
  km_driven: number;
  collected: number;
  outstanding: number;
  avg_payment_delay_days: number;
  on_time_pct: number;
  cancellation_rate_pct: number;
}

/** KPI header for the per-client analytics tab. */
export interface ClientKpiHeader {
  totalRevenue: number;
  netMargin: number;
  marginPct: number;
  tripCount: number;
  outstanding: number;
  avgPaymentDelayDays: number;
  profitabilityPct: number;
  activeRoutes: number;
  businessGrowthPct: number;
}

/** Customer Health Score — payload shape of
 *  `compute_client_health_score(org, client).result`. */
export interface CustomerHealthScore extends AnalyticsScoreBase {
  profitabilityScore: number;
  paymentScore: number;
  operationsScore: number;
  consistencyScore: number;
  growthScore: number;
  breakdown: {
    revenue6m: number;
    margin6m: number;
    marginPct: number;
    collected6m: number;
    outstanding6m: number;
    avgPaymentDelay: number;
    tripsTotal: number;
    tripsCompleted: number;
    distinctMonths: number;
    recentRevenue: number;
    priorRevenue: number;
  };
}

/** Strategic badge bestowed on a client based on score + behaviour. */
export type ClientBadge =
  | "premium"
  | "high_risk"
  | "fast_paying"
  | "high_margin"
  | "strategic"
  | "growing"
  | "declining";

// ─────────────────────────────────────────────────────────────────────────────
// Supplier analytics
// ─────────────────────────────────────────────────────────────────────────────

/** Row returned by `get_supplier_monthly_analytics`. */
export interface SupplierMonthlyAnalyticsRow {
  period: string;
  revenue_handled: number;
  supplier_payable: number;
  margin_contribution: number;
  margin_contribution_pct: number;
  trip_count: number;
  km_driven: number;
  paid: number;
  outstanding: number;
  avg_settlement_days: number;
  on_time_pct: number;
  cancellation_rate_pct: number;
}

/** KPI header for the per-supplier analytics tab. */
export interface SupplierKpiHeader {
  tripsExecuted: number;
  revenueHandled: number;
  marginContribution: number;
  marginContributionPct: number;
  outstanding: number;
  onTimePct: number;
  vehicleQualityScore: number;
  cancellationRatePct: number;
  reliabilityScore: number;
}

/** Supplier Reliability Score — payload of
 *  `compute_supplier_reliability_score(org, supplier).result`. */
export interface SupplierReliabilityScore extends AnalyticsScoreBase {
  completionScore: number;
  onTimeScore: number;
  cancellationScore: number;
  availabilityScore: number;
  pricingScore: number;
  breakdown: {
    tripsTotal: number;
    tripsCompleted: number;
    tripsCancelled: number;
    onTime: number;
    onTimeEligible: number;
    completionPct: number;
    cancellationPct: number;
    onTimePct: number;
    distinctMonths: number;
    rateStddev: number;
    rateAvg: number;
  };
}

/** Strategic badge for a supplier. */
export type SupplierBadge =
  | "preferred"
  | "high_risk"
  | "reliable"
  | "low_quality"
  | "best_value"
  | "frequent_canceller";

// ─────────────────────────────────────────────────────────────────────────────
// Driver analytics
// ─────────────────────────────────────────────────────────────────────────────

/** Row returned by `get_driver_monthly_analytics`. */
export interface DriverMonthlyAnalyticsRow {
  period: string;
  revenue: number;
  earnings: number;
  paid: number;
  trip_count: number;
  km_driven: number;
}

/** KPI header for the per-driver Earnings Analytics tab. */
export interface DriverEarningsKpiHeader {
  salaryPaid: number;
  pendingSalary: number;
  tripIncentives: number;
  advanceTotal: number;
  deductions: number;
  fuelRecovery: number;
  bonusTotal: number;
  monthlyEarnings: number;
}

/** Productivity panel — Revenue / Day, Trips / Week, etc. */
export interface DriverProductivityMetrics {
  revenuePerDay: number;
  tripsPerWeek: number;
  kmDriven: number;
  idleDays: number;
  activeDays: number;
  revenuePerKm: number;
}

/** Driver Performance Score — payload of
 *  `compute_driver_performance_score(org, driver).result`. */
export interface DriverPerformanceScore extends AnalyticsScoreBase {
  settlementScore: number;
  completionScore: number;
  onTimeScore: number;
  productivityScore: number;
  ratingsScore: number;
  breakdown: {
    tripsTotal: number;
    tripsCompleted: number;
    onTime: number;
    onTimeEligible: number;
    revenue6m: number;
    earnings6m: number;
    paid6m: number;
    distinctMonths: number;
    avgRating: number;
    ratingCount: number;
  };
}

/** Row in the fleet-wide driver leaderboard. */
export interface DriverLeaderboardRow {
  driverId: string;
  name: string;
  avatarUrl: string | null;
  avatarSeed: string | null;
  rank: number;
  revenue: number;
  trips: number;
  onTimePct: number;
  margin: number;
  score: number;
  level: ScoreLevel;
  earnings: number;
  riskFlag: boolean;
  // Movement vs previous period: positive = climbed N positions.
  trendDelta: number;
}

/** Driver leaderboard sort dimension. Maps to a `DriverLeaderboardRow`
 *  field; UI keeps a sortKey-derived percentile column visible. */
export type DriverLeaderboardSortKey =
  | "revenue"
  | "trips"
  | "onTimePct"
  | "margin"
  | "score"
  | "earnings"
  | "rank";

// ─────────────────────────────────────────────────────────────────────────────
// Vehicle analytics
// ─────────────────────────────────────────────────────────────────────────────

/** KPI header for the Vehicle Intelligence section / Fleet ranking. */
export interface VehicleKpiHeader {
  tripsTotal: number;
  tripsCompleted: number;
  revenue: number;
  expense: number;
  profit: number;
  marginPct: number;
  kmDriven: number;
  activeDays: number;
  utilizationPct: number;
  performanceScore: number;
}

/** Vehicle Performance Score — payload of
 *  `compute_vehicle_performance_score(org, vehicle).result`. */
export interface VehiclePerformanceScore extends AnalyticsScoreBase {
  profitabilityScore: number;
  utilizationScore: number;
  completionScore: number;
  costEfficiencyScore: number;
  consistencyScore: number;
  breakdown: {
    tripsTotal: number;
    tripsCompleted: number;
    tripsCancelled: number;
    revenue: number;
    expense: number;
    profit: number;
    marginPct: number;
    expenseRatio: number;
    distance: number;
    distinctMonths: number;
    tripsPerMonthAvg: number;
    tripsPerMonthCv: number;
  };
}

/** Strategic badge for a vehicle. */
export type VehicleBadge =
  | "top_earner"
  | "high_risk"
  | "most_utilized"
  | "underutilized"
  | "cost_efficient"
  | "expensive"
  | "consistent";

/** Row in the fleet-wide vehicle leaderboard. */
export interface VehicleLeaderboardRow {
  vehicleId: string;
  vehicleNumber: string;
  vehicleType: string | null;
  rank: number;
  trips: number;
  revenue: number;
  profit: number;
  marginPct: number;
  utilizationPct: number;
  kmDriven: number;
  score: number;
  level: ScoreLevel;
  riskFlag: boolean;
}

/** Vehicle leaderboard sort dimension. */
export type VehicleLeaderboardSortKey =
  | "score"
  | "revenue"
  | "trips"
  | "profit"
  | "marginPct"
  | "utilizationPct"
  | "kmDriven"
  | "rank";

// ─────────────────────────────────────────────────────────────────────────────
// Generic primitives (used by all three modules)
// ─────────────────────────────────────────────────────────────────────────────

/** A KPI card shown in a header grid. `tone` drives color accents:
 *  - "neutral"  → slate text
 *  - "positive" → green chip
 *  - "negative" → red chip
 *  - "warning"  → amber chip
 *  - "info"     → indigo chip
 */
export interface AnalyticsKpi {
  id: string;
  label: string;
  value: string;
  rawValue?: number;
  caption?: string;
  delta?: {
    label: string;
    direction: "up" | "down" | "flat";
  };
  tone?: "neutral" | "positive" | "negative" | "warning" | "info";
  iconName?: string;
}

/** Single cell in a heatmap grid. `intensity` is 0..1; tone colors are
 *  resolved by the consumer using `Theme.heatmap*`. */
export interface HeatmapCell {
  rowId: string;
  colId: string;
  intensity: number;
  label?: string;
  tone?: "healthy" | "notice" | "warning" | "critical" | "empty";
}

/** An auto-derived insight bullet shown in `<InsightsPanel>`. */
export interface AnalyticsInsight {
  id: string;
  message: string;
  tone: "positive" | "negative" | "warning" | "info";
  iconName?: string;
  href?: string;
}

/** Filter state for analytics dashboards. */
export interface AnalyticsFilterState {
  period: AnalyticsPeriod;
  monthsBack: number;
  search: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Map a numeric 0..100 score into a `ScoreLevel`. Shared so the TS
 *  helpers and the SQL RPCs use identical thresholds. */
export function scoreLevelFromValue(score: number): ScoreLevel {
  if (!Number.isFinite(score)) return "unknown";
  if (score >= 90) return "excellent";
  if (score >= 70) return "good";
  if (score >= 50) return "warning";
  return "critical";
}
