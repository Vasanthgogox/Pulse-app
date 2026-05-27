/**
 * ClientAnalyticsTab — Client Performance Intelligence dashboard.
 * ============================================================================
 *
 * Drop-in tab rendered inside `<ClientDetailScreen>`. Answers the strategic
 * question: "Which customers are most profitable, operationally healthy,
 * and strategically valuable?"
 *
 * Sections:
 *   1. Header KPIs    — revenue, margin, trips, outstanding, growth …
 *   2. Health score   — composite 0-100 score + badges + payment risk meter
 *   3. Revenue        — monthly trend chart + lane breakdown bars
 *   4. Profitability  — margin %, profit/km, revenue/trip cards
 *   5. Payment        — aging buckets + delay heatmap (months × buckets)
 *   6. Operations     — on-time, completion, cancellation, disputes
 *   7. Insights       — auto-derived bullets
 *
 * All compute is pure & memoised — fed by trips + transactions already
 * loaded by the parent. Server score is fetched optionally; falls back
 * to the local TypeScript engine when unavailable.
 */

import { useMemo } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";

import { Theme } from "@/constants/Theme";
import { formatINR, formatINRChip } from "@/lib/format";

import {
  ChartCard,
  Heatmap,
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

import { useCustomerHealthScoreQuery } from "@/lib/queries/useAnalyticsQueries";

import {
  computeCustomerHealthScore,
  deriveCustomerBadges,
  scoreLevelFromValue,
  type CustomerHealthScore,
} from "@/features/analytics";

import type { ClientRow } from "@/features/clients/services/clients.service";
import type { LedgerRow } from "@/features/finance";
import type { TripRow } from "@/features/trips/services/trips.service";

import {
  AGING_BUCKETS,
  computeClientKpiHeader,
  computeClientMonthlyTrend,
  computeClientOperationalMetrics,
  computeLaneBreakdown,
  computeLoadTypeBreakdown,
  computePaymentAging,
  computePaymentDelayHeatmap,
  computeProfitabilityMetrics,
  deriveClientInsights,
  type ClientMonthlyTrendPoint,
} from "./clientAnalyticsUtils";

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  client: ClientRow | null;
  trips: TripRow[];
  transactions: LedgerRow[];
  orgId: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Chart projections — adapt our monthly trend onto the existing
// `PeriodPoint` shape that `<LineChart>` and `<RevExpBarChart>` expect.
// ─────────────────────────────────────────────────────────────────────────────

interface ChartPoint {
  label: string;
  revenue: number;
  expense: number;
  profit: number;
  margin: number;
  tripCount: number;
}

function toRevenuePoints(months: readonly ClientMonthlyTrendPoint[]): ChartPoint[] {
  return months.map((m) => ({
    label: m.label,
    revenue: m.revenue,
    expense: 0,
    profit: 0,
    margin: 0,
    tripCount: m.trips,
  }));
}

function toMarginLinePoints(
  months: readonly ClientMonthlyTrendPoint[],
): ChartPoint[] {
  return months.map((m) => ({
    label: m.label,
    revenue: m.margin,
    expense: 0,
    profit: 0,
    margin: m.marginPct,
    tripCount: m.trips,
  }));
}

function toCollectionBars(
  months: readonly ClientMonthlyTrendPoint[],
): ChartPoint[] {
  return months.map((m) => ({
    label: m.label,
    revenue: m.collected,
    expense: m.outstanding,
    profit: 0,
    margin: 0,
    tripCount: m.trips,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab
// ─────────────────────────────────────────────────────────────────────────────

export default function ClientAnalyticsTab({
  client,
  trips,
  transactions,
  orgId,
}: Props) {
  const { width } = useWindowDimensions();
  const chartWidth = Math.max(280, Math.min(width - 64, 720));
  const clientId = client?.id ?? null;

  // ── Compute everything once, memoised on input arrays ──
  const kpis = useMemo(
    () => computeClientKpiHeader(trips, transactions),
    [trips, transactions],
  );
  const monthly = useMemo(
    () => computeClientMonthlyTrend(trips, transactions, { monthsBack: 12 }),
    [trips, transactions],
  );
  const lanes = useMemo(
    () => computeLaneBreakdown(trips, { topN: 5 }),
    [trips],
  );
  const loadTypes = useMemo(
    () => computeLoadTypeBreakdown(trips, { topN: 5 }),
    [trips],
  );
  const profitability = useMemo(
    () => computeProfitabilityMetrics(trips),
    [trips],
  );
  const aging = useMemo(
    () => computePaymentAging(trips, transactions),
    [trips, transactions],
  );
  const heatmap = useMemo(
    () =>
      computePaymentDelayHeatmap(trips, transactions, { monthsBack: 6 }),
    [trips, transactions],
  );
  const operations = useMemo(
    () => computeClientOperationalMetrics(trips, transactions),
    [trips, transactions],
  );

  // ── Server-side health score (cached 10 min) ──
  const { data: serverScore } = useCustomerHealthScoreQuery(orgId, clientId);

  // ── Fallback: compute client-side from already-loaded data ──
  const localScore: CustomerHealthScore | null = useMemo(() => {
    if (serverScore) return null;
    if (!clientId) return null;
    return computeCustomerHealthScore(
      clientId,
      trips.map((t) => ({
        id: t.id,
        client_id: t.client_id,
        client_price: Number(t.client_price ?? 0),
        margin: Number(t.margin ?? 0),
        status: t.status,
        pickup_date: t.pickup_date,
        created_at: t.created_at,
      })),
      transactions.map((tx) => ({
        trip_id: tx.trip_id,
        amount_in: Number(tx.amount_in ?? 0),
        transaction_date: tx.transaction_date ?? null,
        created_at: tx.created_at ?? null,
      })),
    );
  }, [serverScore, clientId, trips, transactions]);

  const healthScore = serverScore ?? localScore;
  const badges = useMemo(() => deriveCustomerBadges(healthScore), [healthScore]);

  // ── Payment risk score from payment delay (inverse) ──
  const paymentRisk = useMemo(() => {
    if (!healthScore) {
      // Fallback: derive from avg delay.
      const delay = kpis.avgPaymentDelayDays;
      const v = delay <= 0 ? 100 : Math.max(0, 100 - delay * 1.5);
      return Math.round(v);
    }
    return healthScore.paymentScore;
  }, [healthScore, kpis.avgPaymentDelayDays]);

  // ── Auto insights ──
  const insights = useMemo(
    () => deriveClientInsights(monthly, kpis, operations, aging),
    [monthly, kpis, operations, aging],
  );

  // ── Heatmap rows = visible months ──
  const heatmapRows = useMemo(
    () =>
      Array.from(new Set(heatmap.map((c) => c.rowId))).map((id) => ({
        id,
        label: monthLabelFromKey(id),
      })),
    [heatmap],
  );
  const heatmapColumns = useMemo(
    () => AGING_BUCKETS.map((b) => ({ id: b.id, label: b.label })),
    [],
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
            id: "revenue",
            label: "Total revenue",
            value: formatINR(kpis.totalRevenue),
            sub: `${kpis.tripCount} trips · 12 mo`,
            accent: Theme.chartSeries1,
          },
          {
            id: "margin",
            label: "Net margin",
            value: formatINR(kpis.netMargin),
            sub: `${kpis.marginPct.toFixed(1)}% margin`,
            accent: kpis.netMargin >= 0 ? Theme.chartSeries2 : Theme.chartSeries4,
          },
          {
            id: "outstanding",
            label: "Outstanding",
            value: formatINR(kpis.outstanding),
            sub: `Avg delay ${kpis.avgPaymentDelayDays}d`,
            accent:
              kpis.outstanding > 0 ? Theme.chartSeries4 : Theme.chartSeries2,
            alert: kpis.outstanding > 0 && kpis.avgPaymentDelayDays >= 45,
          },
          {
            id: "growth",
            label: "Business growth",
            value: `${kpis.businessGrowthPct >= 0 ? "+" : ""}${kpis.businessGrowthPct.toFixed(0)}%`,
            sub: "Last 6 mo vs prior",
            accent:
              kpis.businessGrowthPct >= 0
                ? Theme.chartSeries2
                : Theme.chartSeries4,
            delta:
              kpis.businessGrowthPct === 0
                ? undefined
                : {
                    label: `${Math.abs(kpis.businessGrowthPct).toFixed(0)}% YoY`,
                    direction: kpis.businessGrowthPct >= 0 ? "up" : "down",
                  },
          },
          {
            id: "trips",
            label: "Trips completed",
            value: `${operations.tripsCompleted}`,
            sub: `${operations.completionPct.toFixed(0)}% completion`,
            accent: Theme.chartSeries5,
          },
          {
            id: "active-routes",
            label: "Active routes",
            value: `${kpis.activeRoutes}`,
            sub: "Unique lanes",
            accent: Theme.chartSeries6,
          },
          {
            id: "profitability",
            label: "Profitability",
            value: `${kpis.profitabilityPct.toFixed(1)}%`,
            sub: "Margin contribution",
            accent:
              kpis.profitabilityPct >= 15
                ? Theme.chartSeries2
                : kpis.profitabilityPct >= 5
                  ? Theme.chartSeries3
                  : Theme.chartSeries4,
          },
          {
            id: "on-time",
            label: "On-time delivery",
            value: `${operations.onTimePct}%`,
            sub: `${operations.onTime}/${operations.onTimeEligible} trips`,
            accent:
              operations.onTimePct >= 85
                ? Theme.chartSeries2
                : operations.onTimePct >= 60
                  ? Theme.chartSeries3
                  : Theme.chartSeries4,
          },
        ]}
      />

      {/* 2. Customer Health Score */}
      <SectionHeader
        title="Customer health"
        subtitle="Composite 0-100 score across profitability, payments, ops, consistency, growth"
      />
      <View style={styles.scoreRow}>
        <View style={styles.scoreCol}>
          {healthScore ? (
            <ScoreCard
              title="Health score"
              score={Math.round(healthScore.score)}
              level={healthScore.level}
              caption={`${healthScore.breakdown.tripsTotal} trips · last 6 months`}
              subScores={[
                {
                  label: "Profitability",
                  value: Math.round(healthScore.profitabilityScore),
                },
                {
                  label: "Payment",
                  value: Math.round(healthScore.paymentScore),
                },
                {
                  label: "Operations",
                  value: Math.round(healthScore.operationsScore),
                },
                {
                  label: "Consistency",
                  value: Math.round(healthScore.consistencyScore),
                },
                {
                  label: "Growth",
                  value: Math.round(healthScore.growthScore),
                },
              ]}
              badges={badges.map((b) => ({
                label: badgeLabel(b),
                tone: badgeTone(b),
              }))}
            />
          ) : (
            <ScoreCard
              title="Health score"
              score={0}
              level="unknown"
              caption="Not enough trip history yet"
            />
          )}
        </View>
        <View style={styles.scoreCol}>
          <View style={styles.meterCard}>
            <RiskMeter
              value={paymentRisk}
              level={scoreLevelFromValue(paymentRisk)}
              label="Payment risk"
              caption={
                kpis.avgPaymentDelayDays > 0
                  ? `${kpis.avgPaymentDelayDays}d average delay`
                  : "No delay history"
              }
              size={150}
              stroke={14}
            />
          </View>
        </View>
      </View>

      {/* 3. Revenue Intelligence */}
      <SectionHeader
        title="Revenue intelligence"
        subtitle="Monthly revenue + top contributing lanes & load types"
      />
      <ChartCard
        title="Monthly revenue trend"
        subtitle={`${monthly.length} months · ${formatINRChip(
          monthly.reduce((s, m) => s + m.revenue, 0),
        )} total`}
      >
        <LineChart
          data={toRevenuePoints(monthly)}
          width={chartWidth}
          height={160}
          field="revenue"
          color={Theme.chartSeries1}
          gradientId="clientRevTrend"
        />
      </ChartCard>

      <ChartCard
        title="Top lanes by revenue"
        subtitle="Last 12 months · margin % drives the bar colour"
      >
        {lanes.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No lane data yet</Text>
          </View>
        ) : (
          <HBarChart
            width={chartWidth}
            items={lanes.map((l) => ({
              id: l.id,
              label: l.label,
              value: l.revenue,
              hue: l.marginPct,
              display: formatINRChip(l.revenue),
            }))}
            hueThresholds={{ positive: 15, neutral: 5 }}
            labelWidth={120}
            valueWidth={64}
            formatValue={(v) => formatINRChip(v)}
          />
        )}
      </ChartCard>

      <ChartCard
        title="Top load types by revenue"
        subtitle="Last 12 months"
      >
        {loadTypes.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No load-type data yet</Text>
          </View>
        ) : (
          <HBarChart
            width={chartWidth}
            items={loadTypes.map((l) => ({
              id: l.id,
              label: l.label,
              value: l.revenue,
              display: formatINRChip(l.revenue),
            }))}
            labelWidth={120}
            valueWidth={64}
            formatValue={(v) => formatINRChip(v)}
          />
        )}
      </ChartCard>

      {/* 4. Profitability Intelligence */}
      <SectionHeader
        title="Profitability intelligence"
        subtitle="True margin after supplier cost, distance, and per-trip yield"
      />
      <KPIHeader
        columns={3}
        cards={[
          {
            id: "p-rev",
            label: "Revenue",
            value: formatINR(profitability.revenue),
            sub: `${profitability.tripsCount} trips`,
            accent: Theme.chartSeries1,
          },
          {
            id: "p-cost",
            label: "Supplier cost",
            value: formatINR(profitability.cost),
            sub: "Direct cost-to-serve",
            accent: Theme.chartSeries4,
          },
          {
            id: "p-margin",
            label: "Net margin",
            value: formatINR(profitability.netMargin),
            sub: `${profitability.marginPct}% margin`,
            accent:
              profitability.netMargin >= 0
                ? Theme.chartSeries2
                : Theme.chartSeries4,
          },
          {
            id: "p-per-trip",
            label: "Revenue / trip",
            value: formatINR(profitability.revenuePerTrip),
            sub: "Per shipment average",
            accent: Theme.chartSeries5,
          },
          {
            id: "p-per-km",
            label: "Profit / km",
            value: `₹${profitability.profitPerKm.toFixed(2)}`,
            sub: `${Math.round(profitability.totalKm).toLocaleString("en-IN")} km`,
            accent: Theme.chartSeries6,
          },
          {
            id: "p-margin-pct",
            label: "Margin %",
            value: `${profitability.marginPct.toFixed(1)}%`,
            sub: "Last 12 months",
            accent:
              profitability.marginPct >= 15
                ? Theme.chartSeries2
                : profitability.marginPct >= 5
                  ? Theme.chartSeries3
                  : Theme.chartSeries4,
          },
        ]}
      />

      <ChartCard
        title="Margin contribution trend"
        subtitle="Monthly net margin in ₹"
      >
        <LineChart
          data={toMarginLinePoints(monthly)}
          width={chartWidth}
          height={140}
          field="revenue"
          color={Theme.chartSeries2}
          gradientId="clientMarginTrend"
        />
      </ChartCard>

      {/* 5. Payment Behaviour Intelligence */}
      <SectionHeader
        title="Payment behaviour"
        subtitle="Aging buckets, collection trend, and overdue heatmap"
      />
      <KPIHeader
        columns={4}
        cards={[
          {
            id: "a-0-30",
            label: "0-30 days",
            value: formatINR(aging.bucket0_30),
            sub: "Current",
            accent: Theme.heatmapNoticeFg,
          },
          {
            id: "a-31-60",
            label: "31-60 days",
            value: formatINR(aging.bucket31_60),
            sub: "Watchlist",
            accent: Theme.heatmapWarningFg,
            alert: aging.bucket31_60 > 0,
          },
          {
            id: "a-61-90",
            label: "61-90 days",
            value: formatINR(aging.bucket61_90),
            sub: "At risk",
            accent: Theme.heatmapCriticalFg,
            alert: aging.bucket61_90 > 0,
          },
          {
            id: "a-90+",
            label: "90+ days",
            value: formatINR(aging.bucket90Plus),
            sub: "Critical",
            accent: Theme.heatmapCriticalFg,
            alert: aging.bucket90Plus > 0,
          },
        ]}
      />

      <ChartCard
        title="Collection vs outstanding"
        subtitle="Green = collected, red = still outstanding per month"
      >
        <RevExpBarChart
          data={toCollectionBars(monthly)}
          width={chartWidth}
          height={160}
        />
      </ChartCard>

      {heatmapRows.length > 0 ? (
        <ChartCard
          title="Aging heatmap"
          subtitle="Outstanding ₹ by month and bucket — darker = larger amount"
        >
          <Heatmap
            rows={heatmapRows}
            columns={heatmapColumns}
            cells={heatmap}
            cellWidth={64}
            cellHeight={36}
          />
        </ChartCard>
      ) : null}

      {/* 6. Operational Intelligence */}
      <SectionHeader
        title="Operational intelligence"
        subtitle="On-time, completion, cancellation, and dispute signal"
      />
      <KPIHeader
        columns={3}
        cards={[
          {
            id: "o-total",
            label: "Trips total",
            value: `${operations.tripsTotal}`,
            sub: "Last 12 months",
            accent: Theme.chartSeries1,
          },
          {
            id: "o-completion",
            label: "Completion",
            value: `${operations.completionPct.toFixed(0)}%`,
            sub: `${operations.tripsCompleted} completed`,
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
            value: `${operations.disputedCount}`,
            sub: "Flagged trips",
            accent:
              operations.disputedCount > 0
                ? Theme.chartSeries4
                : Theme.chartSeries2,
            alert: operations.disputedCount >= 3,
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

      {/* 7. Insights */}
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
// Small helpers
// ─────────────────────────────────────────────────────────────────────────────

const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function monthLabelFromKey(key: string): string {
  const idx = parseInt(key.slice(5, 7), 10) - 1;
  return MONTH_SHORT[idx] ?? key.slice(5, 7);
}

function badgeLabel(b: string): string {
  switch (b) {
    case "premium": return "Premium client";
    case "high_risk": return "High risk";
    case "fast_paying": return "Fast paying";
    case "high_margin": return "High margin";
    case "strategic": return "Strategic account";
    case "growing": return "Growing";
    case "declining": return "Declining";
    default: return b;
  }
}

function badgeTone(
  b: string,
): "excellent" | "good" | "warning" | "critical" | "info" {
  switch (b) {
    case "premium":
    case "strategic":
      return "excellent";
    case "fast_paying":
    case "high_margin":
    case "growing":
      return "good";
    case "declining":
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
  },
  insights: {
    gap: 8,
  },
});
