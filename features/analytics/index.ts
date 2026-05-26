/**
 * Analytics feature — public surface.
 * ============================================================================
 *
 * Single import point for analytics types, score engines, and services.
 * See `analytics.types.ts` for the full type catalog and the SQL migrations
 * `20260828020000_analytics_rpcs.sql` / `20260828030000_analytics_indexes.sql`
 * for the backend contract.
 *
 * Consumers should import from this barrel, not from sub-modules:
 *
 *   import {
 *     computeCustomerHealthScore,
 *     getClientMonthlyAnalytics,
 *     scoreLevelFromValue,
 *   } from "@/features/analytics";
 */

// ── Types ────────────────────────────────────────────────────────────────────
export type {
  AnalyticsFilterState,
  AnalyticsInsight,
  AnalyticsKpi,
  AnalyticsPeriod,
  AnalyticsScoreBase,
  ClientBadge,
  ClientKpiHeader,
  ClientMonthlyAnalyticsRow,
  CustomerHealthScore,
  DriverEarningsKpiHeader,
  DriverLeaderboardRow,
  DriverLeaderboardSortKey,
  DriverMonthlyAnalyticsRow,
  DriverPerformanceScore,
  DriverProductivityMetrics,
  HeatmapCell,
  ScoreLevel,
  SupplierBadge,
  SupplierKpiHeader,
  SupplierMonthlyAnalyticsRow,
  SupplierReliabilityScore,
  TrendPoint,
  TrendSeries,
  VehicleBadge,
  VehicleKpiHeader,
  VehicleLeaderboardRow,
  VehicleLeaderboardSortKey,
  VehiclePerformanceScore,
} from "./types/analytics.types";

export { scoreLevelFromValue } from "./types/analytics.types";

// ── Score engines ────────────────────────────────────────────────────────────
export {
  computeCustomerHealthScore,
  deriveCustomerBadges,
} from "./scores/customerHealthScore.util";
export type {
  ClientHealthScoreOptions,
  ClientScoreTripInput,
  ClientScoreTxnInput,
} from "./scores/customerHealthScore.util";

export {
  computeSupplierReliabilityScore,
  deriveSupplierBadges,
} from "./scores/supplierReliabilityScore.util";
export type {
  SupplierScoreOptions,
  SupplierScoreTripInput,
} from "./scores/supplierReliabilityScore.util";

export { computeDriverPerformanceScore } from "./scores/driverPerformanceScore.util";
export type {
  DriverScoreOptions,
  DriverScoreRatingInput,
  DriverScoreTripInput,
  DriverScoreTxnInput,
} from "./scores/driverPerformanceScore.util";

export {
  computeVehiclePerformanceScore,
  deriveVehicleBadges,
} from "./scores/vehiclePerformanceScore.util";
export type {
  VehicleScoreOptions,
  VehicleScoreTripInput,
  VehicleScoreTxnInput,
} from "./scores/vehiclePerformanceScore.util";

// ── Services ─────────────────────────────────────────────────────────────────
export {
  getClientMonthlyAnalytics,
  getCustomerHealthScore,
  getDriverMonthlyAnalytics,
  getDriverPerformanceScore,
  getSupplierMonthlyAnalytics,
  getSupplierReliabilityScore,
  getVehicleMonthlyAnalytics,
  getVehiclePerformanceScore,
} from "./services/analytics.service";

export type {
  ClientAnalyticsResult,
  DriverAnalyticsResult,
  SupplierAnalyticsResult,
  VehicleMonthlyAnalyticsRow,
} from "./services/analytics.service";
