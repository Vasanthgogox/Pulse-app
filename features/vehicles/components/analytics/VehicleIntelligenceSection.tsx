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

import { Theme } from "@/constants/Theme";
import { formatINR } from "@/lib/format";

import {
  PulseGaugePanel,
  PulseHealthRow,
  PulseHealthScorePanel,
  PulseInsightsPanel,
  PulseKpiGrid,
  PulseSection,
  type PulseKpiItem,
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

  const kpiRows = useMemo(
    (): ReadonlyArray<ReadonlyArray<PulseKpiItem | null>> => [
      [
        {
          id: "v-score",
          label: "Performance score",
          value: `${kpis.performanceScore || "—"}`,
          subtext: score ? "Composite 0-100" : "Insufficient data",
          valueColor:
            kpis.performanceScore >= 80
              ? Theme.positive
              : kpis.performanceScore >= 60
                ? Theme.warning
                : Theme.negative,
          iconName: "tachometer",
        },
        {
          id: "v-utilization",
          label: "Utilization",
          value: `${kpis.utilizationPct}%`,
          subtext: `${kpis.activeDays} active days`,
          valueColor:
            kpis.utilizationPct >= 70
              ? Theme.positive
              : kpis.utilizationPct >= 40
                ? Theme.warning
                : Theme.negative,
          iconName: "pie-chart",
        },
        {
          id: "v-completion",
          label: "Completion",
          value:
            kpis.tripsTotal > 0
              ? `${Math.round((kpis.tripsCompleted / kpis.tripsTotal) * 100)}%`
              : "—",
          subtext: `${kpis.tripsCompleted}/${kpis.tripsTotal} trips`,
          valueColor: Theme.positive,
          iconName: "check",
        },
        {
          id: "v-km",
          label: "Distance",
          value: `${kpis.kmDriven.toLocaleString("en-IN")} km`,
          subtext: "Last window",
          valueColor: Theme.textBody,
          iconName: "road",
        },
      ],
    ],
    [kpis, score],
  );

  const healthBars = score
    ? [
        { label: "Profitability", percent: score.profitabilityScore },
        { label: "Utilization", percent: score.utilizationScore, color: Theme.positive },
        { label: "Completion", percent: score.completionScore },
        {
          label: "Cost efficiency",
          percent: score.costEfficiencyScore,
          color: score.costEfficiencyScore < 50 ? Theme.negative : Theme.primary,
        },
        { label: "Consistency", percent: score.consistencyScore },
      ]
    : [];

  const primaryBadge = badges[0] ? badgeLabel(badges[0]) : undefined;

  return (
    <PulseSection
      title="Vehicle intelligence"
      subtitle="Composite 0-100 score across profitability, utilization, completion, cost, consistency"
    >
      <PulseKpiGrid rows={kpiRows} />

      <PulseHealthRow
        score={
          score ? (
            <PulseHealthScorePanel
              title="Performance score"
              score={Math.round(score.score)}
              level={score.level}
              caption={`${score.breakdown.tripsTotal} trips · last 6 months`}
              badgeLabel={primaryBadge}
              bars={healthBars}
            />
          ) : (
            <PulseHealthScorePanel
              title="Performance score"
              score={0}
              level="unknown"
              caption="Not enough trip history yet"
              bars={[]}
            />
          )
        }
        gauge={
          <PulseGaugePanel
            value={kpis.utilizationPct}
            level={scoreLevelFromValue(kpis.utilizationPct)}
            label="Utilization"
            caption={`${kpis.activeDays} active days in window`}
          />
        }
      />

      {insights.length > 0 ? (
        <PulseInsightsPanel
          insights={insights.map((i) => ({
            message: i.message,
            tone: i.tone,
          }))}
        />
      ) : null}
    </PulseSection>
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

