/**
 * Supplier finance analytics — responsive Metronic BI (matches client dashboard).
 */
import { PartyAvatar } from "@/components/PartyAvatar";
import { RiskMeter } from "@/components/analytics/RiskMeter";
import { TrendBarChart, type TrendPoint } from "@/components/analytics";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import {
  computeSupplierReliabilityScore,
  deriveSupplierBadges,
  scoreLevelFromValue,
  type SupplierReliabilityScore,
} from "@/features/analytics";
import { ClientAnalyticsInsightRow } from "@/features/clients/components/analytics/ClientAnalyticsInsightRow";
import { ClientAnalyticsKpiLottie } from "@/features/clients/components/analytics/ClientAnalyticsKpiLottie";
import { clientFinanceAnalyticsStyles as supplierStyles } from "@/features/clients/components/analytics/clientFinanceAnalytics.styles";
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
import { SUPPLIER_ANALYTICS_LOTTIE } from "@/features/suppliers/components/analytics/supplierAnalyticsAssets";
import { SupplierAnalyticsMobileTripCard } from "@/features/suppliers/components/analytics/SupplierAnalyticsMobileTripCard";
import {
  computeSupplierFinancialMetrics,
  computeSupplierKpiHeader,
  computeSupplierLaneBreakdown,
  computeSupplierLoadTypeBreakdown,
  computeSupplierMonthlyTrend,
  computeSupplierOperationalMetrics,
  computeSupplierPayableAging,
  computeSupplierPricingStability,
  deriveSupplierInsights,
  type SupplierMonthlyTrendPoint,
} from "@/features/suppliers/components/analytics/supplierAnalyticsUtils";
import type { SupplierRow } from "@/features/suppliers/services/suppliers.service";
import type { TripRow } from "@/features/trips/services/trips.service";
import { getTripOperationalDisplay } from "@/features/operations/display";
import { formatINRChip } from "@/lib/format";
import { useSupplierReliabilityScoreQuery } from "@/lib/queries/useAnalyticsQueries";
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

export type SupplierAnalyticsDateRange = "3m" | "6m" | "12m" | "all";

type Props = {
  supplier: SupplierRow | null;
  trips: TripRow[];
  transactions: LedgerRow[];
  orgId: string | null;
  embedded?: boolean;
};

const DATE_RANGES: { id: SupplierAnalyticsDateRange; label: string }[] = [
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
  range: SupplierAnalyticsDateRange,
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
    case "preferred":
      return "Preferred vendor";
    case "high_risk":
      return "High risk";
    case "reliable":
      return "Reliable";
    case "low_quality":
      return "Low quality";
    case "best_value":
      return "Best value";
    case "frequent_canceller":
      return "Cancels often";
    default:
      return b.replace(/_/g, " ");
  }
}

function toTrendPoints(months: readonly SupplierMonthlyTrendPoint[]): SalesTrendPoint[] {
  return months.map((m) => ({
    monthKey: m.monthKey,
    label: m.label,
    trips: m.payable,
    revenue: m.payable,
  }));
}

function toPayableLinePoints(
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
          supplierStyles.mobileFilterChip,
          active && supplierStyles.mobileFilterChipOn,
        ]}
      >
        <Text
          style={[
            supplierStyles.mobileFilterChipText,
            active && supplierStyles.mobileFilterChipTextOn,
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
  solo,
}: {
  label: string;
  value: string;
  sub?: string;
  lottie: ReactNode;
  valueColor?: string;
  compact?: boolean;
  wide?: boolean;
  solo?: boolean;
}) {
  return (
    <View
      style={[
        styles.salesKpiCard,
        compact && supplierStyles.kpiCardMobile,
        compact && (solo || wide) && supplierStyles.kpiCardMobileWide,
        compact && solo && supplierStyles.kpiCardMobileSolo,
      ]}
    >
      <View style={supplierStyles.kpiIconWrap}>{lottie}</View>
      <Text style={[styles.salesKpiValue, valueColor ? { color: valueColor } : null]}>
        {value}
      </Text>
      <Text style={[styles.salesKpiLabel, compact && supplierStyles.kpiLabelMobile]}>
        {label}
      </Text>
      {sub ? (
        <Text style={[styles.salesKpiSub, compact && supplierStyles.kpiSubMobile]}>
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
        compact && supplierStyles.chartCardMobile,
        shellStyle,
      ]}
    >
      <Text style={styles.salesCardTitle}>{title}</Text>
      {subtitle ? <Text style={styles.salesWidgetSub}>{subtitle}</Text> : null}
      {children}
    </View>
  );
}

