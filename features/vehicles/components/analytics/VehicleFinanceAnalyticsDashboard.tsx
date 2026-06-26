/**
 * Vehicle finance analytics — responsive Metronic BI (matches supplier dashboard).
 */
import { PartyAvatar } from "@/components/PartyAvatar";
import { RiskMeter } from "@/components/analytics/RiskMeter";
import { TrendBarChart, type TrendPoint } from "@/components/analytics";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import {
  computeVehiclePerformanceScore,
  deriveVehicleBadges,
  scoreLevelFromValue,
  type VehiclePerformanceScore,
} from "@/features/analytics";
import { ClientAnalyticsInsightRow } from "@/features/clients/components/analytics/ClientAnalyticsInsightRow";
import { ClientAnalyticsKpiLottie } from "@/features/clients/components/analytics/ClientAnalyticsKpiLottie";
import { clientFinanceAnalyticsStyles as styles } from "@/features/clients/components/analytics/clientFinanceAnalytics.styles";
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
  networkDesktopHubStyles as hubStyles,
} from "@/features/network/components/desktop/networkDesktopHub.styles";
import type {
  SalesBarItem,
  SalesSlice,
  SalesTripTableRow,
  SalesTrendPoint,
} from "@/features/network/utils/connectionSalesAnalytics.util";
import { getTripOperationalDisplay } from "@/features/operations/display";
import { useProfileHubCompactLayout } from "@/features/party/hooks/useProfileHubCompactLayout";
import type { TripRow } from "@/features/trips/services/trips.service";
import type { VehicleRow } from "@/features/vehicles/services/vehicles.service";
import { VEHICLE_ANALYTICS_LOTTIE } from "@/features/vehicles/components/analytics/vehicleAnalyticsAssets";
import { VehicleAnalyticsMobileTripCard } from "@/features/vehicles/components/analytics/VehicleAnalyticsMobileTripCard";
import type { MissionRow } from "@/features/vehicles/components/analytics/analyticsUtils";
import {
  computeVehicleExpenseBuckets,
  computeVehicleFinancialMetrics,
  computeVehicleLaneBreakdown,
  computeVehicleLoadTypeBreakdown,
  computeVehicleMonthlyTrend,
  computeVehicleOperationalMetrics,
  deriveVehicleInsights,
  filterTripsByDateRange,
  filterVehicleRowsByDateRange,
  type VehicleAnalyticsDateRange,
  type VehicleMonthlyTrendPoint,
} from "@/features/vehicles/components/analytics/vehicleFinanceAnalyticsUtils";
import { formatINRChip } from "@/lib/format";
import { useVehiclePerformanceScoreQuery } from "@/lib/queries/useAnalyticsQueries";
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

type Props = {
  vehicle: VehicleRow | null;
  missionRows: MissionRow[];
  trips: TripRow[];
  transactions: LedgerRow[];
  orgId: string | null;
  embedded?: boolean;
};

