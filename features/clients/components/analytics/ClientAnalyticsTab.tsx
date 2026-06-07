/**
 * ClientAnalyticsTab — Client Performance Intelligence (Pulse layout).
 */

import { useMemo } from "react";
import { Text, useWindowDimensions, View } from "react-native";

import { Theme } from "@/constants/Theme";
import { formatINR, formatINRChip } from "@/lib/format";

import { usePartyAnalyticsInsetStyle } from "@/components/analytics/partyAnalyticsLayout";
import {
  Heatmap,
  TrendBarChart,
  TrendLineChart,
  PulseAnalyticsShell,
  PulseChartPanel,
  PulseGaugePanel,
  PulseHealthRow,
  PulseHealthScorePanel,
  PulseInsightsPanel,
  PulseKpiGrid,
  PulseLaneBar,
  PulsePanelGrid,
  PulseSection,
  pulseStyles,
  pulseChartHeight,
  usePulseChartWidth,
  type PulseKpiItem,
  type TrendPoint,
} from "@/components/analytics";

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

interface Props {
  client: ClientRow | null;
  trips: TripRow[];
  transactions: LedgerRow[];
  orgId: string | null;
}

function toRevenuePoints(months: readonly ClientMonthlyTrendPoint[]): TrendPoint[] {
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
): TrendPoint[] {
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
): TrendPoint[] {
  return months.map((m) => ({
    label: m.label,
    revenue: m.collected,
    expense: m.outstanding,
    profit: 0,
    margin: 0,
    tripCount: m.trips,
  }));
}

