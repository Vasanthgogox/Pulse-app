/**
 * SupplierAnalyticsTab — Supplier Reliability Intelligence dashboard.
 * ============================================================================
 *
 * Drop-in tab rendered inside `<SupplierDetailScreen>`. Answers:
 *   "Which suppliers are most reliable, cost-stable, and strategically
 *    valuable enough to make preferred vendors?"
 *
 * Sections:
 *   1. Header KPIs    — trips, revenue handled, margin, outstanding, on-time,
 *                       vehicle-quality, cancellation, reliability score
 *   2. Reliability    — composite 0-100 score + sub-scores + badges +
 *                       on-time gauge
 *   3. Operational    — completion / acceptance / cancellation / dispute /
 *                       turnaround
 *   4. Financial      — payable trend, settlement, margin contribution,
 *                       advance usage, contract profitability
 *   5. Pricing        — supplier_rate stability + per-lane variance
 *   6. Insights       — auto-derived operational callouts
 *
 * All compute is pure & memoised. Server reliability score is fetched
 * via TanStack Query; local TS engine kicks in as a fallback.
 */

import { useMemo } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";

import { Theme } from "@/constants/Theme";
import { formatINR, formatINRChip } from "@/lib/format";

import {
  ChartCard,
  HBarChart,
  InsightsPanel,
  KPIHeader,
  RiskMeter,
  ScoreCard,
  SectionHeader,
} from "@/components/analytics";
import {
  LineChart,
  RevExpBarChart,
} from "@/features/vehicles/components/analytics/AnalyticsChart";

import { useSupplierReliabilityScoreQuery } from "@/lib/queries/useAnalyticsQueries";

import {
  computeSupplierReliabilityScore,
  deriveSupplierBadges,
  scoreLevelFromValue,
  type SupplierReliabilityScore,
} from "@/features/analytics";

import type { LedgerRow } from "@/features/finance";
import type { SupplierRow } from "@/features/suppliers/services/suppliers.service";
import type { TripRow } from "@/features/trips/services/trips.service";

import {
  computeSupplierFinancialMetrics,
  computeSupplierKpiHeader,
  computeSupplierMonthlyTrend,
  computeSupplierOperationalMetrics,
  computeSupplierPricingStability,
  deriveSupplierInsights,
  type SupplierMonthlyTrendPoint,
} from "./supplierAnalyticsUtils";

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  supplier: SupplierRow | null;
  trips: TripRow[];
  transactions: LedgerRow[];
  orgId: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Chart projections — adapt monthly trend onto `PeriodPoint` shape.
// ─────────────────────────────────────────────────────────────────────────────

interface ChartPoint {
  label: string;
  revenue: number;
  expense: number;
  profit: number;
  margin: number;
  tripCount: number;
}

function toPayableLine(months: readonly SupplierMonthlyTrendPoint[]): ChartPoint[] {
  return months.map((m) => ({
    label: m.label,
    revenue: m.payable,
    expense: 0,
    profit: 0,
    margin: 0,
    tripCount: m.trips,
  }));
}

function toMarginLine(months: readonly SupplierMonthlyTrendPoint[]): ChartPoint[] {
  return months.map((m) => ({
    label: m.label,
    revenue: m.margin,
    expense: 0,
    profit: 0,
    margin: 0,
    tripCount: m.trips,
  }));
}

