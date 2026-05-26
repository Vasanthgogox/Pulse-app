/**
 * VehicleIntelligenceSection — drop-in overlay for VehicleAnalyticsTab.
 * ============================================================================
 *
 * Surfaces the composite Vehicle Performance Score, sub-scores, badges,
 * utilization risk meter, and auto-derived insights. Injected at the
 * TOP of the existing `<VehicleAnalyticsTab>` without rewriting the
 * (already comprehensive) charts that sit beneath it.
 *
 * Layout:
 *   ┌─ Header KPI grid (4 cols)              ┐
 *   │                                         │
 *   ├─ ScoreCard ─┬─ Utilization RiskMeter ──┤
 *   │ sub-scores  │  caption                  │
 *   │ badges      │                           │
 *   ├─────────────┴───────────────────────────┤
 *   └─ Auto Insights (when present)           ┘
 *
 * Score sourcing:
 *   1. Server score from `useVehiclePerformanceScoreQuery` (10 min cache)
 *   2. Local TS engine fallback when server returns nothing — keeps the
 *      section useful on day 1 before RPC migration runs.
 */

import { useMemo } from "react";
import { StyleSheet, View } from "react-native";

import { Theme } from "@/constants/Theme";
import { formatINR } from "@/lib/format";

import {
  KPIHeader,
  InsightsPanel,
  RiskMeter,
  ScoreCard,
  SectionHeader,
} from "@/components/analytics";

import { useVehiclePerformanceScoreQuery } from "@/lib/queries/useAnalyticsQueries";

import {
  computeVehiclePerformanceScore,
  deriveVehicleBadges,
  scoreLevelFromValue,
  type VehiclePerformanceScore,
} from "@/features/analytics";

import type { LedgerRow } from "@/features/finance";
import type { TripRow } from "@/features/trips/services/trips.service";
import type { VehicleRow } from "../../services/vehicles.service";