export default function ClientAnalyticsTab({
  client,
  trips,
  transactions,
  orgId,
}: Props) {
  const { width } = useWindowDimensions();
  const insetStyle = usePartyAnalyticsInsetStyle();
  const chartWidth = usePulseChartWidth({ embedded: true });
  const chartWidthHalf = usePulseChartWidth({ embedded: true, columns: 2 });
  const chartH = pulseChartHeight(width, true);
  const clientId = client?.id ?? null;

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

  const { data: serverScore } = useCustomerHealthScoreQuery(orgId, clientId);

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

  const paymentRisk = useMemo(() => {
    if (!healthScore) {
      const delay = kpis.avgPaymentDelayDays;
      const v = delay <= 0 ? 100 : Math.max(0, 100 - delay * 1.5);
      return Math.round(v);
    }
    return healthScore.paymentScore;
  }, [healthScore, kpis.avgPaymentDelayDays]);

  const insights = useMemo(
    () => deriveClientInsights(monthly, kpis, operations, aging),
    [monthly, kpis, operations, aging],
  );

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

  const monthlyRevenueTotal = monthly.reduce((s, m) => s + m.revenue, 0);
  const maxLaneRevenue = lanes.length
    ? Math.max(...lanes.map((l) => l.revenue))
    : 1;
  const maxLoadRevenue = loadTypes.length
    ? Math.max(...loadTypes.map((l) => l.revenue))
    : 1;

  const collectionPct = useMemo(() => {
    const billed = kpis.totalRevenue;
    const received = billed - kpis.outstanding;
    return billed > 0 ? Math.min(100, Math.round((received / billed) * 100)) : 0;
  }, [kpis.outstanding, kpis.totalRevenue]);

  const headerKpiRows = useMemo(
    (): ReadonlyArray<ReadonlyArray<PulseKpiItem | null>> => [
      [
        {
          id: "pnl",
          label: "Trip P&L",
          value: formatINRChip(kpis.netMargin),
          subtext: `${kpis.marginPct.toFixed(1)}% on sales`,
          valueColor:
            kpis.netMargin >= 0 ? Theme.positive : Theme.negative,
          iconName: "line-chart",
        },
        {
          id: "collection",
          label: "Collection rate",
          value: `${collectionPct}%`,
          subtext: "Received vs billed",
          valueColor:
            collectionPct >= 80
              ? Theme.positive
              : collectionPct >= 50
                ? Theme.warning
                : Theme.negative,
          iconName: "percent",
        },
        {
          id: "trips",
          label: "Trips completed",
          value: `${operations.tripsCompleted}`,
          subtext: `${operations.completionPct.toFixed(0)}% completion`,
          valueColor: Theme.textBody,
          iconName: "truck",
        },
        {
          id: "on-time",
          label: "On-time delivery",
          value: `${operations.onTimePct}%`,
          subtext: `${operations.onTime}/${operations.onTimeEligible} trips`,
          valueColor:
            operations.onTimePct >= 85
              ? Theme.positive
              : operations.onTimePct >= 60
                ? Theme.warning
                : Theme.negative,
          iconName: "clock-o",
        },
      ],
    ],
    [collectionPct, kpis, operations],
  );

  const profitKpiRows = useMemo(
    (): ReadonlyArray<ReadonlyArray<PulseKpiItem | null>> => [
      [
        {
          id: "p-rev",
          label: "Revenue",
          value: formatINR(profitability.revenue),
          subtext: `${profitability.tripsCount} trips`,
          valueColor: Theme.primary,
          iconName: "money",
        },
        {
          id: "p-cost",
          label: "Supplier cost",
          value: formatINR(profitability.cost),
          subtext: "Direct cost-to-serve",
          valueColor: Theme.warning,
          iconName: "credit-card",
        },
        {
          id: "p-margin",
          label: "Net margin",
          value: formatINR(profitability.netMargin),
          subtext: `${profitability.marginPct}% margin`,
          valueColor:
            profitability.netMargin >= 0 ? Theme.positive : Theme.negative,
          iconName: "line-chart",
        },
        null,
      ],
      [
        {
          id: "p-per-trip",
          label: "Revenue / trip",
          value: formatINR(profitability.revenuePerTrip),
          subtext: "Per shipment average",
          valueColor: Theme.primary,
          iconName: "cube",
        },
        {
          id: "p-per-km",
          label: "Profit / km",
          value: `₹${profitability.profitPerKm.toFixed(2)}`,
          subtext: `${Math.round(profitability.totalKm).toLocaleString("en-IN")} km`,
          valueColor: Theme.textBody,
          iconName: "road",
        },
        {
          id: "p-margin-pct",
          label: "Margin %",
          value: `${profitability.marginPct.toFixed(1)}%`,
          subtext: "Last 12 months",
          valueColor:
            profitability.marginPct >= 15
              ? Theme.positive
              : profitability.marginPct >= 5
                ? Theme.warning
                : Theme.negative,
          iconName: "percent",
          trend: profitability.marginPct >= 15 ? 5 : undefined,
        },
        null,
      ],
    ],
    [profitability],
  );

  const agingKpiRows = useMemo(
    (): ReadonlyArray<ReadonlyArray<PulseKpiItem | null>> => [
      [
        {
          id: "a-0-30",
          label: "0-30 days",
          value: formatINR(aging.bucket0_30),
          subtext: "Current",
          valueColor: Theme.positive,
          iconName: "check-circle",
        },
        {
          id: "a-31-60",
          label: "31-60 days",
          value: formatINR(aging.bucket31_60),
          subtext: "Watchlist",
          valueColor: Theme.warning,
          iconName: "clock-o",
        },
        {
          id: "a-61-90",
          label: "61-90 days",
          value: formatINR(aging.bucket61_90),
          subtext: "At risk",
          valueColor: Theme.negative,
          iconName: "exclamation-triangle",
        },
        {
          id: "a-90+",
          label: "90+ days",
          value: formatINR(aging.bucket90Plus),
          subtext: "Critical",
          valueColor: "#991B1B",
          iconName: "ban",
        },
      ],
    ],
    [aging],
  );

  const opsKpiRows = useMemo(
    (): ReadonlyArray<ReadonlyArray<PulseKpiItem | null>> => [
      [
        {
          id: "o-total",
          label: "Trips total",
          value: `${operations.tripsTotal}`,
          subtext: "Last 12 months",
          valueColor: Theme.primary,
          iconName: "truck",
        },
        {
          id: "o-completion",
          label: "Completion",
          value: `${operations.completionPct.toFixed(0)}%`,
          subtext: `${operations.tripsCompleted} completed`,
          valueColor: Theme.positive,
          iconName: "check",
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
          iconName: "times-circle",
        },
        {
          id: "o-disputes",
          label: "Disputes",
          value: `${operations.disputedCount}`,
          subtext: "Flagged trips",
          valueColor:
            operations.disputedCount > 0 ? Theme.negative : Theme.positive,
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
  );

  const healthBars = healthScore
    ? [
        {
          label: "Profitability",
          percent: healthScore.profitabilityScore,
        },
        {
          label: "Payment",
          percent: healthScore.paymentScore,
        },
        {
          label: "Operations",
          percent: healthScore.operationsScore,
          color: Theme.positive,
        },
        {
          label: "Consistency",
          percent: healthScore.consistencyScore,
          color:
            healthScore.consistencyScore < 40
              ? Theme.negative
              : Theme.primary,
        },
        {
          label: "Growth",
          percent: healthScore.growthScore,
        },
      ]
    : [];

  const primaryBadge = badges[0] ? badgeLabel(badges[0]) : undefined;

  const collectedAmount = Math.max(0, kpis.totalRevenue - kpis.outstanding);

  const financialOverview = {
    primaryMetricLabel: "TOTAL SALES",
    primaryValue: formatINR(kpis.totalRevenue),
    leftLabel: "RECEIVED",
    leftValue: formatINR(collectedAmount),
    rightLabel: "DUE",
    rightValue: formatINR(kpis.outstanding),
    decorIcon: "building" as const,
  };

  return (
    <PulseAnalyticsShell
      title="Client finance analytics"
      subtitle={
        client?.name
          ? `${client.name} · billing, P&L, and receivables`
          : "Billing, P&L, and receivables for this client"
      }
      embedded
      financialOverview={financialOverview}
    >
      <View style={insetStyle}>
      <PulseKpiGrid rows={headerKpiRows} />

      <PulseSection
        title="Receivable health"
        subtitle="Collection risk and payment behaviour for this client"
      >
        <PulseHealthRow
          score={
            healthScore ? (
              <PulseHealthScorePanel
                score={Math.round(healthScore.score)}
                level={healthScore.level}
                caption={`${healthScore.breakdown.tripsTotal} trips · last 6 months`}
                badgeLabel={primaryBadge}
                bars={healthBars}
              />
            ) : (
              <PulseHealthScorePanel
                score={0}
                level="unknown"
                caption="Not enough trip history yet"
                bars={[]}
              />
            )
          }
          gauge={
            <PulseGaugePanel
              value={paymentRisk}
              level={scoreLevelFromValue(paymentRisk)}
              label="Payment risk"
              caption={
                kpis.avgPaymentDelayDays > 0
                  ? `${kpis.avgPaymentDelayDays}d average delay`
                  : "No delay history"
              }
            />
          }
        />
      </PulseSection>

      <PulseSection
        title="Revenue intelligence"
        subtitle="Monthly revenue + top contributing lanes & load types"
      >
        <PulseChartPanel
          title="Monthly revenue trend"
          subtitle={`${monthly.length} months · ${formatINRChip(monthlyRevenueTotal)} total`}
        >
          <TrendLineChart
            data={toRevenuePoints(monthly)}
            width={chartWidth}
            height={chartH}
            field="revenue"
            color={Theme.chartSeries1}
            gradientId="clientRevTrend"
          />
        </PulseChartPanel>

        <PulsePanelGrid>
          <PulseChartPanel
            title="Top lanes by revenue"
            subtitle="Last 12 months · margin % drives the bar colour"
          >
            {lanes.length === 0 ? (
              <View style={pulseStyles.empty}>
                <Text style={pulseStyles.emptyText}>No lane data yet</Text>
              </View>
            ) : (
              lanes.map((l) => (
                <PulseLaneBar
                  key={l.id}
                  id={l.id}
                  label={l.label}
                  value={formatINRChip(l.revenue)}
                  percent={(l.revenue / maxLaneRevenue) * 100}
                  marginLabel={
                    l.marginPct >= 15
                      ? `${Math.round(l.marginPct)}% margin`
                      : undefined
                  }
                />
              ))
            )}
          </PulseChartPanel>

          <PulseChartPanel
            title="Top load types by revenue"
            subtitle="Last 12 months"
          >
            {loadTypes.length === 0 ? (
              <View style={pulseStyles.empty}>
                <Text style={pulseStyles.emptyText}>No load-type data yet</Text>
              </View>
            ) : (
              loadTypes.map((l) => (
                <PulseLaneBar
                  key={l.id}
                  id={l.id}
                  label={l.label}
                  value={formatINRChip(l.revenue)}
                  percent={(l.revenue / maxLoadRevenue) * 100}
                />
              ))
            )}
          </PulseChartPanel>
        </PulsePanelGrid>
      </PulseSection>

      <PulseSection
        title="Profitability intelligence"
        subtitle="True margin after supplier cost, distance, and per-trip yield"
      >
        <PulseKpiGrid rows={profitKpiRows} />

        <PulseChartPanel
          title="Margin contribution trend"
          subtitle="Monthly net margin in ₹"
        >
          <TrendLineChart
            data={toMarginLinePoints(monthly)}
            width={chartWidth}
            height={chartH}
            field="revenue"
            color={Theme.chartSeries2}
            gradientId="clientMarginTrend"
          />
        </PulseChartPanel>
      </PulseSection>

      <PulseSection
        title="Payment behaviour"
        subtitle="Aging buckets, collection trend, and overdue heatmap"
      >
        <PulseKpiGrid rows={agingKpiRows} />

        <PulseChartPanel
          title="Collection vs outstanding"
          subtitle="Green = collected, red = still outstanding per month"
        >
          <TrendBarChart
            data={toCollectionBars(monthly)}
            width={chartWidthHalf}
            height={chartH}
            primaryField="revenue"
            secondaryField="expense"
            primaryColor={Theme.chartSeries2}
            secondaryColor={Theme.chartSeries4}
          />
        </PulseChartPanel>

        {heatmapRows.length > 0 ? (
          <PulseChartPanel
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
          </PulseChartPanel>
        ) : null}
      </PulseSection>

      <PulseSection
        title="Operational intelligence"
        subtitle="On-time, completion, cancellation, and dispute signal"
      >
        <PulseKpiGrid rows={opsKpiRows} />
      </PulseSection>

      {insights.length > 0 ? (
        <PulseInsightsPanel
          insights={insights.map((i) => ({
            message: i.message,
            tone: i.tone,
          }))}
        />
      ) : null}
      </View>
    </PulseAnalyticsShell>
  );
}

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
    case "premium":
      return "Premium client";
    case "high_risk":
      return "High risk";
    case "fast_paying":
      return "Fast paying";
    case "high_margin":
      return "High margin";
    case "strategic":
      return "Strategic account";
    case "growing":
      return "Growing";
    case "declining":
      return "Declining";
    default:
      return b.replace(/_/g, " ");
  }
}