function toPaidVsOutstanding(
  months: readonly SupplierMonthlyTrendPoint[],
): ChartPoint[] {
  return months.map((m) => ({
    label: m.label,
    revenue: m.paid,
    expense: m.outstanding,
    profit: 0,
    margin: 0,
    tripCount: m.trips,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab
// ─────────────────────────────────────────────────────────────────────────────

export default function SupplierAnalyticsTab({
  supplier,
  trips,
  transactions,
  orgId,
}: Props) {
  const { width } = useWindowDimensions();
  const chartWidth = Math.max(280, Math.min(width - 64, 720));
  const supplierId = supplier?.id ?? null;

  // ── Server score ──
  const { data: serverScore } = useSupplierReliabilityScoreQuery(orgId, supplierId);

  // ── Fallback: compute client-side ──
  const localScore: SupplierReliabilityScore | null = useMemo(() => {
    if (serverScore) return null;
    if (!supplierId) return null;
    return computeSupplierReliabilityScore(
      supplierId,
      trips.map((t) => ({
        id: t.id,
        supplier_id: t.supplier_id,
        supplier_rate: Number(t.supplier_rate ?? 0),
        status: t.status,
        pickup_date: t.pickup_date,
        completed_at: t.completed_at,
        created_at: t.created_at,
      })),
    );
  }, [serverScore, supplierId, trips]);

  const score = serverScore ?? localScore;

  // ── Compute everything once ──
  const kpis = useMemo(
    () => computeSupplierKpiHeader(trips, transactions, { score }),
    [trips, transactions, score],
  );
  const monthly = useMemo(
    () =>
      computeSupplierMonthlyTrend(trips, transactions, { monthsBack: 12 }),
    [trips, transactions],
  );
  const operations = useMemo(
    () => computeSupplierOperationalMetrics(trips, transactions),
    [trips, transactions],
  );
  const financial = useMemo(
    () => computeSupplierFinancialMetrics(trips, transactions),
    [trips, transactions],
  );
  const pricing = useMemo(
    () => computeSupplierPricingStability(trips, { topLanes: 5 }),
    [trips],
  );
  const badges = useMemo(() => deriveSupplierBadges(score), [score]);
  const insights = useMemo(
    () => deriveSupplierInsights(monthly, kpis, operations, pricing, financial),
    [monthly, kpis, operations, pricing, financial],
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <View style={styles.root}>
      {/* 1. Header KPIs */}
      <KPIHeader
        columns={4}
        cards={[
          {
            id: "trips",
            label: "Trips executed",
            value: `${kpis.tripsExecuted}`,
            sub: `${operations.completionPct.toFixed(0)}% completion`,
            accent: Theme.chartSeries1,
          },
          {
            id: "revenue",
            label: "Revenue handled",
            value: formatINR(kpis.revenueHandled),
            sub: "Last 12 months",
            accent: Theme.chartSeries5,
          },
          {
            id: "margin",
            label: "Margin contribution",
            value: formatINR(kpis.marginContribution),
            sub: `${kpis.marginContributionPct.toFixed(1)}% margin`,
            accent:
              kpis.marginContribution >= 0
                ? Theme.chartSeries2
                : Theme.chartSeries4,
          },
          {
            id: "outstanding",
            label: "Payable outstanding",
            value: formatINR(kpis.outstanding),
            sub: `Avg ${financial.avgSettlementDays}d settlement`,
            accent:
              kpis.outstanding > 0 ? Theme.chartSeries4 : Theme.chartSeries2,
            alert: kpis.outstanding > 0 && financial.avgSettlementDays >= 30,
          },
          {
            id: "ontime",
            label: "On-time availability",
            value: `${kpis.onTimePct}%`,
            sub: `${operations.onTime}/${operations.onTimeEligible} trips`,
            accent:
              kpis.onTimePct >= 85
                ? Theme.chartSeries2
                : kpis.onTimePct >= 60
                  ? Theme.chartSeries3
                  : Theme.chartSeries4,
          },
          {
            id: "vehicle-quality",
            label: "Vehicle quality",
            value: `${kpis.vehicleQualityScore}`,
            sub: "Completion + on-time blend",
            accent:
              kpis.vehicleQualityScore >= 85
                ? Theme.chartSeries2
                : kpis.vehicleQualityScore >= 60
                  ? Theme.chartSeries3
                  : Theme.chartSeries4,
          },
          {
            id: "cancellation",
            label: "Cancellation",
            value: `${kpis.cancellationRatePct.toFixed(1)}%`,
            sub: `${operations.tripsCancelled} cancelled`,
            accent:
              kpis.cancellationRatePct >= 10
                ? Theme.chartSeries4
                : Theme.chartSeries3,
            alert: kpis.cancellationRatePct >= 15,
          },
          {
            id: "reliability",
            label: "Reliability score",
            value: `${kpis.reliabilityScore}`,
            sub: score ? "Composite 0-100" : "Insufficient data",
            accent:
              kpis.reliabilityScore >= 80
                ? Theme.chartSeries2
                : kpis.reliabilityScore >= 60
                  ? Theme.chartSeries3
                  : Theme.chartSeries4,
          },
        ]}
      />

      {/* 2. Reliability Score */}
      <SectionHeader
        title="Supplier reliability"
        subtitle="Composite 0-100 across completion, on-time, cancellation, availability, pricing"
      />
      <View style={styles.scoreRow}>
        <View style={styles.scoreCol}>
          {score ? (
            <ScoreCard
              title="Reliability score"
              score={Math.round(score.score)}
              level={score.level}
              caption={`${score.breakdown.tripsTotal} trips · last 6 months`}
              subScores={[
                { label: "Completion", value: Math.round(score.completionScore) },
                { label: "On-time", value: Math.round(score.onTimeScore) },
                { label: "Cancellation", value: Math.round(score.cancellationScore) },
                { label: "Availability", value: Math.round(score.availabilityScore) },
                { label: "Pricing", value: Math.round(score.pricingScore) },
              ]}
              badges={badges.map((b) => ({
                label: badgeLabel(b),
                tone: badgeTone(b),
              }))}
            />
          ) : (
            <ScoreCard
              title="Reliability score"
              score={0}
              level="unknown"
              caption="Not enough trip history yet"
            />
          )}
        </View>
        <View style={styles.scoreCol}>
          <View style={styles.meterCard}>
            <RiskMeter
              value={kpis.onTimePct}
              level={scoreLevelFromValue(kpis.onTimePct)}
              label="On-time availability"
              caption={`${operations.onTime}/${operations.onTimeEligible} eligible trips`}
              size={150}
              stroke={14}
            />
          </View>
        </View>
      </View>

      {/* 3. Operational Intelligence */}
      <SectionHeader
        title="Operational intelligence"
        subtitle="Trip lifecycle quality — acceptance, completion, cancellation, disputes"
      />
      <KPIHeader
        columns={3}
        cards={[
          {
            id: "o-accept",
            label: "Acceptance",
            value: `${operations.acceptancePct.toFixed(0)}%`,
            sub: "Trips not declined/cancelled",
            accent:
              operations.acceptancePct >= 90
                ? Theme.chartSeries2
                : operations.acceptancePct >= 70
                  ? Theme.chartSeries3
                  : Theme.chartSeries4,
          },
          {
            id: "o-completion",
            label: "Completion",
            value: `${operations.completionPct.toFixed(0)}%`,
            sub: `${operations.tripsCompleted}/${operations.tripsTotal}`,
            accent: Theme.chartSeries2,
          },
          {
            id: "o-ontime",
            label: "On-time",
            value: `${operations.onTimePct}%`,
            sub: `${operations.onTime}/${operations.onTimeEligible}`,
            accent:
              operations.onTimePct >= 85
                ? Theme.chartSeries2
                : operations.onTimePct >= 60
                  ? Theme.chartSeries3
                  : Theme.chartSeries4,
          },
          {
            id: "o-cancel",
            label: "Cancellations",
            value: `${operations.tripsCancelled}`,
            sub: `${operations.cancellationPct.toFixed(1)}% of total`,
            accent:
              operations.cancellationPct >= 10
                ? Theme.chartSeries4
                : Theme.chartSeries3,
            alert: operations.cancellationPct >= 15,
          },
          {
            id: "o-disputes",
            label: "Disputes",
            value: `${operations.disputeCount}`,
            sub: "Flagged trips",
            accent:
              operations.disputeCount > 0
                ? Theme.chartSeries4
                : Theme.chartSeries2,
            alert: operations.disputeCount >= 3,
          },
          {
            id: "o-turnaround",
            label: "Turnaround",
            value: `${operations.averageTurnaroundDays}d`,
            sub: "Pickup → complete",
            accent: Theme.chartSeries5,
          },
        ]}
      />

      <ChartCard
        title="On-time delivery trend"
        subtitle="Monthly on-time %"
      >
        <LineChart
          data={monthly.map((m) => ({
            label: m.label,
            revenue: m.onTimePct,
            expense: 0,
            profit: 0,
            margin: 0,
            tripCount: m.trips,
          }))}
          width={chartWidth}
          height={140}
          field="revenue"
          color={Theme.chartSeries2}
          gradientId="supplierOnTimeTrend"
        />
      </ChartCard>

      {/* 4. Financial Intelligence */}
      <SectionHeader
        title="Financial intelligence"
        subtitle="Payable trend, settlement velocity, margin contribution"
      />
      <KPIHeader
        columns={3}
        cards={[
          {
            id: "f-payable",
            label: "Total payable",
            value: formatINR(financial.payable),
            sub: "Last 12 months",
            accent: Theme.chartSeries4,
          },
          {
            id: "f-paid",
            label: "Paid out",
            value: formatINR(financial.paid),
            sub: "Settled to date",
            accent: Theme.chartSeries2,
          },
          {
            id: "f-outstanding",
            label: "Outstanding",
            value: formatINR(financial.outstanding),
            sub:
              financial.payable > 0
                ? `${((financial.outstanding / financial.payable) * 100).toFixed(0)}% of payable`
                : "—",
            accent:
              financial.outstanding > 0
                ? Theme.chartSeries4
                : Theme.chartSeries2,
            alert: financial.outstanding > 0 && financial.avgSettlementDays >= 30,
          },
          {
            id: "f-advance",
            label: "Advances paid",
            value: formatINR(financial.advancesPaid),
            sub: "Pre-payment usage",
            accent: Theme.chartSeries3,
          },
          {
            id: "f-settlement",
            label: "Settlement",
            value: `${financial.avgSettlementDays}d`,
            sub: "Pickup → payment avg",
            accent:
              financial.avgSettlementDays <= 7
                ? Theme.chartSeries2
                : financial.avgSettlementDays <= 30
                  ? Theme.chartSeries3
                  : Theme.chartSeries4,
            alert: financial.avgSettlementDays >= 45,
          },
          {
            id: "f-margin",
            label: "Margin %",
            value: `${kpis.marginContributionPct.toFixed(1)}%`,
            sub: `${formatINRChip(financial.contractProfitability)} contract`,
            accent:
              kpis.marginContributionPct >= 15
                ? Theme.chartSeries2
                : kpis.marginContributionPct >= 5
                  ? Theme.chartSeries3
                  : Theme.chartSeries4,
          },
        ]}
      />

      <ChartCard
        title="Payable trend"
        subtitle="Total supplier payable per month"
      >
        <LineChart
          data={toPayableLine(monthly)}
          width={chartWidth}
          height={150}
          field="revenue"
          color={Theme.chartSeries4}
          gradientId="supplierPayableTrend"
        />
      </ChartCard>

      <ChartCard
        title="Paid vs outstanding"
        subtitle="Green = settled, red = still payable per month"
      >
        <RevExpBarChart
          data={toPaidVsOutstanding(monthly)}
          width={chartWidth}
          height={160}
        />
      </ChartCard>

      <ChartCard
        title="Margin contribution"
        subtitle="Net margin you earn on this supplier per month"
      >
        <LineChart
          data={toMarginLine(monthly)}
          width={chartWidth}
          height={140}
          field="revenue"
          color={Theme.chartSeries2}
          gradientId="supplierMarginTrend"
        />
      </ChartCard>

      {/* 5. Pricing Stability */}
      <SectionHeader
        title="Pricing stability"
        subtitle="Lower variance = predictable cost-to-serve"
      />
      <KPIHeader
        columns={3}
        cards={[
          {
            id: "p-avg",
            label: "Avg rate / trip",
            value: formatINR(pricing.rateAvg),
            sub: "Last 12 months",
            accent: Theme.chartSeries1,
          },
          {
            id: "p-stddev",
            label: "Rate stddev",
            value: formatINR(pricing.rateStddev),
            sub: `CV ${pricing.cv}`,
            accent:
              pricing.cv <= 0.1
                ? Theme.chartSeries2
                : pricing.cv <= 0.3
                  ? Theme.chartSeries3
                  : Theme.chartSeries4,
          },
          {
            id: "p-stability",
            label: "Stability score",
            value: `${pricing.stabilityScore}`,
            sub: pricing.stabilityScore >= 80 ? "Predictable" : "Volatile",
            accent:
              pricing.stabilityScore >= 80
                ? Theme.chartSeries2
                : pricing.stabilityScore >= 50
                  ? Theme.chartSeries3
                  : Theme.chartSeries4,
          },
          {
            id: "p-perkm-avg",
            label: "Avg rate / km",
            value: `₹${pricing.perKmAvg.toFixed(2)}`,
            sub: "Across all trips",
            accent: Theme.chartSeries5,
          },
          {
            id: "p-perkm-sd",
            label: "Per-km stddev",
            value: `₹${pricing.perKmStddev.toFixed(2)}`,
            sub: "Spread",
            accent: Theme.chartSeries6,
          },
          {
            id: "p-lanes",
            label: "Active lanes",
            value: `${pricing.lanes.length}`,
            sub: "Repeat-trip routes",
            accent: Theme.chartSeries3,
          },
        ]}
      />

      <ChartCard
        title="Top lanes — average supplier rate"
        subtitle="Bar colour reflects pricing volatility (CV)"
      >
        {pricing.lanes.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              Not enough repeat trips for lane-level pricing analysis
            </Text>
          </View>
        ) : (
          <HBarChart
            width={chartWidth}
            items={pricing.lanes.map((l) => ({
              id: l.id,
              label: l.label,
              value: l.avgRate,
              // hue: lower CV is healthier — invert so 0 CV → high "positive"
              hue: Math.max(0, 30 - l.cv * 100),
              display: formatINRChip(l.avgRate),
            }))}
            hueThresholds={{ positive: 20, neutral: 10 }}
            labelWidth={120}
            valueWidth={64}
            formatValue={(v) => formatINRChip(v)}
          />
        )}
      </ChartCard>

      {/* 6. Insights */}
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
    case "preferred": return "Preferred vendor";
    case "high_risk": return "High risk";
    case "reliable": return "Reliable";
    case "low_quality": return "Low quality";
    case "best_value": return "Best value";
    case "frequent_canceller": return "Cancels often";
    default: return b;
  }
}

function badgeTone(
  b: string,
): "excellent" | "good" | "warning" | "critical" | "info" {
  switch (b) {
    case "preferred":
      return "excellent";
    case "reliable":
    case "best_value":
      return "good";
    case "low_quality":
    case "frequent_canceller":
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
    paddingVertical: 12,
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
  empty: {
    paddingVertical: 24,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 12,
    color: Theme.textMuted,
    textAlign: "center",
    paddingHorizontal: 16,
  },
  insights: {
    gap: 8,
  },
});