const DATE_RANGES: { id: VehicleAnalyticsDateRange; label: string }[] = [
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

function laneChipLabel(lane: string): string {
  if (lane.length <= 24) return lane;
  return `${lane.slice(0, 22)}…`;
}

function laneFromTrip(t: TripRow): string {
  const pickup = (t.pickup_area ?? "").trim();
  const drop = (t.drop_location ?? "").trim();
  return pickup && drop ? `${pickup} → ${drop}` : pickup || drop || "Unspecified lane";
}

function badgeLabel(b: string): string {
  switch (b) {
    case "top_earner":
      return "Top earner";
    case "high_risk":
      return "High risk";
    case "most_utilized":
      return "Most utilized";
    case "underutilized":
      return "Underutilized";
    case "cost_efficient":
      return "Cost efficient";
    case "expensive":
      return "High cost";
    case "consistent":
      return "Consistent";
    default:
      return b.replace(/_/g, " ");
  }
}

function toTrendPoints(months: readonly VehicleMonthlyTrendPoint[]): SalesTrendPoint[] {
  return months.map((m) => ({
    monthKey: m.monthKey,
    label: m.label,
    trips: m.trips,
    revenue: m.revenue,
  }));
}

function toProfitLinePoints(months: readonly VehicleMonthlyTrendPoint[]): TrendPoint[] {
  return months.map((m) => ({
    label: m.label,
    revenue: m.revenue,
    expense: m.expense,
    profit: m.profit,
    margin: m.marginPct,
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
        style={[styles.mobileFilterChip, active && styles.mobileFilterChipOn]}
      >
        <Text
          style={[
            styles.mobileFilterChipText,
            active && styles.mobileFilterChipTextOn,
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
      style={[hubStyles.salesFilterChip, active && hubStyles.salesFilterChipOn]}
    >
      <Text
        style={[
          hubStyles.salesFilterChipText,
          active && hubStyles.salesFilterChipTextOn,
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
}: {
  label: string;
  value: string;
  sub?: string;
  lottie: ReactNode;
  valueColor?: string;
  compact?: boolean;
}) {
  return (
    <View style={[hubStyles.salesKpiCard, compact && styles.kpiCardMobile]}>
      <View style={styles.kpiIconWrap}>{lottie}</View>
      <Text style={[hubStyles.salesKpiValue, valueColor ? { color: valueColor } : null]}>
        {value}
      </Text>
      <Text style={[hubStyles.salesKpiLabel, compact && styles.kpiLabelMobile]}>
        {label}
      </Text>
      {sub ? (
        <Text style={[hubStyles.salesKpiSub, compact && styles.kpiSubMobile]}>{sub}</Text>
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
        hubStyles.salesCard,
        hubStyles.salesCardPadTight,
        compact && styles.chartCardMobile,
        shellStyle,
      ]}
    >
      <Text style={hubStyles.salesCardTitle}>{title}</Text>
      {subtitle ? <Text style={hubStyles.salesWidgetSub}>{subtitle}</Text> : null}
      {children}
    </View>
  );
}

export function VehicleFinanceAnalyticsDashboard({
  vehicle,
  missionRows,
  trips,
  transactions,
  orgId,
  embedded = false,
}: Props) {
  const layout = useProfileHubCompactLayout();
  const compact = layout.compact;
  const { width } = useWindowDimensions();
  const carouselCardWidth = Math.min(300, width - Layout.screenPaddingHorizontal * 2 - 12);

  const [dateRange, setDateRange] = useState<VehicleAnalyticsDateRange>("12m");
  const [laneFilter, setLaneFilter] = useState<string | null>(null);
  const [monthKey, setMonthKey] = useState<string | null>(null);
  const [tableSearch, setTableSearch] = useState("");
  const [trendChartWidth, setTrendChartWidth] = useState(compact ? width - 48 : 320);
  const [laneChartWidth, setLaneChartWidth] = useState(compact ? carouselCardWidth - 24 : 200);

  const vehicleId = vehicle?.id ?? null;
  const vehicleLabel = vehicle?.vehicle_number?.trim() || "Vehicle";

  const scopedMissionRows = useMemo(() => {
    let list = filterVehicleRowsByDateRange(missionRows, dateRange);
    if (laneFilter) {
      list = list.filter((r) => laneFromTrip(r.trip) === laneFilter);
    }
    if (monthKey) {
      list = list.filter((r) => {
        const d = tripDate(r.trip);
        if (!d) return false;
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        return key === monthKey;
      });
    }
    return list;
  }, [missionRows, dateRange, laneFilter, monthKey]);

  const scopedTrips = useMemo(() => {
    let list = filterTripsByDateRange(trips, dateRange);
    if (laneFilter) list = list.filter((t) => laneFromTrip(t) === laneFilter);
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

  const { data: serverScore } = useVehiclePerformanceScoreQuery(orgId, vehicleId);

  const localScore: VehiclePerformanceScore | null = useMemo(() => {
    if (serverScore || !vehicleId) return null;
    return computeVehiclePerformanceScore(
      vehicleId,
      scopedTrips.map((t) => ({
        id: t.id,
        vehicle_id: t.vehicle_id,
        client_price: Number(t.client_price ?? 0),
        status: t.status,
        distance: Number(t.distance ?? 0),
        pickup_date: t.pickup_date,
        created_at: t.created_at,
      })),
      transactions.map((tx) => ({
        trip_id: tx.trip_id,
        amount_out: Number(tx.amount_out ?? 0),
        contact_type: tx.contact_type ?? null,
        transaction_date: tx.transaction_date ?? null,
        created_at: tx.created_at ?? null,
      })),
    );
  }, [serverScore, vehicleId, scopedTrips, transactions]);

  const score = serverScore ?? localScore;
  const badges = useMemo(() => deriveVehicleBadges(score), [score]);
  const primaryBadge = badges[0] ? badgeLabel(badges[0]) : undefined;

  const financial = useMemo(
    () => computeVehicleFinancialMetrics(scopedMissionRows),
    [scopedMissionRows],
  );
  const operations = useMemo(
    () => computeVehicleOperationalMetrics(scopedTrips),
    [scopedTrips],
  );
  const monthly = useMemo(
    () => computeVehicleMonthlyTrend(scopedMissionRows, { monthsBack: 12 }),
    [scopedMissionRows],
  );
  const lanes = useMemo(
    () => computeVehicleLaneBreakdown(scopedMissionRows, { topN: 6 }),
    [scopedMissionRows],
  );
  const loadTypes = useMemo(
    () => computeVehicleLoadTypeBreakdown(scopedTrips, { topN: 5 }),
    [scopedTrips],
  );
  const expenseBuckets = useMemo(
    () => computeVehicleExpenseBuckets(scopedMissionRows),
    [scopedMissionRows],
  );

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

  const expenseSlices: SalesSlice[] = useMemo(() => {
    const cats = expenseBuckets.categories;
    if (cats.length > 0) {
      return cats.map((c, i) => ({
        label: c.label,
        value: c.amount,
        color: DONUT_COLORS[i % DONUT_COLORS.length],
      }));
    }
    return [
      { label: "Fuel", value: expenseBuckets.bucket0_30, color: "#50CD89" },
      { label: "Toll", value: expenseBuckets.bucket31_60, color: "#FFC700" },
      { label: "Driver", value: expenseBuckets.bucket61_90, color: "#F1416C" },
      { label: "Other", value: expenseBuckets.bucket90Plus, color: "#7239EA" },
    ].filter((s) => s.value > 0);
  }, [expenseBuckets]);

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

  const missionByTripId = useMemo(() => {
    const map = new Map<string, MissionRow>();
    for (const row of scopedMissionRows) map.set(row.trip.id, row);
    return map;
  }, [scopedMissionRows]);

  const tableRows = useMemo((): SalesTripTableRow[] => {
    const q = tableSearch.trim().toLowerCase();
    return scopedMissionRows
      .filter((row) => {
        if (!q) return true;
        const t = row.trip;
        const ref = getTripOperationalDisplay({
          trip_number: t.trip_number ?? null,
        }).toLowerCase();
        const lane = `${t.pickup_area ?? ""} ${t.drop_location ?? ""}`.toLowerCase();
        return ref.includes(q) || lane.includes(q);
      })
      .slice(0, 50)
      .map((row) => {
        const t = row.trip;
        const lane = laneFromTrip(t);
        return {
          id: t.id,
          tripRef: getTripOperationalDisplay({ trip_number: t.trip_number ?? null }),
          lane,
          clientName: "—",
          supplierName: vehicleLabel,
          sales: row.sales,
          cost: row.expense,
          margin: row.profit,
          marginPct: row.margin,
          dateLabel: null,
          statusLabel: (t.status ?? "—").replace(/_/g, " ").toUpperCase(),
          trip: t,
        };
      });
  }, [scopedMissionRows, tableSearch, vehicleLabel]);

  const insightLines = useMemo(
    () => deriveVehicleInsights(financial, operations),
    [financial, operations],
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

  const clearFilters = () => {
    setLaneFilter(null);
    setMonthKey(null);
    setTableSearch("");
  };

  const filtersActive = Boolean(laneFilter || monthKey || tableSearch.trim());

  const setDateRangeAndResetMonth = (range: VehicleAnalyticsDateRange) => {
    setDateRange(range);
    setMonthKey(null);
  };

  const periodFilters = (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={compact ? styles.mobileFilterScroll : hubStyles.tagWrap}
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
        contentContainerStyle={compact ? styles.mobileFilterScroll : hubStyles.tagWrap}
      >
        {lanes.map((l) => (
          <FilterChip
            key={l.id}
            label={laneChipLabel(l.label)}
            active={laneFilter === l.label}
            compact={compact}
            onPress={() => setLaneFilter((prev) => (prev === l.label ? null : l.label))}
          />
        ))}
      </ScrollView>
    ) : null;

  const kpiRow = (
    <View style={compact ? styles.kpiGridMobile : hubStyles.salesKpiRow}>
      <KpiCard
        compact={compact}
        label="Total revenue"
        value={formatINRChip(financial.revenue)}
        sub={`${formatINRChip(financial.revenuePerDay)}/day avg`}
        lottie={
          <ClientAnalyticsKpiLottie source={VEHICLE_ANALYTICS_LOTTIE.revenue} size={40} />
        }
      />
      <KpiCard
        compact={compact}
        label="Net profit"
        value={formatINRChip(financial.profit)}
        sub={`Expense ${formatINRChip(financial.expense)}`}
        valueColor={financial.profit >= 0 ? Theme.positive : Theme.negative}
        lottie={
          <ClientAnalyticsKpiLottie source={VEHICLE_ANALYTICS_LOTTIE.profit} size={40} />
        }
      />
      <KpiCard
        compact={compact}
        label="Net margin"
        value={`${financial.marginPct.toFixed(1)}%`}
        sub="Profit on revenue"
        valueColor={
          financial.marginPct >= 15
            ? Theme.positive
            : financial.marginPct >= 5
              ? Theme.warning
              : Theme.negative
        }
        lottie={
          <ClientAnalyticsKpiLottie source={VEHICLE_ANALYTICS_LOTTIE.profit} size={40} />
        }
      />
      <KpiCard
        compact={compact}
        label="Trips executed"
        value={String(operations.tripsCompleted)}
        sub={`${financial.utilizationPct}% utilization · ${operations.completionPct}% completion`}
        lottie={
          <ClientAnalyticsKpiLottie source={VEHICLE_ANALYTICS_LOTTIE.trips} size={40} />
        }
      />
    </View>
  );

  const healthCard = (
    <View
      style={[
        hubStyles.salesCard,
        hubStyles.salesCardPadTight,
        compact && styles.healthCardMobile,
      ]}
    >
      <View style={styles.healthHeader}>
        <ClientAnalyticsKpiLottie source={VEHICLE_ANALYTICS_LOTTIE.performance} size={32} />
        <Text style={hubStyles.salesCardTitle}>Performance score</Text>
      </View>
      {score ? (
        <>
          <View style={styles.healthScoreRow}>
            <Text
              style={[
                styles.healthScore,
                compact && styles.healthScoreCompact,
                score.level === "critical" || score.level === "warning"
                  ? { color: Theme.negative }
                  : score.level === "good" || score.level === "excellent"
                    ? { color: Theme.positive }
                    : { color: Theme.warning },
              ]}
            >
              {Math.round(score.score)}
            </Text>
            <Text
              style={[styles.healthScoreMax, compact && styles.healthScoreMaxCompact]}
            >
              / 100
            </Text>
          </View>
          <Text style={hubStyles.salesWidgetSub}>
            {score.breakdown.tripsTotal} trips · last 6 months
          </Text>
          {healthBars.map((bar) => (
            <View key={bar.label} style={styles.healthBarRow}>
              <Text
                style={[styles.healthBarLabel, compact && styles.healthBarLabelCompact]}
              >
                {bar.label}
              </Text>
              <View style={styles.healthBarTrack}>
                <View
                  style={[
                    styles.healthBarFill,
                    {
                      width: `${Math.max(0, Math.min(100, bar.percent))}%`,
                      backgroundColor:
                        bar.color ??
                        (bar.percent < 40 ? Theme.warning : METRONIC.link),
                    },
                  ]}
                />
              </View>
              <Text style={styles.healthBarValue}>{Math.round(bar.percent)}</Text>
            </View>
          ))}
        </>
      ) : (
        <Text style={hubStyles.salesEmptySide}>
          Not enough trip history for a performance score.
        </Text>
      )}
    </View>
  );

  const utilizationGaugeCard = (
    <View
      style={[
        hubStyles.salesCard,
        hubStyles.salesCardPadTight,
        styles.gaugeCard,
        !compact && styles.gaugeCardDesktop,
      ]}
    >
      <Text style={[hubStyles.salesCardTitle, compact && { textAlign: "center" }]}>
        Utilization
      </Text>
      <View style={styles.gaugeBody}>
        <RiskMeter
          value={financial.utilizationPct}
          level={scoreLevelFromValue(financial.utilizationPct)}
          label="Fleet utilization"
          caption={`${operations.tripsCompleted} completed trips`}
          size={compact ? 112 : 128}
          stroke={compact ? 9 : 10}
        />
      </View>
    </View>
  );

  const revenueTrendCard = (
    <ChartShell
      compact={compact}
      shellStyle={!compact ? hubStyles.salesWidgetTrend : undefined}
      title="Revenue trend"
      subtitle="Vehicle revenue by month · tap to filter trips"
    >
      <View
        style={hubStyles.salesWidgetChartBody}
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
      shellStyle={!compact ? hubStyles.salesWidgetDonut : undefined}
      title="Lane mix"
    >
      <View style={hubStyles.salesWidgetDonutBody}>
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
      shellStyle={!compact ? hubStyles.salesWidgetDonut : undefined}
      title="Load types"
    >
      <View style={hubStyles.salesWidgetDonutBody}>
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
      shellStyle={!compact ? hubStyles.salesBarLane : undefined}
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

  const expenseBucketsCard = (
    <ChartShell
      compact={compact}
      shellStyle={!compact ? hubStyles.salesBarOrigin : undefined}
      title="Expense buckets"
    >
      <View style={hubStyles.salesWidgetDonutBody}>
        <NetworkDesktopSalesDonut
          slices={expenseSlices}
          emptyMessage="No expense data yet."
        />
      </View>
    </ChartShell>
  );

  const profitTrendCard = (
    <ChartShell
      compact={compact}
      shellStyle={!compact ? hubStyles.salesBarOrigin : undefined}
      title="Profit trend"
    >
      <TrendBarChart
        data={toProfitLinePoints(monthly)}
        width={Math.max(180, laneChartWidth)}
        height={compact ? 132 : 140}
        primaryField="revenue"
        secondaryField="expense"
        primaryColor={Theme.chartSeries2}
        secondaryColor={Theme.chartSeries4}
      />
    </ChartShell>
  );

  const vehicleSummaryCard = vehicle ? (
    <View
      style={[
        hubStyles.salesCard,
        hubStyles.salesCardPad,
        compact && styles.sectionCardMobile,
      ]}
    >
      <View style={hubStyles.salesContributorRow}>
        <PartyAvatar
          name={vehicleLabel}
          initialsColorSeed={vehicle.id}
          entityType="vehicle"
          size={compact ? 40 : 36}
        />
        <View style={hubStyles.salesContributorTextCol}>
          <Text style={hubStyles.salesContributorName} numberOfLines={2}>
            {vehicleLabel}
          </Text>
          <Text style={hubStyles.salesContributorMeta}>
            {operations.tripsTotal} trips · {financial.utilizationPct}% utilized
          </Text>
        </View>
      </View>
      {primaryBadge ? (
        <View style={styles.healthBadge}>
          <Text style={styles.healthBadgeText}>{primaryBadge}</Text>
        </View>
      ) : null}
    </View>
  ) : null;

  const insightsBlock =
    insightLines.length > 0 ? (
      <View
        style={[
          hubStyles.salesCard,
          hubStyles.salesCardPad,
          styles.insightsCard,
          !compact && styles.insightsCardDesktop,
          compact && styles.sectionCardMobile,
        ]}
      >
        <Text style={hubStyles.cardTitle}>Insights</Text>
        {insightLines.map((message, i) => (
          <ClientAnalyticsInsightRow key={`insight-${i}`} message={message} tone="neutral" />
        ))}
      </View>
    ) : null;

  const tripsBlock = compact ? (
    <View style={styles.tripsSectionMobile}>
      <View style={styles.sectionCardMobile}>
        <Text style={hubStyles.salesCardTitle}>Trips</Text>
        <Text style={hubStyles.salesTripTableSub}>
          {filtersActive
            ? "Filtered by period, lane, or month"
            : "All vehicle trips in period"}
        </Text>
        <View style={styles.tripsSearchMobile}>
          <Search size={16} color={METRONIC.muted} />
          <TextInput
            style={styles.tripsSearchInput}
            placeholder="Search trips, lanes…"
            placeholderTextColor={METRONIC.muted}
            value={tableSearch}
            onChangeText={setTableSearch}
          />
        </View>
      </View>

      {tableRows.length === 0 ? (
        <View style={styles.tripsEmpty}>
          <ClientAnalyticsKpiLottie source={VEHICLE_ANALYTICS_LOTTIE.trips} size={72} />
          <Text style={styles.tripsEmptyText}>No trips match filters.</Text>
        </View>
      ) : (
        <View style={styles.tripsListMobile}>
          {tableRows.map((row) => {
            const mission = missionByTripId.get(row.id);
            return (
              <VehicleAnalyticsMobileTripCard
                key={row.id}
                row={row}
                revenue={mission?.sales ?? row.sales}
                expense={mission?.expense ?? row.cost}
                profit={mission?.profit ?? row.margin}
              />
            );
          })}
        </View>
      )}
    </View>
  ) : (
    <View style={[hubStyles.salesCard, hubStyles.salesTableCard]}>
      <View style={hubStyles.salesTableTitleRow}>
        <View style={hubStyles.salesTripTableTitleCol}>
          <Text style={hubStyles.salesCardTitle}>Trips</Text>
          <Text style={hubStyles.salesTripTableSub}>
            {filtersActive
              ? "Filtered by period, lane, or month"
              : "All vehicle trips in period"}
          </Text>
        </View>
      </View>

      <View style={hubStyles.salesTableToolbar}>
        <View style={hubStyles.salesTableSearch}>
          <Search size={14} color={METRONIC.muted} />
          <TextInput
            style={hubStyles.searchInput}
            placeholder="Search trips, lanes…"
            placeholderTextColor={METRONIC.muted}
            value={tableSearch}
            onChangeText={setTableSearch}
          />
        </View>
      </View>

      <View style={hubStyles.salesTableScroll}>
        <View style={hubStyles.salesTableHead}>
          <View style={styles.clientTripsGrid}>
            <Text style={[hubStyles.salesTableHeadCell, hubStyles.salesColTripRef]}>
              Trip
            </Text>
            <Text style={[hubStyles.salesTableHeadCell, hubStyles.salesColLane]}>
              Lane
            </Text>
            <Text style={[hubStyles.salesTableHeadCell, hubStyles.salesGridNumHead]}>
              Revenue
            </Text>
            <Text style={[hubStyles.salesTableHeadCell, hubStyles.salesGridNumHead]}>
              Expense
            </Text>
            <Text style={[hubStyles.salesTableHeadCell, hubStyles.salesGridNumHead]}>
              Profit
            </Text>
            <Text style={[hubStyles.salesTableHeadCell, hubStyles.salesColStatus]}>
              Status
            </Text>
          </View>
        </View>

        {tableRows.length === 0 ? (
          <View style={styles.tripsEmpty}>
            <ClientAnalyticsKpiLottie source={VEHICLE_ANALYTICS_LOTTIE.trips} size={72} />
            <Text style={styles.tripsEmptyText}>No trips match filters.</Text>
          </View>
        ) : (
          tableRows.map((row, idx) => {
            const mission = missionByTripId.get(row.id);
            const revenue = mission?.sales ?? row.sales;
            const expense = mission?.expense ?? row.cost;
            const profit = mission?.profit ?? row.margin;
            return (
              <View
                key={row.id}
                style={[
                  hubStyles.salesTableRow,
                  idx === tableRows.length - 1 && hubStyles.salesTableRowLast,
                ]}
              >
                <View style={styles.clientTripsGrid}>
                  <View style={hubStyles.salesColTripRef}>
                    <SalesTripRefCell row={row} />
                  </View>
                  <View style={hubStyles.salesColLane}>
                    <SalesTripLaneCell row={row} />
                  </View>
                  <View style={hubStyles.salesGridNumCell}>
                    <SalesTripMoneyCell value={revenue} />
                  </View>
                  <View style={hubStyles.salesGridNumCell}>
                    <SalesTripMoneyCell value={expense} />
                  </View>
                  <View style={hubStyles.salesGridNumCell}>
                    <SalesTripMoneyCell value={profit} />
                  </View>
                  <View style={hubStyles.salesColStatus}>
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
      <View style={[hubStyles.salesBody, layout.salesBody]}>
        {!embedded ? (
          <View style={styles.pageIntroCompact}>
            <Text style={[styles.pageTitle, styles.pageTitleCompact]}>
              Finance analytics
            </Text>
            <Text style={[styles.pageSub, styles.pageSubCompact]}>
              {vehicleLabel} · revenue, cost, and utilization
            </Text>
          </View>
        ) : null}

        <View style={styles.mobileToolbar}>
          {periodFilters}
          {laneFilters}
          {filtersActive ? (
            <Pressable onPress={clearFilters} style={styles.mobileClearBtn}>
              <Text style={styles.mobileClearBtnText}>Clear all filters</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.mobileStack}>
          {vehicleSummaryCard ? (
            <View style={styles.mobileSection}>{vehicleSummaryCard}</View>
          ) : null}

          <View style={styles.mobileSection}>{kpiRow}</View>

          <View style={styles.mobileSection}>
            <View style={styles.chartStackMobile}>
              {revenueTrendCard}
              {laneMixCard}
              {loadTypesCard}
            </View>
          </View>

          <View style={styles.mobileSection}>
            <View style={styles.healthStackMobile}>
              {healthCard}
              {utilizationGaugeCard}
            </View>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.carousel}
          >
            <View style={[styles.carouselCard, { width: carouselCardWidth }]}>
              <View style={styles.carouselCardInner}>{laneContributionCard}</View>
            </View>
            <View style={[styles.carouselCard, { width: carouselCardWidth }]}>
              <View style={styles.carouselCardInner}>{expenseBucketsCard}</View>
            </View>
            <View style={[styles.carouselCard, { width: carouselCardWidth }]}>
              <View style={styles.carouselCardInner}>{profitTrendCard}</View>
            </View>
          </ScrollView>

          {tripsBlock}
          {insightsBlock ? <View style={styles.mobileSection}>{insightsBlock}</View> : null}
        </View>
      </View>
    );
  }

  return (
    <View style={[hubStyles.salesBody, styles.bodyDesktop]}>
      <View style={[styles.pageIntro, styles.pageIntroDesktop]}>
        <Text style={styles.pageTitle}>Vehicle finance analytics</Text>
        <Text style={styles.pageSub}>
          {vehicleLabel} · revenue, cost, and utilization
        </Text>
      </View>

      <View style={hubStyles.splitRow}>
        <View style={[hubStyles.sidebar, styles.desktopSidebar]}>
          <View style={[hubStyles.salesCard, hubStyles.salesCardPad]}>
            <Text style={hubStyles.cardTitle}>Intelligent filters</Text>
            <Text style={hubStyles.salesFilterHint}>
              Cross-filter charts and trips like Connection sales
            </Text>
            <Text style={hubStyles.salesFilterGroup}>Period</Text>
            {periodFilters}
            {lanes.length > 0 ? (
              <>
                <Text style={hubStyles.salesFilterGroup}>Lanes</Text>
                {laneFilters}
              </>
            ) : null}
            {filtersActive ? (
              <Pressable onPress={clearFilters} style={hubStyles.salesClearBtn}>
                <Text style={hubStyles.salesClearBtnText}>Clear all filters</Text>
              </Pressable>
            ) : null}
          </View>

          <View style={[hubStyles.salesCard, hubStyles.salesCardPad]}>
            <Text style={hubStyles.cardTitle}>Top lanes</Text>
            {lanes.slice(0, 4).map((lane, idx) => (
              <Pressable
                key={lane.id}
                style={[
                  hubStyles.salesContributorRow,
                  idx === Math.min(3, lanes.length - 1) &&
                    hubStyles.salesContributorRowLast,
                ]}
                onPress={() =>
                  setLaneFilter((prev) => (prev === lane.label ? null : lane.label))
                }
              >
                <View style={styles.kpiIconWrapLane}>
                  <ClientAnalyticsKpiLottie
                    source={VEHICLE_ANALYTICS_LOTTIE.lanes}
                    size={32}
                  />
                </View>
                <View style={hubStyles.salesContributorTextCol}>
                  <Text style={hubStyles.salesContributorName} numberOfLines={2}>
                    {lane.label}
                  </Text>
                  <Text style={hubStyles.salesContributorMeta}>
                    {lane.trips} trips · {formatINRChip(lane.revenue)}
                  </Text>
                </View>
              </Pressable>
            ))}
            {lanes.length === 0 ? (
              <Text style={hubStyles.salesEmptySide}>No lane data yet.</Text>
            ) : null}
          </View>

          {vehicleSummaryCard}
          {insightsBlock}
        </View>

        <View style={[hubStyles.mainCol, styles.desktopMainCol]}>
          {kpiRow}

          <View style={hubStyles.salesWidgetRow}>
            {revenueTrendCard}
            {laneMixCard}
            {loadTypesCard}
          </View>

          <View style={hubStyles.salesBarRowDual}>
            {healthCard}
            {utilizationGaugeCard}
          </View>

          <View style={hubStyles.salesBarRow}>
            {laneContributionCard}
            {expenseBucketsCard}
            {profitTrendCard}
          </View>

          {tripsBlock}
        </View>
      </View>
    </View>
  );
}
