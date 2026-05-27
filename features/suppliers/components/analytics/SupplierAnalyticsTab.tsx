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
import { Text, View } from "react-native";

import { Theme } from "@/constants/Theme";
import { formatINR, formatINRChip } from "@/lib/format";

import {
  PulseAnalyticsShell,
  PulseChartPanel,
  PulseGaugePanel,
  PulseHealthRow,
  PulseHealthScorePanel,
  PulseInsightsPanel,
  PulseKpiGrid,
  PulseLaneBar,
  PulseSection,
  TrendBarChart,
  TrendLineChart,
  pulseStyles,
  usePulseChartWidth,
  type PulseKpiItem,
  type TrendPoint,
} from "@/components/analytics";

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

function toPayableLine(months: readonly SupplierMonthlyTrendPoint[]): TrendPoint[] {
  return months.map((m) => ({
    label: m.label,
    revenue: m.payable,
    expense: 0,
    profit: 0,
    margin: 0,
    tripCount: m.trips,
  }));
}

function toMarginLine(months: readonly SupplierMonthlyTrendPoint[]): TrendPoint[] {
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
): TrendPoint[] {
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
  const chartWidth = usePulseChartWidth();
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

  const maxLaneRate = pricing.lanes.length
    ? Math.max(...pricing.lanes.map((l) => l.avgRate))
    : 1

  const headerKpiRows = useMemo(
    (): ReadonlyArray<ReadonlyArray<PulseKpiItem | null>> => [
      [
        {
          id: "trips",
          label: "Trips executed",
          value: `${kpis.tripsExecuted}`,
          subtext: `${operations.completionPct.toFixed(0)}% completion`,
          valueColor: Theme.primary,
          iconName: "truck",
        },
        {
          id: "revenue",
          label: "Revenue handled",
          value: formatINR(kpis.revenueHandled),
          subtext: "Last 12 months",
          valueColor: Theme.textBody,
          iconName: "money",
        },
        {
          id: "margin",
          label: "Margin contribution",
          value: formatINR(kpis.marginContribution),
          subtext: `${kpis.marginContributionPct.toFixed(1)}% margin`,
          valueColor:
            kpis.marginContribution >= 0 ? Theme.positive : Theme.negative,
          iconName: "line-chart",
        },
        {
          id: "outstanding",
          label: "Payable outstanding",
          value: formatINR(kpis.outstanding),
          subtext: `Avg ${financial.avgSettlementDays}d settlement`,
          valueColor: Theme.negative,
          iconName: "exclamation-circle",
        },
      ],
      [
        {
          id: "ontime",
          label: "On-time availability",
          value: `${kpis.onTimePct}%`,
          subtext: `${operations.onTime}/${operations.onTimeEligible} trips`,
          valueColor:
            kpis.onTimePct >= 85
              ? Theme.positive
              : kpis.onTimePct >= 60
                ? Theme.warning
                : Theme.negative,
          iconName: "clock-o",
        },
        {
          id: "vehicle-quality",
          label: "Vehicle quality",
          value: `${kpis.vehicleQualityScore}`,
          subtext: "Completion + on-time blend",
          valueColor:
            kpis.vehicleQualityScore >= 85
              ? Theme.positive
              : kpis.vehicleQualityScore >= 60
                ? Theme.warning
                : Theme.negative,
          iconName: "star",
        },
        {
          id: "cancellation",
          label: "Cancellation",
          value: `${kpis.cancellationRatePct.toFixed(1)}%`,
          subtext: `${operations.tripsCancelled} cancelled`,
          valueColor:
            kpis.cancellationRatePct >= 10 ? Theme.negative : Theme.warning,
          iconName: "times-circle",
        },
        {
          id: "reliability",
          label: "Reliability score",
          value: `${kpis.reliabilityScore}`,
          subtext: score ? "Composite 0-100" : "Insufficient data",
          valueColor:
            kpis.reliabilityScore >= 80
              ? Theme.positive
              : kpis.reliabilityScore >= 60
                ? Theme.warning
                : Theme.negative,
          iconName: "shield",
        },
      ],
    ],
    [kpis, operations, financial, score],
  )

  const opsKpiRows = useMemo(
    (): ReadonlyArray<ReadonlyArray<PulseKpiItem | null>> => [
      [
        {
          id: "o-accept",
          label: "Acceptance",
          value: `${operations.acceptancePct.toFixed(0)}%`,
          subtext: "Trips not declined/cancelled",
          valueColor:
            operations.acceptancePct >= 90
              ? Theme.positive
              : operations.acceptancePct >= 70
                ? Theme.warning
                : Theme.negative,
          iconName: "check",
        },
        {
          id: "o-completion",
          label: "Completion",
          value: `${operations.completionPct.toFixed(0)}%`,
          subtext: `${operations.tripsCompleted}/${operations.tripsTotal}`,
          valueColor: Theme.positive,
          iconName: "check-circle",
        },
        {
          id: "o-ontime",
          label: "On-time",
          value: `${operations.onTimePct}%`,
          subtext: `${operations.onTime}/${operations.onTimeEligible}`,
          valueColor:
            operations.onTimePct >= 85
              ? Theme.positive
              : operations.onTimePct >= 60
                ? Theme.warning
                : Theme.negative,
          iconName: "clock-o",
        },
        null,
      ],
      [
        {
          id: "o-cancel",
          label: "Cancellations",
          value: `${operations.tripsCancelled}`,
          subtext: `${operations.cancellationPct.toFixed(1)}% of total`,
          valueColor: Theme.negative,
          iconName: "ban",
        },
        {
          id: "o-disputes",
          label: "Disputes",
          value: `${operations.disputeCount}`,
          subtext: "Flagged trips",
          valueColor:
            operations.disputeCount > 0 ? Theme.negative : Theme.positive,
          iconName: "flag",
        },
        {
          id: "o-turnaround",
          label: "Turnaround",
          value: `${operations.averageTurnaroundDays}d`,
          subtext: "Pickup → complete",
          valueColor: Theme.primary,
          iconName: "refresh",
        },
        null,
      ],
    ],
    [operations],
  )

  const financialKpiRows = useMemo(
    (): ReadonlyArray<ReadonlyArray<PulseKpiItem | null>> => [
      [
        {
          id: "f-payable",
          label: "Total payable",
          value: formatINR(financial.payable),
          subtext: "Last 12 months",
          valueColor: Theme.negative,
          iconName: "credit-card",
        },
        {
          id: "f-paid",
          label: "Paid out",
          value: formatINR(financial.paid),
          subtext: "Settled to date",
          valueColor: Theme.positive,
          iconName: "money",
        },
        {
          id: "f-outstanding",
          label: "Outstanding",
          value: formatINR(financial.outstanding),
          subtext:
            financial.payable > 0
              ? `${((financial.outstanding / financial.payable) * 100).toFixed(0)}% of payable`
              : "—",
          valueColor:
            financial.outstanding > 0 ? Theme.negative : Theme.positive,
          iconName: "exclamation-circle",
        },
        null,
      ],
      [
        {
          id: "f-advance",
          label: "Advances paid",
          value: formatINR(financial.advancesPaid),
          subtext: "Pre-payment usage",
          valueColor: Theme.warning,
          iconName: "arrow-up",
        },
        {
          id: "f-settlement",
          label: "Settlement",
          value: `${financial.avgSettlementDays}d`,
          subtext: "Pickup → payment avg",
          valueColor:
            financial.avgSettlementDays <= 7
              ? Theme.positive
              : financial.avgSettlementDays <= 30
                ? Theme.warning
                : Theme.negative,
          iconName: "clock-o",
        },
        {
          id: "f-margin",
          label: "Margin %",
          value: `${kpis.marginContributionPct.toFixed(1)}%`,
          subtext: `${formatINRChip(financial.contractProfitability)} contract`,
          valueColor:
            kpis.marginContributionPct >= 15
              ? Theme.positive
              : kpis.marginContributionPct >= 5
                ? Theme.warning
                : Theme.negative,
          iconName: "percent",
        },
        null,
      ],
    ],
    [financial, kpis],
  )

  const pricingKpiRows = useMemo(
    (): ReadonlyArray<ReadonlyArray<PulseKpiItem | null>> => [
      [
        {
          id: "p-avg",
          label: "Avg rate / trip",
          value: formatINR(pricing.rateAvg),
          subtext: "Last 12 months",
          valueColor: Theme.primary,
          iconName: "money",
        },
        {
          id: "p-stddev",
          label: "Rate stddev",
          value: formatINR(pricing.rateStddev),
          subtext: `CV ${pricing.cv}`,
          valueColor:
            pricing.cv <= 0.1
              ? Theme.positive
              : pricing.cv <= 0.3
                ? Theme.warning
                : Theme.negative,
          iconName: "bar-chart",
        },
        {
          id: "p-stability",
          label: "Stability score",
          value: `${pricing.stabilityScore}`,
          subtext: pricing.stabilityScore >= 80 ? "Predictable" : "Volatile",
          valueColor:
            pricing.stabilityScore >= 80
              ? Theme.positive
              : pricing.stabilityScore >= 50
                ? Theme.warning
                : Theme.negative,
          iconName: "shield",
        },
        null,
      ],
      [
        {
          id: "p-perkm-avg",
          label: "Avg rate / km",
          value: `₹${pricing.perKmAvg.toFixed(2)}`,
          subtext: "Across all trips",
          valueColor: Theme.textBody,
          iconName: "road",
        },
        {
          id: "p-perkm-sd",
          label: "Per-km stddev",
          value: `₹${pricing.perKmStddev.toFixed(2)}`,
          subtext: "Spread",
          valueColor: Theme.textBody,
          iconName: "line-chart",
        },
        {
          id: "p-lanes",
          label: "Active lanes",
          value: `${pricing.lanes.length}`,
          subtext: "Repeat-trip routes",
          valueColor: Theme.warning,
          iconName: "map",
        },
        null,
      ],
    ],
    [pricing],
  )

  const healthBars = score
    ? [
        { label: "Completion", percent: score.completionScore },
        { label: "On-time", percent: score.onTimeScore, color: Theme.positive },
        {
          label: "Cancellation",
          percent: score.cancellationScore,
          color: score.cancellationScore < 50 ? Theme.negative : Theme.primary,
        },
        { label: "Availability", percent: score.availabilityScore },
        { label: "Pricing", percent: score.pricingScore },
      ]
    : []

  const primaryBadge = badges[0] ? badgeLabel(badges[0]) : undefined

  return (
    <PulseAnalyticsShell
      title="Supplier reliability"
      subtitle="Composite score across completion, on-time, cancellation, availability, pricing"
    >
      <PulseKpiGrid rows={headerKpiRows} />

      <PulseSection
        title="Reliability score"
        subtitle="Composite 0-100 across completion, on-time, cancellation, availability, pricing"
      >
        <PulseHealthRow
          score={
            score ? (
              <PulseHealthScorePanel
                title="Reliability score"
                score={Math.round(score.score)}
                level={score.level}
                caption={`${score.breakdown.tripsTotal} trips · last 6 months`}
                badgeLabel={primaryBadge}
                bars={healthBars}
              />
            ) : (
              <PulseHealthScorePanel
                title="Reliability score"
                score={0}
                level="unknown"
                caption="Not enough trip history yet"
                bars={[]}
              />
            )
          }
          gauge={
            <PulseGaugePanel
              value={kpis.onTimePct}
              level={scoreLevelFromValue(kpis.onTimePct)}
              label="On-time availability"
              caption={`${operations.onTime}/${operations.onTimeEligible} eligible trips`}
            />
          }
        />
      </PulseSection>

      <PulseSection
        title="Operational intelligence"
        subtitle="Trip lifecycle quality — acceptance, completion, cancellation, disputes"
      >
        <PulseKpiGrid rows={opsKpiRows} />
        <PulseChartPanel title="On-time delivery trend" subtitle="Monthly on-time %">
          <TrendLineChart
            data={monthly.map((m) => ({
              label: m.label,
              revenue: m.onTimePct,
              expense: 0,
              profit: 0,
              margin: 0,
              tripCount: m.trips,
            }))}
            width={chartWidth}
            height={168}
            field="revenue"
            color={Theme.chartSeries2}
            gradientId="supplierOnTimeTrend"
          />
        </PulseChartPanel>
      </PulseSection>

      <PulseSection
        title="Financial intelligence"
        subtitle="Payable trend, settlement velocity, margin contribution"
      >
        <PulseKpiGrid rows={financialKpiRows} />
        <PulseChartPanel
          title="Payable trend"
          subtitle="Total supplier payable per month"
        >
          <TrendLineChart
            data={toPayableLine(monthly)}
            width={chartWidth}
            height={168}
            field="revenue"
            color={Theme.chartSeries4}
            gradientId="supplierPayableTrend"
          />
        </PulseChartPanel>
        <PulseChartPanel
          title="Paid vs outstanding"
          subtitle="Green = settled, red = still payable per month"
        >
          <TrendBarChart data={toPaidVsOutstanding(monthly)} width={chartWidth} height={168} />
        </PulseChartPanel>
        <PulseChartPanel
          title="Margin contribution"
          subtitle="Net margin you earn on this supplier per month"
        >
          <TrendLineChart
            data={toMarginLine(monthly)}
            width={chartWidth}
            height={168}
            field="revenue"
            color={Theme.chartSeries2}
            gradientId="supplierMarginTrend"
          />
        </PulseChartPanel>
      </PulseSection>

      <PulseSection
        title="Pricing stability"
        subtitle="Lower variance = predictable cost-to-serve"
      >
        <PulseKpiGrid rows={pricingKpiRows} />
        <PulseChartPanel
          title="Top lanes — average supplier rate"
          subtitle="Bar colour reflects pricing volatility (CV)"
        >
          {pricing.lanes.length === 0 ? (
            <View style={pulseStyles.empty}>
              <Text style={pulseStyles.emptyText}>
                Not enough repeat trips for lane-level pricing analysis
              </Text>
            </View>
          ) : (
            pricing.lanes.map((l) => (
              <PulseLaneBar
                key={l.id}
                id={l.id}
                label={l.label}
                value={formatINRChip(l.avgRate)}
                percent={(l.avgRate / maxLaneRate) * 100}
                marginLabel={l.cv <= 0.1 ? "Stable" : undefined}
              />
            ))
          )}
        </PulseChartPanel>
      </PulseSection>

      {insights.length > 0 ? (
        <PulseInsightsPanel
          insights={insights.map((i) => ({
            message: i.message,
            tone: i.tone,
          }))}
        />
      ) : null}
    </PulseAnalyticsShell>
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
