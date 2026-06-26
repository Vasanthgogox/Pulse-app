/**
 * Client finance analytics — responsive Metronic BI (Connection sales style).
 */
import { PartyAvatar } from "@/components/PartyAvatar";
import { RiskMeter } from "@/components/analytics/RiskMeter";
import { TrendBarChart, type TrendPoint } from "@/components/analytics";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { CLIENT_ANALYTICS_LOTTIE } from "@/features/clients/components/analytics/clientAnalyticsAssets";
import { ClientAnalyticsInsightRow } from "@/features/clients/components/analytics/ClientAnalyticsInsightRow";
import { ClientAnalyticsKpiLottie } from "@/features/clients/components/analytics/ClientAnalyticsKpiLottie";
import { ClientAnalyticsMobileTripCard } from "@/features/clients/components/analytics/ClientAnalyticsMobileTripCard";
import { clientFinanceAnalyticsStyles as clientStyles } from "@/features/clients/components/analytics/clientFinanceAnalytics.styles";
import {
  computeClientKpiHeader,
  computeClientMonthlyTrend,
  computeClientOperationalMetrics,
  computeLaneBreakdown,
  computeLoadTypeBreakdown,
  computePaymentAging,
  deriveClientInsights,
  type ClientMonthlyTrendPoint,
} from "@/features/clients/components/analytics/clientAnalyticsUtils";
import type { ClientRow } from "@/features/clients/services/clients.service";
import {
  computeCustomerHealthScore,
  deriveCustomerBadges,
  scoreLevelFromValue,
  type CustomerHealthScore,
} from "@/features/analytics";
import type { LedgerRow } from "@/features/finance";
import { NetworkDesktopSalesBarChart } from "@/features/network/components/desktop/NetworkDesktopSalesBarChart";
import { NetworkDesktopSalesDonut } from "@/features/network/components/desktop/NetworkDesktopSalesDonut";
import { NetworkDesktopSalesLineChart } from "@/features/network/components/desktop/NetworkDesktopSalesLineChart";
import {
  SalesTripLaneCell,
  SalesTripMoneyCell,
  SalesTripRefCell,
  SalesTripStatusCell,
} from "@/features/network/components/desktop/NetworkDesktopSalesTripTableCells";
import {
  METRONIC,
  networkDesktopHubStyles as styles,
} from "@/features/network/components/desktop/networkDesktopHub.styles";
import type {
  SalesBarItem,
  SalesSlice,
  SalesTripTableRow,
  SalesTrendPoint,
} from "@/features/network/utils/connectionSalesAnalytics.util";
import { useProfileHubCompactLayout } from "@/features/party/hooks/useProfileHubCompactLayout";
import type { TripRow } from "@/features/trips/services/trips.service";
import { getTripOperationalDisplay } from "@/features/operations/display";
import { formatINRChip } from "@/lib/format";
import { useCustomerHealthScoreQuery } from "@/lib/queries/useAnalyticsQueries";
import { Search } from "lucide-react-native";
import { useMemo, useState, type ReactNode } from "react";
import {
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";

export type ClientAnalyticsDateRange = "3m" | "6m" | "12m" | "all";

type Props = {
  client: ClientRow | null;
  trips: TripRow[];
  transactions: LedgerRow[];
  orgId: string | null;
};

const DATE_RANGES: { id: ClientAnalyticsDateRange; label: string }[] = [
  { id: "3m", label: "3 months" },
  { id: "6m", label: "6 months" },
  { id: "12m", label: "12 months" },
  { id: "all", label: "All time" },
];

const DONUT_COLORS = ["#3E97FF", "#50CD89", "#7239EA", "#FFC700", "#F1416C"];

function tripDate(t: TripRow): Date | null {
  const raw = t.pickup_date ?? t.created_at;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isFinite(d.getTime()) ? d : null;
}

function filterByDateRange<T extends TripRow | LedgerRow>(
  rows: T[],
  range: ClientAnalyticsDateRange,
  dateFn: (row: T) => Date | null,
): T[] {
  if (range === "all") return rows;
  const months = range === "3m" ? 3 : range === "6m" ? 6 : 12;
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  return rows.filter((row) => {
    const d = dateFn(row);
    return d != null && d >= cutoff;
  });
}

function laneChipLabel(lane: string): string {
  if (lane.length <= 24) return lane;
  return `${lane.slice(0, 22)}…`;
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

function toTrendPoints(months: readonly ClientMonthlyTrendPoint[]): SalesTrendPoint[] {
  return months.map((m) => ({
    monthKey: m.monthKey,
    label: m.label,
    trips: m.revenue,
    revenue: m.revenue,
  }));
}

function toRevenueLinePoints(
  months: readonly ClientMonthlyTrendPoint[],
): TrendPoint[] {
  return months.map((m) => ({
    label: m.label,
    revenue: m.revenue,
    expense: m.outstanding,
    profit: 0,
    margin: 0,
    tripCount: m.trips,
  }));
}

function FilterChip({
  label,
  active,
  onPress,
  compact,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <Pressable
        onPress={onPress}
        style={[
          clientStyles.mobileFilterChip,
          active && clientStyles.mobileFilterChipOn,
        ]}
      >
        <Text
          style={[
            clientStyles.mobileFilterChipText,
            active && clientStyles.mobileFilterChipTextOn,
          ]}
        >
          {label}
        </Text>
      </Pressable>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      style={[styles.salesFilterChip, active && styles.salesFilterChipOn]}
    >
      <Text
        style={[
          styles.salesFilterChipText,
          active && styles.salesFilterChipTextOn,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function KpiCard({
  label,
  value,
  sub,
  lottie,
  valueColor,
  compact,
  wide,
}: {
  label: string;
  value: string;
  sub?: string;
  lottie: ReactNode;
  valueColor?: string;
  compact?: boolean;
  wide?: boolean;
}) {
  return (
    <View
      style={[
        styles.salesKpiCard,
        compact && clientStyles.kpiCardMobile,
        compact && wide && clientStyles.kpiCardMobileWide,
      ]}
    >
      <View style={styles.salesKpiIcon}>{lottie}</View>
      <Text style={[styles.salesKpiValue, valueColor ? { color: valueColor } : null]}>
        {value}
      </Text>
      <Text style={[styles.salesKpiLabel, compact && clientStyles.kpiLabelMobile]}>
        {label}
      </Text>
      {sub ? (
        <Text style={[styles.salesKpiSub, compact && clientStyles.kpiSubMobile]}>
          {sub}
        </Text>
      ) : null}
    </View>
  );
}

function ChartShell({
  title,
  subtitle,
  children,
  compact,
  shellStyle,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  compact?: boolean;
  shellStyle?: object;
}) {
  return (
    <View
      style={[
        styles.salesCard,
        styles.salesCardPadTight,
        compact && clientStyles.chartCardMobile,
        shellStyle,
      ]}
    >
      <Text style={styles.salesCardTitle}>{title}</Text>
      {subtitle ? <Text style={styles.salesWidgetSub}>{subtitle}</Text> : null}
      {children}
    </View>
  );
}

export function ClientFinanceAnalyticsDashboard({
  client,
  trips,
  transactions,
  orgId,
}: Props) {
  const layout = useProfileHubCompactLayout();
  const compact = layout.compact;
  const { width } = useWindowDimensions();
  const carouselCardWidth = Math.min(300, width - Layout.screenPaddingHorizontal * 2 - 12);

  const [dateRange, setDateRange] = useState<ClientAnalyticsDateRange>("12m");
  const [laneFilter, setLaneFilter] = useState<string | null>(null);
  const [monthKey, setMonthKey] = useState<string | null>(null);
  const [tableSearch, setTableSearch] = useState("");
  const [trendChartWidth, setTrendChartWidth] = useState(compact ? width - 48 : 320);
  const [laneChartWidth, setLaneChartWidth] = useState(compact ? carouselCardWidth - 24 : 200);

  const clientId = client?.id ?? null;

  const scopedTrips = useMemo(() => {
    let list = filterByDateRange(trips, dateRange, tripDate);
    if (laneFilter) {
      list = list.filter((t) => {
        const pickup = (t.pickup_area ?? "").trim();
        const drop = (t.drop_location ?? "").trim();
        const lane =
          pickup && drop ? `${pickup} → ${drop}` : pickup || drop || "Unspecified lane";
        return lane === laneFilter;
      });
    }
    if (monthKey) {
      list = list.filter((t) => {
        const d = tripDate(t);
        if (!d) return false;
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        return key === monthKey;
      });
    }
    return list;
  }, [trips, dateRange, laneFilter, monthKey]);

  const scopedTx = useMemo(
    () =>
      filterByDateRange(transactions, dateRange, (tx) => {
        const raw = tx.transaction_date ?? tx.created_at;
        if (!raw) return null;
        const d = new Date(raw);
        return Number.isFinite(d.getTime()) ? d : null;
      }),
    [transactions, dateRange],
  );

  const kpis = useMemo(
    () => computeClientKpiHeader(scopedTrips, scopedTx),
    [scopedTrips, scopedTx],
  );
  const monthly = useMemo(
    () => computeClientMonthlyTrend(scopedTrips, scopedTx, { monthsBack: 12 }),
    [scopedTrips, scopedTx],
  );
  const lanes = useMemo(
    () => computeLaneBreakdown(scopedTrips, { topN: 6 }),
    [scopedTrips],
  );
  const loadTypes = useMemo(
    () => computeLoadTypeBreakdown(scopedTrips, { topN: 5 }),
    [scopedTrips],
  );
  const aging = useMemo(
    () => computePaymentAging(scopedTrips, scopedTx),
    [scopedTrips, scopedTx],
  );
  const operations = useMemo(
    () => computeClientOperationalMetrics(scopedTrips, scopedTx),
    [scopedTrips, scopedTx],
  );

  const { data: serverScore } = useCustomerHealthScoreQuery(orgId, clientId);

  const localScore: CustomerHealthScore | null = useMemo(() => {
    if (serverScore || !clientId) return null;
    return computeCustomerHealthScore(
      clientId,
      scopedTrips.map((t) => ({
        id: t.id,
        client_id: t.client_id,
        client_price: Number(t.client_price ?? 0),
        margin: Number(t.margin ?? 0),
        status: t.status,
        pickup_date: t.pickup_date,
        created_at: t.created_at,
      })),
      scopedTx.map((tx) => ({
        trip_id: tx.trip_id,
        amount_in: Number(tx.amount_in ?? 0),
        transaction_date: tx.transaction_date ?? null,
        created_at: tx.created_at ?? null,
      })),
    );
  }, [serverScore, clientId, scopedTrips, scopedTx]);

  const healthScore = serverScore ?? localScore;
  const badges = useMemo(() => deriveCustomerBadges(healthScore), [healthScore]);
  const primaryBadge = badges[0] ? badgeLabel(badges[0]) : undefined;

  const paymentRisk = useMemo(() => {
    if (!healthScore) {
      const delay = kpis.avgPaymentDelayDays;
      const v = delay <= 0 ? 100 : Math.max(0, 100 - delay * 1.5);
      return Math.round(v);
    }
    return healthScore.paymentScore;
  }, [healthScore, kpis.avgPaymentDelayDays]);

  const collectionPct = useMemo(() => {
    const billed = kpis.totalRevenue;
    const received = Math.max(0, billed - kpis.outstanding);
    return billed > 0 ? Math.min(100, Math.round((received / billed) * 100)) : 0;
  }, [kpis.outstanding, kpis.totalRevenue]);

  const collectedAmount = Math.max(0, kpis.totalRevenue - kpis.outstanding);
  const trend = useMemo(() => toTrendPoints(monthly), [monthly]);

  const laneSlices: SalesSlice[] = useMemo(
    () =>
      lanes.map((l, i) => ({
        label: laneChipLabel(l.label),
        value: l.revenue,
        color: DONUT_COLORS[i % DONUT_COLORS.length],
      })),
    [lanes],
  );

  const loadSlices: SalesSlice[] = useMemo(
    () =>
      loadTypes.map((l, i) => ({
        label: l.label,
        value: l.revenue,
        color: DONUT_COLORS[(i + 2) % DONUT_COLORS.length],
      })),
    [loadTypes],
  );

  const agingSlices: SalesSlice[] = useMemo(
    () =>
      [
        { label: "0-30d", value: aging.bucket0_30, color: "#50CD89" },
        { label: "31-60d", value: aging.bucket31_60, color: "#FFC700" },
        { label: "61-90d", value: aging.bucket61_90, color: "#F1416C" },
        { label: "90+d", value: aging.bucket90Plus, color: "#7239EA" },
      ].filter((s) => s.value > 0),
    [aging],
  );

  const laneBars: SalesBarItem[] = useMemo(
    () =>
      lanes.map((l, i) => ({
        key: l.id,
        label: l.label,
        shortLabel: laneChipLabel(l.label),
        value: l.revenue,
        revenue: l.revenue,
        contributionPct: 0,
        color: DONUT_COLORS[i % DONUT_COLORS.length],
      })),
    [lanes],
  );

  const tableRows = useMemo((): SalesTripTableRow[] => {
    const q = tableSearch.trim().toLowerCase();
    return scopedTrips
      .filter((t) => {
        if (!q) return true;
        const ref = getTripOperationalDisplay({
          trip_number: t.trip_number ?? null,
        }).toLowerCase();
        const lane = `${t.pickup_area ?? ""} ${t.drop_location ?? ""}`.toLowerCase();
        return ref.includes(q) || lane.includes(q);
      })
      .slice(0, 50)
      .map((t) => {
        const sales = Number(t.client_price ?? 0);
        const pickup = (t.pickup_area ?? "").trim();
        const drop = (t.drop_location ?? "").trim();
        const lane =
          pickup && drop ? `${pickup} → ${drop}` : pickup || drop || "—";
        return {
          id: t.id,
          tripRef: getTripOperationalDisplay({ trip_number: t.trip_number ?? null }),
          lane,
          clientName: client?.name ?? "—",
          supplierName: "—",
          sales,
          cost: 0,
          margin: Number(t.margin ?? 0),
          marginPct: sales > 0 ? Math.round((Number(t.margin ?? 0) / sales) * 100) : 0,
          dateLabel: null,
          statusLabel: (t.status ?? "—").replace(/_/g, " ").toUpperCase(),
          trip: t,
        };
      });
  }, [scopedTrips, tableSearch, client?.name]);

  const insights = useMemo(
    () => deriveClientInsights(monthly, kpis, operations, aging),
    [monthly, kpis, operations, aging],
  );

  const healthBars = healthScore
    ? [
        { label: "Profitability", percent: healthScore.profitabilityScore },
        { label: "Payment", percent: healthScore.paymentScore },
        { label: "Operations", percent: healthScore.operationsScore, color: Theme.positive },
        { label: "Consistency", percent: healthScore.consistencyScore },
        { label: "Growth", percent: healthScore.growthScore },
      ]
    : [];

  const clearFilters = () => {
    setLaneFilter(null);
    setMonthKey(null);
    setTableSearch("");
  };

  const filtersActive = Boolean(laneFilter || monthKey || tableSearch.trim());

  const setDateRangeAndResetMonth = (range: ClientAnalyticsDateRange) => {
    setDateRange(range);
    setMonthKey(null);
  };

  const periodFilters = (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={
        compact ? clientStyles.mobileFilterScroll : styles.tagWrap
      }
    >
      {DATE_RANGES.map((range) => (
        <FilterChip
          key={range.id}
          label={range.label}
          active={dateRange === range.id}
          compact={compact}
          onPress={() => setDateRangeAndResetMonth(range.id)}
        />
      ))}
    </ScrollView>
  );

  const laneFilters =
    lanes.length > 0 ? (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={
          compact ? clientStyles.mobileFilterScroll : styles.tagWrap
        }
      >
        {lanes.map((l) => (
          <FilterChip
            key={l.id}
            label={laneChipLabel(l.label)}
            active={laneFilter === l.label}
            compact={compact}
            onPress={() =>
              setLaneFilter((prev) => (prev === l.label ? null : l.label))
            }
          />
        ))}
      </ScrollView>
    ) : null;

  const kpiRow = (
    <View style={compact ? clientStyles.kpiGridMobile : styles.salesKpiRow}>
      <KpiCard
        compact={compact}
        label="Total sales"
        value={formatINRChip(kpis.totalRevenue)}
        sub={`Received ${formatINRChip(collectedAmount)} · Due ${formatINRChip(kpis.outstanding)}`}
        lottie={<ClientAnalyticsKpiLottie source={CLIENT_ANALYTICS_LOTTIE.sales} />}
      />
      <KpiCard
        compact={compact}
        label="Trip P&L"
        value={formatINRChip(kpis.netMargin)}
        sub={`${kpis.marginPct.toFixed(1)}% on sales`}
        valueColor={kpis.netMargin >= 0 ? Theme.positive : Theme.negative}
        lottie={<ClientAnalyticsKpiLottie source={CLIENT_ANALYTICS_LOTTIE.revenue} />}
      />
      <KpiCard
        compact={compact}
        label="Collection rate"
        value={`${collectionPct}%`}
        sub="Received vs billed"
        valueColor={
          collectionPct >= 80
            ? Theme.positive
            : collectionPct >= 50
              ? Theme.warning
              : Theme.negative
        }
        lottie={
          <ClientAnalyticsKpiLottie source={CLIENT_ANALYTICS_LOTTIE.collection} />
        }
      />
      <KpiCard
        compact={compact}
        label="Trips completed"
        value={String(operations.tripsCompleted)}
        sub={`${operations.onTimePct}% on-time · ${operations.completionPct.toFixed(0)}% completion`}
        lottie={<ClientAnalyticsKpiLottie source={CLIENT_ANALYTICS_LOTTIE.trips} />}
      />
    </View>
  );

  const healthCard = (
    <View
      style={[
        styles.salesCard,
        styles.salesCardPadTight,
        compact && clientStyles.healthCardMobile,
      ]}
    >
      <View style={clientStyles.healthHeader}>
        <ClientAnalyticsKpiLottie source={CLIENT_ANALYTICS_LOTTIE.health} size={24} />
        <Text style={styles.salesCardTitle}>Receivable health</Text>
      </View>
      {healthScore ? (
        <>
          <View style={clientStyles.healthScoreRow}>
            <Text
              style={[
                clientStyles.healthScore,
                compact && clientStyles.healthScoreCompact,
              ]}
            >
              {Math.round(healthScore.score)}
            </Text>
            <Text
              style={[
                clientStyles.healthScoreMax,
                compact && clientStyles.healthScoreMaxCompact,
              ]}
            >
              / 100
            </Text>
          </View>
          <Text style={styles.salesWidgetSub}>
            {healthScore.breakdown.tripsTotal} trips · payment behaviour
          </Text>
          {healthBars.map((bar) => (
            <View key={bar.label} style={clientStyles.healthBarRow}>
              <Text
                style={[
                  clientStyles.healthBarLabel,
                  compact && clientStyles.healthBarLabelCompact,
                ]}
              >
                {bar.label}
              </Text>
              <View style={clientStyles.healthBarTrack}>
                <View
                  style={[
                    clientStyles.healthBarFill,
                    {
                      width: `${Math.max(0, Math.min(100, bar.percent))}%`,
                      backgroundColor:
                        bar.color ??
                        (bar.percent < 40 ? Theme.warning : METRONIC.link),
                    },
                  ]}
                />
              </View>
              <Text style={clientStyles.healthBarValue}>{Math.round(bar.percent)}</Text>
            </View>
          ))}
        </>
      ) : (
        <Text style={styles.salesEmptySide}>
          Not enough trip history for a health score.
        </Text>
      )}
    </View>
  );

  const paymentRiskCard = (
    <View
      style={[
        styles.salesCard,
        styles.salesCardPadTight,
        clientStyles.gaugeCard,
        !compact && clientStyles.gaugeCardDesktop,
      ]}
    >
      <Text style={[styles.salesCardTitle, compact && { textAlign: "center" }]}>
        Payment risk
      </Text>
      <View style={clientStyles.gaugeBody}>
        <RiskMeter
          value={paymentRisk}
          level={scoreLevelFromValue(paymentRisk)}
          label="Payment risk"
          caption={
            kpis.avgPaymentDelayDays > 0
              ? `${kpis.avgPaymentDelayDays}d average delay`
              : "No delay history"
          }
          size={compact ? 112 : 128}
          stroke={compact ? 9 : 10}
        />
      </View>
    </View>
  );

  const revenueTrendCard = (
    <ChartShell
      compact={compact}
      shellStyle={!compact ? styles.salesWidgetTrend : undefined}
      title="Revenue trend"
      subtitle="Client billing by month · tap to filter trips"
    >
      <View
        style={styles.salesWidgetChartBody}
        onLayout={(e) => {
          const w = Math.floor(e.nativeEvent.layout.width);
          if (w > 0 && w !== trendChartWidth) setTrendChartWidth(w);
        }}
      >
        <NetworkDesktopSalesLineChart
          data={trend}
          width={trendChartWidth}
          height={compact ? 148 : 132}
          activeMonthKey={monthKey}
          onSelectMonth={setMonthKey}
          color={METRONIC.link}
        />
      </View>
    </ChartShell>
  );

  const laneMixCard = (
    <ChartShell
      compact={compact}
      shellStyle={!compact ? styles.salesWidgetDonut : undefined}
      title="Lane mix"
    >
      <View style={styles.salesWidgetDonutBody}>
        <NetworkDesktopSalesDonut
          slices={laneSlices}
          activeLabel={laneFilter ? laneChipLabel(laneFilter) : null}
          onSelectLabel={(label) => {
            const match = lanes.find((l) => laneChipLabel(l.label) === label);
            setLaneFilter(match ? match.label : null);
          }}
          emptyMessage="No lane trips yet."
        />
      </View>
    </ChartShell>
  );

  const loadTypesCard = (
    <ChartShell
      compact={compact}
      shellStyle={!compact ? styles.salesWidgetDonut : undefined}
      title="Load types"
    >
      <View style={styles.salesWidgetDonutBody}>
        <NetworkDesktopSalesDonut
          slices={loadSlices}
          emptyMessage="No load-type data yet."
        />
      </View>
    </ChartShell>
  );

  const laneContributionCard = (
    <ChartShell
      compact={compact}
      shellStyle={!compact ? styles.salesBarLane : undefined}
      title="Lane contribution"
    >
      <View
        onLayout={(e) => {
          const w = Math.floor(e.nativeEvent.layout.width);
          if (w > 0 && w !== laneChartWidth) setLaneChartWidth(w);
        }}
      >
        <NetworkDesktopSalesBarChart
          items={laneBars}
          width={laneChartWidth}
          height={compact ? 132 : 148}
          activeKey={laneFilter}
          onSelectKey={(key) => {
            const lane = lanes.find((l) => l.id === key);
            setLaneFilter(lane ? lane.label : null);
          }}
          footerText="Revenue by lane · tap to cross-filter"
        />
      </View>
    </ChartShell>
  );

  const agingCard = (
    <ChartShell
      compact={compact}
      shellStyle={!compact ? styles.salesBarOrigin : undefined}
      title="Aging mix"
    >
      <View style={styles.salesWidgetDonutBody}>
        <NetworkDesktopSalesDonut
          slices={agingSlices}
          emptyMessage="No outstanding aging."
        />
      </View>
    </ChartShell>
  );

  const collectionsCard = (
    <ChartShell
      compact={compact}
      shellStyle={!compact ? styles.salesBarOrigin : undefined}
      title="Collections"
    >
      <TrendBarChart
        data={toRevenueLinePoints(monthly)}
        width={Math.max(180, laneChartWidth)}
        height={compact ? 132 : 140}
        primaryField="revenue"
        secondaryField="expense"
        primaryColor={Theme.chartSeries2}
        secondaryColor={Theme.chartSeries4}
      />
    </ChartShell>
  );

  const clientSummaryCard = client ? (
    <View style={[styles.salesCard, styles.salesCardPad, compact && clientStyles.sectionCardMobile]}>
      <View style={styles.salesContributorRow}>
        <PartyAvatar
          name={client.name}
          initialsColorSeed={client.id}
          avatarUrl={client.avatar_url}
          avatarSeed={client.avatar_seed}
          entityType="client"
          size={compact ? 40 : 36}
        />
        <View style={styles.salesContributorTextCol}>
          <Text style={styles.salesContributorName} numberOfLines={2}>
            {client.name}
          </Text>
          <Text style={styles.salesContributorMeta}>
            {operations.tripsTotal} trips · {collectionPct}% collected
          </Text>
        </View>
      </View>
      {primaryBadge ? (
        <View style={clientStyles.healthBadge}>
          <Text style={clientStyles.healthBadgeText}>{primaryBadge}</Text>
        </View>
      ) : null}
    </View>
  ) : null;

  const insightsBlock =
    insights.length > 0 ? (
      <View
        style={[
          styles.salesCard,
          styles.salesCardPad,
          clientStyles.insightsCard,
          !compact && clientStyles.insightsCardDesktop,
          compact && clientStyles.sectionCardMobile,
        ]}
      >
        <Text style={styles.cardTitle}>Insights</Text>
        {insights.map((item, i) => (
          <ClientAnalyticsInsightRow
            key={`insight-${i}`}
            message={item.message}
            tone={item.tone}
          />
        ))}
      </View>
    ) : null;

  const tripsBlock = compact ? (
    <View style={clientStyles.tripsSectionMobile}>
      <View style={clientStyles.sectionCardMobile}>
        <Text style={styles.salesCardTitle}>Trips</Text>
        <Text style={styles.salesTripTableSub}>
          {filtersActive
            ? "Filtered by period, lane, or month"
            : "All client trips in period"}
        </Text>
        <View style={clientStyles.tripsSearchMobile}>
          <Search size={16} color={METRONIC.muted} />
          <TextInput
            style={clientStyles.tripsSearchInput}
            placeholder="Search trips, lanes…"
            placeholderTextColor={METRONIC.muted}
            value={tableSearch}
            onChangeText={setTableSearch}
          />
        </View>
      </View>

      {tableRows.length === 0 ? (
        <View style={clientStyles.tripsEmpty}>
          <ClientAnalyticsKpiLottie
            source={CLIENT_ANALYTICS_LOTTIE.trips}
            size={44}
          />
          <Text style={styles.emptyText}>No trips match filters.</Text>
        </View>
      ) : (
        <View style={clientStyles.tripsListMobile}>
          {tableRows.map((row) => {
            const received = scopedTx
              .filter((tx) => tx.trip_id === row.id)
              .reduce((s, tx) => s + Number(tx.amount_in ?? 0), 0);
            const due = Math.max(0, row.sales - received);
            return (
              <ClientAnalyticsMobileTripCard
                key={row.id}
                row={row}
                received={received}
                due={due}
              />
            );
          })}
        </View>
      )}
    </View>
  ) : (
    <View style={[styles.salesCard, styles.salesTableCard]}>
      <View style={styles.salesTableTitleRow}>
        <View style={styles.salesTripTableTitleCol}>
          <Text style={styles.salesCardTitle}>Trips</Text>
          <Text style={styles.salesTripTableSub}>
            {filtersActive
              ? "Filtered by period, lane, or month"
              : "All client trips in period"}
          </Text>
        </View>
      </View>

      <View style={styles.salesTableToolbar}>
        <View style={styles.salesTableSearch}>
          <Search size={14} color={METRONIC.muted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search trips, lanes…"
            placeholderTextColor={METRONIC.muted}
            value={tableSearch}
            onChangeText={setTableSearch}
          />
        </View>
      </View>

      <View style={styles.salesTableScroll}>
        <View style={styles.salesTableHead}>
          <View style={clientStyles.clientTripsGrid}>
            <Text style={[styles.salesTableHeadCell, styles.salesColTripRef]}>
              Trip
            </Text>
            <Text style={[styles.salesTableHeadCell, styles.salesColLane]}>
              Lane
            </Text>
            <Text style={[styles.salesTableHeadCell, styles.salesGridNumHead]}>
              Sales
            </Text>
            <Text style={[styles.salesTableHeadCell, styles.salesGridNumHead]}>
              Received
            </Text>
            <Text style={[styles.salesTableHeadCell, styles.salesGridNumHead]}>
              Due
            </Text>
            <Text style={[styles.salesTableHeadCell, styles.salesColStatus]}>
              Status
            </Text>
          </View>
        </View>

        {tableRows.length === 0 ? (
          <View style={clientStyles.tripsEmpty}>
            <ClientAnalyticsKpiLottie
              source={CLIENT_ANALYTICS_LOTTIE.trips}
              size={44}
            />
            <Text style={styles.emptyText}>No trips match filters.</Text>
          </View>
        ) : (
          tableRows.map((row, idx) => {
            const received = scopedTx
              .filter((tx) => tx.trip_id === row.id)
              .reduce((s, tx) => s + Number(tx.amount_in ?? 0), 0);
            const due = Math.max(0, row.sales - received);
            return (
              <View
                key={row.id}
                style={[
                  styles.salesTableRow,
                  idx === tableRows.length - 1 && styles.salesTableRowLast,
                ]}
              >
                <View style={clientStyles.clientTripsGrid}>
                  <View style={styles.salesColTripRef}>
                    <SalesTripRefCell row={row} />
                  </View>
                  <View style={styles.salesColLane}>
                    <SalesTripLaneCell row={row} />
                  </View>
                  <View style={styles.salesGridNumCell}>
                    <SalesTripMoneyCell value={row.sales} />
                  </View>
                  <View style={styles.salesGridNumCell}>
                    <SalesTripMoneyCell value={received} />
                  </View>
                  <View style={styles.salesGridNumCell}>
                    <SalesTripMoneyCell value={due} />
                  </View>
                  <View style={styles.salesColStatus}>
                    <SalesTripStatusCell row={row} />
                  </View>
                </View>
              </View>
            );
          })
        )}
      </View>
    </View>
  );

  if (compact) {
    return (
      <View style={[styles.salesBody, layout.salesBody]}>
        <View style={clientStyles.pageIntroCompact}>
          <Text style={[clientStyles.pageTitle, clientStyles.pageTitleCompact]}>
            Finance analytics
          </Text>
          <Text style={[clientStyles.pageSub, clientStyles.pageSubCompact]}>
            {client?.name ?? "Billing, P&L, and receivables"}
          </Text>
        </View>

        {periodFilters}
        {laneFilters}
        {filtersActive ? (
          <Pressable onPress={clearFilters} style={clientStyles.mobileClearBtn}>
            <Text style={clientStyles.mobileClearBtnText}>Clear all filters</Text>
          </Pressable>
        ) : null}

        <View style={clientStyles.mobileStack}>
          {clientSummaryCard ? (
            <View style={clientStyles.mobileSection}>{clientSummaryCard}</View>
          ) : null}

          <View style={clientStyles.mobileSection}>{kpiRow}</View>

          <View style={clientStyles.mobileSection}>
            <View style={clientStyles.chartStackMobile}>
              {revenueTrendCard}
              {laneMixCard}
              {loadTypesCard}
            </View>
          </View>

          <View style={clientStyles.mobileSection}>
            <View style={clientStyles.healthStackMobile}>
              {healthCard}
              {paymentRiskCard}
            </View>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={clientStyles.carousel}
          >
            <View style={[clientStyles.carouselCard, { width: carouselCardWidth }]}>
              <View style={clientStyles.carouselCardInner}>{laneContributionCard}</View>
            </View>
            <View style={[clientStyles.carouselCard, { width: carouselCardWidth }]}>
              <View style={clientStyles.carouselCardInner}>{agingCard}</View>
            </View>
            <View style={[clientStyles.carouselCard, { width: carouselCardWidth }]}>
              <View style={clientStyles.carouselCardInner}>{collectionsCard}</View>
            </View>
          </ScrollView>

          {tripsBlock}
          {insightsBlock ? (
            <View style={clientStyles.mobileSection}>{insightsBlock}</View>
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.salesBody, clientStyles.bodyDesktop]}>
      <View style={[clientStyles.pageIntro, clientStyles.pageIntroDesktop]}>
        <Text style={clientStyles.pageTitle}>Client finance analytics</Text>
        <Text style={clientStyles.pageSub}>
          {client?.name
            ? `${client.name} · billing, P&L, and receivables`
            : "Billing, P&L, and receivables for this client"}
        </Text>
      </View>

      <View style={styles.splitRow}>
        <View style={[styles.sidebar, clientStyles.desktopSidebar]}>
          <View style={[styles.salesCard, styles.salesCardPad]}>
            <Text style={styles.cardTitle}>Intelligent filters</Text>
            <Text style={styles.salesFilterHint}>
              Cross-filter charts and trips like Connection sales
            </Text>
            <Text style={styles.salesFilterGroup}>Period</Text>
            {periodFilters}
            {lanes.length > 0 ? (
              <>
                <Text style={styles.salesFilterGroup}>Lanes</Text>
                {laneFilters}
              </>
            ) : null}
            {filtersActive ? (
              <Pressable onPress={clearFilters} style={styles.salesClearBtn}>
                <Text style={styles.salesClearBtnText}>Clear all filters</Text>
              </Pressable>
            ) : null}
          </View>

          <View style={[styles.salesCard, styles.salesCardPad]}>
            <Text style={styles.cardTitle}>Top lanes</Text>
            {lanes.slice(0, 4).map((lane, idx) => (
              <Pressable
                key={lane.id}
                style={[
                  styles.salesContributorRow,
                  idx === Math.min(3, lanes.length - 1) &&
                    styles.salesContributorRowLast,
                ]}
                onPress={() =>
                  setLaneFilter((prev) =>
                    prev === lane.label ? null : lane.label,
                  )
                }
              >
                <View style={styles.salesKpiIcon}>
                  <ClientAnalyticsKpiLottie
                    source={CLIENT_ANALYTICS_LOTTIE.lanes}
                    size={24}
                  />
                </View>
                <View style={styles.salesContributorTextCol}>
                  <Text style={styles.salesContributorName} numberOfLines={2}>
                    {lane.label}
                  </Text>
                  <Text style={styles.salesContributorMeta}>
                    {lane.trips} trips · {formatINRChip(lane.revenue)}
                  </Text>
                </View>
              </Pressable>
            ))}
            {lanes.length === 0 ? (
              <Text style={styles.salesEmptySide}>No lane data yet.</Text>
            ) : null}
          </View>

          {clientSummaryCard}
        </View>

        <View style={[styles.mainCol, clientStyles.desktopMainCol]}>
          {kpiRow}

          <View style={styles.salesWidgetRow}>
            {revenueTrendCard}
            {laneMixCard}
            {loadTypesCard}
          </View>

          <View style={styles.salesBarRowDual}>
            {healthCard}
            {paymentRiskCard}
          </View>

          <View style={styles.salesBarRow}>
            {laneContributionCard}
            {agingCard}
            {collectionsCard}
          </View>

          {tripsBlock}
          {insightsBlock}
        </View>
      </View>
    </View>
  );
}
