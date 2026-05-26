/**
 * Reusable analytics UI primitives.
 *
 * Single import surface for KPI cards, score cards, leaderboards,
 * heatmaps, gauges, filters, and insights — used by:
 *   • Driver Fleet Ranking + Earnings Analytics
 *   • Client Performance Analytics
 *   • Supplier Reliability Analytics
 *
 * Existing inline implementations across
 * `features/{vehicles,drivers}/components/analytics/*` will be migrated
 * to these primitives in a later refactor phase. New code should import
 * from here exclusively.
 */

export {
  ChartCard,
  KPICard,
  KPIHeader,
  ScoreCard,
  SectionHeader,
} from "./AnalyticsCards";
export type {
  ChartCardProps,
  KPICardProps,
  KPIHeaderProps,
  ScoreCardProps,
  SectionHeaderProps,
} from "./AnalyticsCards";

export {
  HBarChart,
  PerformanceLeaderboard,
  RankBadge,
} from "./PerformanceLeaderboard";
export type {
  HBarChartProps,
  HBarItem,
  LeaderboardColumn,
  PerformanceLeaderboardProps,
  RankBadgeProps,
  RankTier,
} from "./PerformanceLeaderboard";

export { RiskMeter } from "./RiskMeter";
export type { RiskMeterProps } from "./RiskMeter";

export { Heatmap } from "./Heatmap";
export type { HeatmapColumn, HeatmapProps, HeatmapRow } from "./Heatmap";

export {
  AnalyticsFilters,
  FilterChip,
  PeriodPicker,
} from "./AnalyticsFilters";
export type {
  AnalyticsFiltersProps,
  FilterChipProps,
  PeriodPickerProps,
} from "./AnalyticsFilters";

export { InsightsPanel } from "./InsightsPanel";
export type { InsightsPanelProps } from "./InsightsPanel";