export function SupplierFinanceAnalyticsDashboard({
  supplier,
  trips,
  transactions,
  orgId,
  embedded = false,
}: Props) {
  const layout = useProfileHubCompactLayout();
  const compact = layout.compact;
  const { width } = useWindowDimensions();
  const carouselCardWidth = Math.min(300, width - Layout.screenPaddingHorizontal * 2 - 12);

  const [dateRange, setDateRange] = useState<SupplierAnalyticsDateRange>("12m");
  const [laneFilter, setLaneFilter] = useState<string | null>(null);
  const [monthKey, setMonthKey] = useState<string | null>(null);
  const [tableSearch, setTableSearch] = useState("");
  const [trendChartWidth, setTrendChartWidth] = useState(compact ? width - 48 : 320);
  const [laneChartWidth, setLaneChartWidth] = useState(compact ? carouselCardWidth - 24 : 200);

  const supplierId = supplier?.id ?? null;

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

  const { data: serverScore } = useSupplierReliabilityScoreQuery(orgId, supplierId);

  const localScore: SupplierReliabilityScore | null = useMemo(() => {
    if (serverScore || !supplierId) return null;
    return computeSupplierReliabilityScore(
      supplierId,
      scopedTrips.map((t) => ({
        id: t.id,
        supplier_id: t.supplier_id,
        supplier_rate: Number(t.supplier_rate ?? 0),
        status: t.status,
        pickup_date: t.pickup_date,
        completed_at: t.completed_at,
        created_at: t.created_at,
      })),
    );
  }, [serverScore, supplierId, scopedTrips]);

  const score = serverScore ?? localScore;
  const badges = useMemo(() => deriveSupplierBadges(score), [score]);
  const primaryBadge = badges[0] ? badgeLabel(badges[0]) : undefined;

  const kpis = useMemo(
    () => computeSupplierKpiHeader(scopedTrips, scopedTx, { score }),
    [scopedTrips, scopedTx, score],
  );
  const monthly = useMemo(
    () => computeSupplierMonthlyTrend(scopedTrips, scopedTx, { monthsBack: 12 }),
    [scopedTrips, scopedTx],
  );
  const financial = useMemo(
    () => computeSupplierFinancialMetrics(scopedTrips, scopedTx),
    [scopedTrips, scopedTx],
  );
  const operations = useMemo(
    () => computeSupplierOperationalMetrics(scopedTrips, scopedTx),
    [scopedTrips, scopedTx],
  );
  const lanes = useMemo(
    () => computeSupplierLaneBreakdown(scopedTrips, { topN: 6 }),
    [scopedTrips],
  );
  const loadTypes = useMemo(
    () => computeSupplierLoadTypeBreakdown(scopedTrips, { topN: 5 }),
    [scopedTrips],
  );
  const aging = useMemo(
    () => computeSupplierPayableAging(scopedTrips, scopedTx),
    [scopedTrips, scopedTx],
  );

  const settlementPct = useMemo(() => {
    const total = financial.payable;
    const paid = financial.paid;
    return total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;
  }, [financial.paid, financial.payable]);

  const trend = useMemo(() => toTrendPoints(monthly), [monthly]);

  const laneSlices: SalesSlice[] = useMemo(
    () =>
      lanes.map((l, i) => ({
        label: laneChipLabel(l.label),
        value: l.payable,
        color: DONUT_COLORS[i % DONUT_COLORS.length],
      })),
    [lanes],
  );

  const loadSlices: SalesSlice[] = useMemo(
    () =>
      loadTypes.map((l, i) => ({
        label: l.label,
        value: l.payable,
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
        value: l.payable,
        revenue: l.payable,
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
        const cost = Number(t.supplier_rate ?? 0);
        const pickup = (t.pickup_area ?? "").trim();
        const drop = (t.drop_location ?? "").trim();
        const lane =
          pickup && drop ? `${pickup} → ${drop}` : pickup || drop || "—";
        return {
          id: t.id,
          tripRef: getTripOperationalDisplay({ trip_number: t.trip_number ?? null }),
          lane,
          clientName: "—",
          supplierName: supplier?.name ?? "—",
          sales: cost,
          cost,
          margin: Number(t.margin ?? 0),
          marginPct: 0,
          dateLabel: null,
          statusLabel: (t.status ?? "—").replace(/_/g, " ").toUpperCase(),
          trip: t,
        };
      });
  }, [scopedTrips, tableSearch, supplier?.name]);

  const pricing = useMemo(
    () => computeSupplierPricingStability(scopedTrips, { topLanes: 5 }),
    [scopedTrips],
  );

  const insights = useMemo(
    () => deriveSupplierInsights(monthly, kpis, operations, pricing, financial),
    [monthly, kpis, operations, pricing, financial],
  );

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
    : [];

  const clearFilters = () => {
    setLaneFilter(null);
    setMonthKey(null);
    setTableSearch("");
  };

  const filtersActive = Boolean(laneFilter || monthKey || tableSearch.trim());

  const setDateRangeAndResetMonth = (range: SupplierAnalyticsDateRange) => {
    setDateRange(range);
    setMonthKey(null);
  };

  const periodFilters = (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={
        compact ? supplierStyles.mobileFilterScroll : styles.tagWrap
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
          compact ? supplierStyles.mobileFilterScroll : styles.tagWrap
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
    <View style={compact ? supplierStyles.kpiGridMobile : styles.salesKpiRow}>
      <KpiCard
        compact={compact}
        label="Total cost"
        value={formatINRChip(financial.payable)}
        sub={`Paid ${formatINRChip(financial.paid)} · Due ${formatINRChip(financial.outstanding)}`}
        lottie={
          <ClientAnalyticsKpiLottie source={SUPPLIER_ANALYTICS_LOTTIE.cost} size={40} />
        }
      />
      <KpiCard
        compact={compact}
        label="Margin contribution"
        value={formatINRChip(financial.marginContribution)}
        sub={`${financial.marginContributionPct.toFixed(1)}% on revenue handled`}
        valueColor={
          financial.marginContribution >= 0 ? Theme.positive : Theme.negative
        }
        lottie={
          <ClientAnalyticsKpiLottie source={SUPPLIER_ANALYTICS_LOTTIE.margin} size={40} />
        }
      />
      <KpiCard
        compact={compact}
        label="Settlement rate"
        value={`${settlementPct}%`}
        sub="Paid vs total payable"
        valueColor={
          settlementPct >= 80
            ? Theme.positive
            : settlementPct >= 50
              ? Theme.warning
              : Theme.negative
        }
        lottie={
          <ClientAnalyticsKpiLottie
            source={SUPPLIER_ANALYTICS_LOTTIE.settlement}
            size={40}
          />
        }
      />
      <KpiCard
        compact={compact}
        label="Trips executed"
        value={String(operations.tripsCompleted)}
        sub={`${operations.onTimePct}% on-time · ${operations.completionPct.toFixed(0)}% completion`}
        lottie={
          <ClientAnalyticsKpiLottie source={SUPPLIER_ANALYTICS_LOTTIE.trips} size={40} />
        }
      />
    </View>
  );

  const healthCard = (
    <View
      style={[
        styles.salesCard,
        styles.salesCardPadTight,
        compact && supplierStyles.healthCardMobile,
      ]}
    >
      <View style={supplierStyles.healthHeader}>
        <ClientAnalyticsKpiLottie
          source={SUPPLIER_ANALYTICS_LOTTIE.reliability}
          size={32}
        />
        <Text style={styles.salesCardTitle}>Reliability score</Text>
      </View>
      {score ? (
        <>
          <View style={supplierStyles.healthScoreRow}>
            <Text
              style={[
                supplierStyles.healthScore,
                compact && supplierStyles.healthScoreCompact,
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
              style={[
                supplierStyles.healthScoreMax,
                compact && supplierStyles.healthScoreMaxCompact,
              ]}
            >
              / 100
            </Text>
          </View>
          <Text style={styles.salesWidgetSub}>
            {score.breakdown.tripsTotal} trips · last 6 months
          </Text>
          {healthBars.map((bar) => (
            <View key={bar.label} style={supplierStyles.healthBarRow}>
              <Text
                style={[
                  supplierStyles.healthBarLabel,
                  compact && supplierStyles.healthBarLabelCompact,
                ]}
              >
                {bar.label}
              </Text>
              <View style={supplierStyles.healthBarTrack}>
                <View
                  style={[
                    supplierStyles.healthBarFill,
                    {
                      width: `${Math.max(0, Math.min(100, bar.percent))}%`,
                      backgroundColor:
                        bar.color ??
                        (bar.percent < 40 ? Theme.warning : METRONIC.link),
                    },
                  ]}
                />
              </View>
              <Text style={supplierStyles.healthBarValue}>{Math.round(bar.percent)}</Text>
            </View>
          ))}
        </>
      ) : (
        <Text style={styles.salesEmptySide}>
          Not enough trip history for a reliability score.
        </Text>
      )}
    </View>
  );

  const onTimeGaugeCard = (
    <View
      style={[
        styles.salesCard,
        styles.salesCardPadTight,
        supplierStyles.gaugeCard,
        !compact && supplierStyles.gaugeCardDesktop,
      ]}
    >
      <Text style={[styles.salesCardTitle, compact && { textAlign: "center" }]}>
        On-time availability
      </Text>
      <View style={supplierStyles.gaugeBody}>
        <RiskMeter
          value={kpis.onTimePct}
          level={scoreLevelFromValue(kpis.onTimePct)}
          label="On-time availability"
          caption={`${operations.onTime}/${operations.onTimeEligible} eligible trips`}
          size={compact ? 112 : 128}
          stroke={compact ? 9 : 10}
        />
      </View>
    </View>
  );

  const payableTrendCard = (
    <ChartShell
      compact={compact}
      shellStyle={!compact ? styles.salesWidgetTrend : undefined}
      title="Payable trend"
      subtitle="Supplier cost by month · tap to filter trips"
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
          footerText="Payable by lane · tap to cross-filter"
        />
      </View>
    </ChartShell>
  );

  const agingCard = (
    <ChartShell
      compact={compact}
      shellStyle={!compact ? styles.salesBarOrigin : undefined}
      title="Payable aging"
    >
      <View style={styles.salesWidgetDonutBody}>
        <NetworkDesktopSalesDonut
          slices={agingSlices}
          emptyMessage="No outstanding payable aging."
        />
      </View>
    </ChartShell>
  );

  const settlementsCard = (
    <ChartShell
      compact={compact}
      shellStyle={!compact ? styles.salesBarOrigin : undefined}
      title="Settlements"
    >
      <TrendBarChart
        data={toPayableLinePoints(monthly)}
        width={Math.max(180, laneChartWidth)}
        height={compact ? 132 : 140}
        primaryField="revenue"
        secondaryField="expense"
        primaryColor={Theme.chartSeries2}
        secondaryColor={Theme.chartSeries4}
      />
    </ChartShell>
  );

  const supplierSummaryCard = supplier ? (
    <View
      style={[
        styles.salesCard,
        styles.salesCardPad,
        compact && supplierStyles.sectionCardMobile,
      ]}
    >
      <View style={styles.salesContributorRow}>
        <PartyAvatar
          name={supplier.name ?? "Supplier"}
          initialsColorSeed={supplier.id}
          avatarUrl={supplier.avatar_url}
          avatarSeed={supplier.avatar_seed}
          entityType="supplier"
          size={compact ? 40 : 36}
        />
        <View style={styles.salesContributorTextCol}>
          <Text style={styles.salesContributorName} numberOfLines={2}>
            {supplier.name}
          </Text>
          <Text style={styles.salesContributorMeta}>
            {operations.tripsTotal} trips · {settlementPct}% settled
          </Text>
        </View>
      </View>
      {primaryBadge ? (
        <View style={supplierStyles.healthBadge}>
          <Text style={supplierStyles.healthBadgeText}>{primaryBadge}</Text>
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
          supplierStyles.insightsCard,
          !compact && supplierStyles.insightsCardDesktop,
          compact && supplierStyles.sectionCardMobile,
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

  const paidByTrip = useMemo(() => {
    const map = new Map<string, number>();
    const tripIds = new Set(scopedTrips.map((t) => t.id));
    for (const tx of scopedTx) {
      if (!tx.trip_id || !tripIds.has(tx.trip_id)) continue;
      const amt = Number(tx.amount_out ?? 0);
      if (amt <= 0) continue;
      map.set(tx.trip_id, (map.get(tx.trip_id) ?? 0) + amt);
    }
    return map;
  }, [scopedTrips, scopedTx]);

  const tripsBlock = compact ? (
    <View style={supplierStyles.tripsSectionMobile}>
      <View style={supplierStyles.sectionCardMobile}>
        <Text style={styles.salesCardTitle}>Trips</Text>
        <Text style={styles.salesTripTableSub}>
          {filtersActive
            ? "Filtered by period, lane, or month"
            : "All supplier trips in period"}
        </Text>
        <View style={supplierStyles.tripsSearchMobile}>
          <Search size={16} color={METRONIC.muted} />
          <TextInput
            style={supplierStyles.tripsSearchInput}
            placeholder="Search trips, lanes…"
            placeholderTextColor={METRONIC.muted}
            value={tableSearch}
            onChangeText={setTableSearch}
          />
        </View>
      </View>

      {tableRows.length === 0 ? (
        <View style={supplierStyles.tripsEmpty}>
          <ClientAnalyticsKpiLottie
            source={SUPPLIER_ANALYTICS_LOTTIE.trips}
            size={72}
          />
          <Text style={supplierStyles.tripsEmptyText}>No trips match filters.</Text>
        </View>
      ) : (
        <View style={supplierStyles.tripsListMobile}>
          {tableRows.map((row) => {
            const paid = paidByTrip.get(row.id) ?? 0;
            const due = Math.max(0, row.cost - paid);
            return (
              <SupplierAnalyticsMobileTripCard
                key={row.id}
                row={row}
                paid={paid}
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
              : "All supplier trips in period"}
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
          <View style={supplierStyles.clientTripsGrid}>
            <Text style={[styles.salesTableHeadCell, styles.salesColTripRef]}>
              Trip
            </Text>
            <Text style={[styles.salesTableHeadCell, styles.salesColLane]}>
              Lane
            </Text>
            <Text style={[styles.salesTableHeadCell, styles.salesGridNumHead]}>
              Cost
            </Text>
            <Text style={[styles.salesTableHeadCell, styles.salesGridNumHead]}>
              Paid
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
          <View style={supplierStyles.tripsEmpty}>
            <ClientAnalyticsKpiLottie
              source={SUPPLIER_ANALYTICS_LOTTIE.trips}
              size={72}
            />
            <Text style={supplierStyles.tripsEmptyText}>No trips match filters.</Text>
          </View>
        ) : (
          tableRows.map((row, idx) => {
            const paid = paidByTrip.get(row.id) ?? 0;
            const due = Math.max(0, row.cost - paid);
            return (
              <View
                key={row.id}
                style={[
                  styles.salesTableRow,
                  idx === tableRows.length - 1 && styles.salesTableRowLast,
                ]}
              >
                <View style={supplierStyles.clientTripsGrid}>
                  <View style={styles.salesColTripRef}>
                    <SalesTripRefCell row={row} />
                  </View>
                  <View style={styles.salesColLane}>
                    <SalesTripLaneCell row={row} />
                  </View>
                  <View style={styles.salesGridNumCell}>
                    <SalesTripMoneyCell value={row.cost} />
                  </View>
                  <View style={styles.salesGridNumCell}>
                    <SalesTripMoneyCell value={paid} />
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
        {!embedded ? (
          <View style={supplierStyles.pageIntroCompact}>
            <Text style={[supplierStyles.pageTitle, supplierStyles.pageTitleCompact]}>
              Finance analytics
            </Text>
            <Text style={[supplierStyles.pageSub, supplierStyles.pageSubCompact]}>
              {supplier?.name ?? "Payable, settlement, and trip performance"}
            </Text>
          </View>
        ) : null}

        <View style={supplierStyles.mobileToolbar}>
          {periodFilters}
          {laneFilters}
          {filtersActive ? (
            <Pressable onPress={clearFilters} style={supplierStyles.mobileClearBtn}>
              <Text style={supplierStyles.mobileClearBtnText}>Clear all filters</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={supplierStyles.mobileStack}>
          {supplierSummaryCard ? (
            <View style={supplierStyles.mobileSection}>{supplierSummaryCard}</View>
          ) : null}

          <View style={supplierStyles.mobileSection}>{kpiRow}</View>

          <View style={supplierStyles.mobileSection}>
            <View style={supplierStyles.chartStackMobile}>
              {payableTrendCard}
              {laneMixCard}
              {loadTypesCard}
            </View>
          </View>

          <View style={supplierStyles.mobileSection}>
            <View style={supplierStyles.healthStackMobile}>
              {healthCard}
              {onTimeGaugeCard}
            </View>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={supplierStyles.carousel}
          >
            <View style={[supplierStyles.carouselCard, { width: carouselCardWidth }]}>
              <View style={supplierStyles.carouselCardInner}>{laneContributionCard}</View>
            </View>
            <View style={[supplierStyles.carouselCard, { width: carouselCardWidth }]}>
              <View style={supplierStyles.carouselCardInner}>{agingCard}</View>
            </View>
            <View style={[supplierStyles.carouselCard, { width: carouselCardWidth }]}>
              <View style={supplierStyles.carouselCardInner}>{settlementsCard}</View>
            </View>
          </ScrollView>

          {tripsBlock}
          {insightsBlock ? (
            <View style={supplierStyles.mobileSection}>{insightsBlock}</View>
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.salesBody, supplierStyles.bodyDesktop]}>
      <View style={[supplierStyles.pageIntro, supplierStyles.pageIntroDesktop]}>
        <Text style={supplierStyles.pageTitle}>Supplier finance analytics</Text>
        <Text style={supplierStyles.pageSub}>
          {supplier?.name
            ? `${supplier.name} · payable, settlement, and trip performance`
            : "Payable, settlement, and trip performance"}
        </Text>
      </View>

      <View style={styles.splitRow}>
        <View style={[styles.sidebar, supplierStyles.desktopSidebar]}>
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
                <View style={supplierStyles.kpiIconWrapLane}>
                  <ClientAnalyticsKpiLottie
                    source={SUPPLIER_ANALYTICS_LOTTIE.lanes}
                    size={32}
                  />
                </View>
                <View style={styles.salesContributorTextCol}>
                  <Text style={styles.salesContributorName} numberOfLines={2}>
                    {lane.label}
                  </Text>
                  <Text style={styles.salesContributorMeta}>
                    {lane.trips} trips · {formatINRChip(lane.payable)}
                  </Text>
                </View>
              </Pressable>
            ))}
            {lanes.length === 0 ? (
              <Text style={styles.salesEmptySide}>No lane data yet.</Text>
            ) : null}
          </View>

          {supplierSummaryCard}
          {insightsBlock}
        </View>

        <View style={[styles.mainCol, supplierStyles.desktopMainCol]}>
          {kpiRow}

          <View style={styles.salesWidgetRow}>
            {payableTrendCard}
            {laneMixCard}
            {loadTypesCard}
          </View>

          <View style={styles.salesBarRowDual}>
            {healthCard}
            {onTimeGaugeCard}
          </View>

          <View style={styles.salesBarRow}>
            {laneContributionCard}
            {agingCard}
            {settlementsCard}
          </View>

          {tripsBlock}
        </View>
      </View>
    </View>
  );
}