import type { MissionRow } from "./analyticsUtils";
import {
  computeVehicleKpiHeader,
  deriveVehicleInsights,
  type VehicleMonthlyBuckets,
} from "./vehicleIntelligenceUtils";

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  vehicle: VehicleRow | null;
  vehicleTrips: TripRow[];
  vehicleTransactions: LedgerRow[];
  missionRows: MissionRow[];
  orgId: string | null;
  /** Optional pre-computed monthly buckets (e.g. from `computePeriodPoints`)
   *  — used to derive month-over-month volume insights. */
  monthlyBuckets?: VehicleMonthlyBuckets[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function VehicleIntelligenceSection({
  vehicle,
  vehicleTrips,
  vehicleTransactions,
  missionRows,
  orgId,
  monthlyBuckets = [],
}: Props) {
  const vehicleId = vehicle?.id ?? null;

  // ── Server score ──
  const { data: serverScore } = useVehiclePerformanceScoreQuery(orgId, vehicleId);

  // ── Local fallback ──
  const localScore: VehiclePerformanceScore | null = useMemo(() => {
    if (serverScore) return null;
    if (!vehicleId) return null;
    return computeVehiclePerformanceScore(
      vehicleId,
      vehicleTrips.map((t) => ({
        id: t.id,
        vehicle_id: t.vehicle_id,
        client_price: Number(t.client_price ?? 0),
        status: t.status,
        distance: Number(t.distance ?? 0),
        pickup_date: t.pickup_date,
        created_at: t.created_at,
      })),
      vehicleTransactions.map((tx) => ({
        trip_id: tx.trip_id,
        amount_out: Number(tx.amount_out ?? 0),
        contact_type: tx.contact_type ?? null,
        transaction_date: tx.transaction_date ?? null,
        created_at: tx.created_at ?? null,
      })),
    );
  }, [serverScore, vehicleId, vehicleTrips, vehicleTransactions]);

  const score = serverScore ?? localScore;

  // ── KPI header ──
  const kpis = useMemo(
    () => computeVehicleKpiHeader(missionRows, vehicleTrips, { score }),
    [missionRows, vehicleTrips, score],
  );

  const badges = useMemo(() => deriveVehicleBadges(score), [score]);
  const insights = useMemo(
    () => deriveVehicleInsights(score, kpis, monthlyBuckets),
    [score, kpis, monthlyBuckets],
  );

  return (
    <View style={styles.root}>
      <SectionHeader
        title="Vehicle intelligence"
        subtitle="Composite 0-100 score across profitability, utilization, completion, cost, consistency"
      />

      {/* 1. KPI Header — 8 cards */}
      <KPIHeader
        columns={4}
        cards={[
          {
            id: "v-score",
            label: "Performance score",
            value: `${kpis.performanceScore || "—"}`,
            sub: score ? "Composite 0-100" : "Insufficient data",
            accent:
              kpis.performanceScore >= 80
                ? Theme.chartSeries2
                : kpis.performanceScore >= 60
                  ? Theme.chartSeries3
                  : Theme.chartSeries4,
          },
          {
            id: "v-revenue",
            label: "Revenue",
            value: formatINR(kpis.revenue),
            sub: `${kpis.tripsTotal} trips`,
            accent: Theme.chartSeries1,
          },
          {
            id: "v-profit",
            label: "Profit",
            value: formatINR(kpis.profit),
            sub: `${kpis.marginPct.toFixed(1)}% margin`,
            accent:
              kpis.profit >= 0 ? Theme.chartSeries2 : Theme.chartSeries4,
            alert: kpis.profit < 0,
          },
          {
            id: "v-expense",
            label: "Expense",
            value: formatINR(kpis.expense),
            sub:
              kpis.revenue > 0
                ? `${((kpis.expense / kpis.revenue) * 100).toFixed(0)}% of revenue`
                : "—",
            accent:
              kpis.revenue > 0 && kpis.expense / kpis.revenue >= 0.8
                ? Theme.chartSeries4
                : Theme.chartSeries3,
          },
          {
            id: "v-utilization",
            label: "Utilization",
            value: `${kpis.utilizationPct}%`,
            sub: `${kpis.activeDays} active days`,
            accent:
              kpis.utilizationPct >= 70
                ? Theme.chartSeries2
                : kpis.utilizationPct >= 40
                  ? Theme.chartSeries3
                  : Theme.chartSeries4,
          },
          {
            id: "v-completion",
            label: "Completion",
            value:
              kpis.tripsTotal > 0
                ? `${Math.round((kpis.tripsCompleted / kpis.tripsTotal) * 100)}%`
                : "—",
            sub: `${kpis.tripsCompleted}/${kpis.tripsTotal} trips`,
            accent: Theme.chartSeries2,
          },
          {
            id: "v-km",
            label: "Distance",
            value: `${kpis.kmDriven.toLocaleString("en-IN")} km`,
            sub: "Last window",
            accent: Theme.chartSeries5,
          },
          {
            id: "v-trips",
            label: "Trips",
            value: `${kpis.tripsTotal}`,
            sub: "Total in window",
            accent: Theme.chartSeries6,
          },
        ]}
      />

      {/* 2. Score + Utilization risk meter */}
      <View style={styles.scoreRow}>
        <View style={styles.scoreCol}>
          {score ? (
            <ScoreCard
              title="Performance score"
              score={Math.round(score.score)}
              level={score.level}
              caption={`${score.breakdown.tripsTotal} trips · last 6 months`}
              subScores={[
                { label: "Profitability", value: Math.round(score.profitabilityScore) },
                { label: "Utilization", value: Math.round(score.utilizationScore) },
                { label: "Completion", value: Math.round(score.completionScore) },
                { label: "Cost efficiency", value: Math.round(score.costEfficiencyScore) },
                { label: "Consistency", value: Math.round(score.consistencyScore) },
              ]}
              badges={badges.map((b) => ({
                label: badgeLabel(b),
                tone: badgeTone(b),
              }))}
            />
          ) : (
            <ScoreCard
              title="Performance score"
              score={0}
              level="unknown"
              caption="Not enough trip history yet"
            />
          )}
        </View>
        <View style={styles.scoreCol}>
          <View style={styles.meterCard}>
            <RiskMeter
              value={kpis.utilizationPct}
              level={scoreLevelFromValue(kpis.utilizationPct)}
              label="Utilization"
              caption={`${kpis.activeDays} active days in window`}
              size={150}
              stroke={14}
            />
          </View>
        </View>
      </View>

      {/* 3. Insights */}
      {insights.length > 0 ? (
        <View style={styles.insights}>
          <SectionHeader title="What the data is telling you" />
          <InsightsPanel insights={insights} />
        </View>
      ) : null}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Badge helpers
// ─────────────────────────────────────────────────────────────────────────────

function badgeLabel(b: string): string {
  switch (b) {
    case "top_earner": return "Top performer";
    case "high_risk": return "High risk";
    case "most_utilized": return "Most utilized";
    case "underutilized": return "Underutilized";
    case "cost_efficient": return "Cost efficient";
    case "expensive": return "Expensive";
    case "consistent": return "Consistent";
    default: return b;
  }
}

function badgeTone(
  b: string,
): "excellent" | "good" | "warning" | "critical" | "info" {
  switch (b) {
    case "top_earner":
    case "most_utilized":
      return "excellent";
    case "cost_efficient":
    case "consistent":
      return "good";
    case "underutilized":
    case "expensive":
      return "warning";
    case "high_risk":
      return "critical";
    default:
      return "info";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    gap: 16,
    paddingBottom: 8,
  },
  scoreRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  scoreCol: {
    flex: 1,
    minWidth: 280,
  },
  meterCard: {
    backgroundColor: Theme.surface,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 220,
  },
  insights: {
    gap: 8,
  },
});
