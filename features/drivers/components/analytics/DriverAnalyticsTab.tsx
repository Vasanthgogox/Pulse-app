/**
 * Driver Performance Analytics tab.
 *
 * Receives already-loaded data from DriverDetailScreen — no new fetches.
 * All analytics derived client-side via useMemo for instant render.
 *
 * Sections (flat — rendered inside the parent tab's ScrollView):
 *   Period picker → KPI grid → Earnings trend → Revenue trend
 *   → Trips/KM bars → Payment Intelligence → Vehicle Operations
 *   → Performance Score → Document Compliance
 */
import React, { memo, useMemo, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { formatINR, formatINRChip } from "@/lib/format";
import type { TripRow } from "@/features/trips/services/trips.service";
import type { LedgerRow } from "@/features/finance";
import type { SalaryRequestRow } from "@/features/drivers/services/salaryRequests.service";
import type { DriverRow } from "../../services/drivers.service";
import type { RatingRow } from "@/features/ratings";
// Reuse SVG chart primitives from vehicle analytics (same app, same dep)
import {
  LineChart,
  RevExpBarChart,
  UtilizationRing,
} from "@/features/vehicles/components/analytics/AnalyticsChart";
import {
  computeDocCompliance,
  computeDriverKpiSummary,
  computeDriverPeriodPoints,
  computePaymentSummary,
  computeVehicleOpStats,
  type AnalyticsPeriod,
  type DocStatus,
  type PaymentMonthRow,
  type DriverOffer,
  type PeriodPoint,
  type VehicleOpStat,
} from "./driverAnalyticsUtils";

// ─── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  trips: TripRow[];
  driverTransactions: LedgerRow[];
  driverRequests: SalaryRequestRow[];
  driver: DriverRow | null;
  driverOffer: DriverOffer | null;
  driverRatings: RatingRow[];
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const PERIOD_OPTIONS: Array<{ value: AnalyticsPeriod; label: string }> = [
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly" },
  { value: "lifetime", label: "Lifetime" },
];

// Convert PeriodPoints to the shape expected by vehicle chart primitives
function toRevExpPoints(pts: PeriodPoint[]) {
  return pts.map((p) => ({
    label: p.label,
    revenue: p.revenue,
    expense: p.earnings,   // show earnings as the "expense" slot for comparison
    profit: p.revenue - p.earnings,
    margin: p.revenue > 0 ? ((p.revenue - p.earnings) / p.revenue) * 100 : 0,
    tripCount: p.tripCount,
  }));
}

function toLinePoints(pts: PeriodPoint[], field: "earnings" | "paid") {
  return pts.map((p) => ({
    label: p.label,
    revenue: p[field],
    expense: 0,
    profit: 0,
    margin: 0,
    tripCount: p.tripCount,
  }));
}

// ─── Section header ────────────────────────────────────────────────────────────

function SectionHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <View style={secStyles.wrap}>
      <Text style={secStyles.title}>{title}</Text>
      {sub ? <Text style={secStyles.sub}>{sub}</Text> : null}
    </View>
  );
}
const secStyles = StyleSheet.create({
  wrap: { gap: 1, marginBottom: 10 },
  title: {
    fontSize: 13,
    fontWeight: "800",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.3,
    textTransform: "uppercase",
  },
  sub: { fontSize: 10, fontWeight: "600", color: Theme.textMuted },
});

// ─── Chart card wrapper ────────────────────────────────────────────────────────

function ChartCard({
  title,
  legend,
  children,
}: {
  title: string;
  legend?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <View style={cardStyles.card}>
      <View style={cardStyles.header}>
        <Text style={cardStyles.title}>{title}</Text>
        {legend}
      </View>
      {children}
    </View>
  );
}
const cardStyles = StyleSheet.create({
  card: {
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 24,
    padding: 16,
    marginBottom: 14,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  title: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimary,
    letterSpacing: 0.2,
  },
});

// ─── KPI Card ─────────────────────────────────────────────────────────────────

interface KpiCardProps {
  id?: string;
  label: string;
  value: string;
  sub?: string;
  accent?: string;
  alert?: boolean;
}

const KpiCard = memo(function KpiCard({ label, value, sub, accent, alert }: KpiCardProps) {
  return (
    <View
      style={[
        kpiStyles.card,
        alert && kpiStyles.cardAlert,
        accent ? { borderLeftWidth: 3, borderLeftColor: accent } : undefined,
      ]}
    >
      <Text style={kpiStyles.label}>{label}</Text>
      <Text
        style={[kpiStyles.value, accent ? { color: accent } : undefined]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
      {sub ? <Text style={kpiStyles.sub} numberOfLines={1}>{sub}</Text> : null}
    </View>
  );
});
const kpiStyles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 3,
    minHeight: 82,
    justifyContent: "flex-end",
  },
  cardAlert: {
    backgroundColor: "rgba(232,33,39,0.04)",
    borderColor: "rgba(232,33,39,0.20)",
  },
  label: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  value: {
    fontSize: 20,
    fontWeight: "800",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.5,
    paddingLeft: Layout.currencyTextPaddingStart,
  },
  sub: { fontSize: 10, fontWeight: "600", color: Theme.textMuted },
});

// ─── Performance Score Meter ───────────────────────────────────────────────────

function PerformanceMeter({ score }: { score: number }) {
  const color =
    score >= 75 ? Theme.darkGreen : score >= 50 ? Theme.warning : Theme.teslaRed;
  const tier =
    score >= 80
      ? { label: "Elite", bg: "#FEF3C7", text: "#B45309" }
      : score >= 65
        ? { label: "Reliable", bg: Theme.positiveMuted, text: Theme.darkGreen }
        : score >= 45
          ? { label: "Average", bg: Theme.warningMuted, text: Theme.warning }
          : { label: "At Risk", bg: "rgba(232,33,39,0.10)", text: Theme.teslaRed };

  return (
    <View style={meterStyles.wrap}>
      <View style={meterStyles.ringRow}>
        <View style={meterStyles.ringWrap}>
          <UtilizationRing pct={score} size={88} color={color} />
          <View style={meterStyles.center}>
            <Text style={[meterStyles.scoreNum, { color }]}>{score}</Text>
            <Text style={meterStyles.scoreSub}>/ 100</Text>
          </View>
        </View>
        <View style={meterStyles.info}>
          <View style={[meterStyles.tierBadge, { backgroundColor: tier.bg }]}>
            <Text style={[meterStyles.tierText, { color: tier.text }]}>
              {tier.label}
            </Text>
          </View>
          <Text style={meterStyles.scoreLine}>Performance Score</Text>
          <Text style={meterStyles.scoreDesc}>
            Composite: settlement × 40% + delivery × 30% + rating × 30%
          </Text>
        </View>
      </View>
      {/* Score bar breakdown */}
      <View style={meterStyles.barRow}>
        <View style={meterStyles.barFill}>
          <View
            style={[
              meterStyles.barSegment,
              { width: `${Math.min(100, score)}%`, backgroundColor: color },
            ]}
          />
        </View>
      </View>
    </View>
  );
}
const meterStyles = StyleSheet.create({
  wrap: { gap: 12 },
  ringRow: { flexDirection: "row", alignItems: "center", gap: 16 },
  ringWrap: {
    width: 88,
    height: 88,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  center: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  scoreNum: {
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  scoreSub: { fontSize: 9, fontWeight: "600", color: Theme.textMuted },
  info: { flex: 1, gap: 5 },
  tierBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  tierText: { fontSize: 11, fontWeight: "800", letterSpacing: 0.2 },
  scoreLine: {
    fontSize: 13,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
  },
  scoreDesc: {
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textMuted,
    lineHeight: 14,
  },
  barRow: {},
  barFill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: Theme.surfaceGray,
    overflow: "hidden",
  },
  barSegment: { height: 6, borderRadius: 3 },
});

// ─── Vehicle operation row ─────────────────────────────────────────────────────

const VehicleRow = memo(function VehicleRow({
  stat,
  rank,
}: {
  stat: VehicleOpStat;
  rank: number;
}) {
  const margin =
    stat.revenue > 0 ? ((stat.revenue - stat.earnings) / stat.revenue) * 100 : 0;
  return (
    <View style={vehStyles.row}>
      <View style={vehStyles.rank}>
        <Text style={vehStyles.rankNum}>#{rank}</Text>
      </View>
      <View style={vehStyles.body}>
        <Text style={vehStyles.vnum} numberOfLines={1}>
          {stat.vehicleNumber}
        </Text>
        <Text style={vehStyles.trips}>{stat.tripCount} trips</Text>
      </View>
      <View style={vehStyles.stat}>
        <Text style={vehStyles.statVal}>{formatINRChip(stat.revenue)}</Text>
        <Text style={vehStyles.statLbl}>Revenue</Text>
      </View>
      <View style={vehStyles.stat}>
        <Text style={vehStyles.statVal}>{formatINRChip(stat.earnings)}</Text>
        <Text style={vehStyles.statLbl}>Earnings</Text>
      </View>
      <View style={vehStyles.stat}>
        <Text
          style={[
            vehStyles.statVal,
            { color: margin >= 0 ? Theme.darkGreen : Theme.teslaRed },
          ]}
        >
          {margin.toFixed(0)}%
        </Text>
        <Text style={vehStyles.statLbl}>Margin</Text>
      </View>
    </View>
  );
});
const vehStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    gap: 6,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  rank: { width: 28 },
  rankNum: { fontSize: 11, fontWeight: "700", color: Theme.textMuted },
  body: { flex: 1, minWidth: 0, gap: 1 },
  vnum: { fontSize: 12, fontWeight: "700", color: Theme.textPrimaryDark },
  trips: { fontSize: 9, fontWeight: "600", color: Theme.textMuted },
  stat: { width: 56, alignItems: "flex-end", gap: 1 },
  statVal: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  statLbl: { fontSize: 8, fontWeight: "600", color: Theme.textMuted },
});

// ─── Payment month row ─────────────────────────────────────────────────────────

const PaymentRow = memo(function PaymentRow({
  row,
  expanded,
  onToggle,
}: {
  row: PaymentMonthRow;
  expanded: boolean;
  onToggle: () => void;
}) {
  const balance = Math.max(0, row.salary + row.commission - row.paid);
  return (
    <>
      <TouchableOpacity
        style={payStyles.row}
        onPress={onToggle}
        activeOpacity={0.7}
      >
        <View style={payStyles.monthCell}>
          <Text style={payStyles.monthLabel} numberOfLines={1}>
            {row.label}
          </Text>
          {balance > 0 && (
            <View style={payStyles.pendingDot} />
          )}
        </View>
        <Text style={payStyles.cell}>{row.salary > 0 ? formatINRChip(row.salary) : "—"}</Text>
        <Text style={payStyles.cell}>{row.commission > 0 ? formatINRChip(row.commission) : "—"}</Text>
        <Text
          style={[
            payStyles.cell,
            { color: Theme.darkGreen, fontWeight: "800" },
          ]}
        >
          {row.paid > 0 ? formatINRChip(row.paid) : "—"}
        </Text>
        <Text
          style={[
            payStyles.cell,
            balance > 0 ? { color: Theme.teslaRed } : { color: Theme.textMuted },
          ]}
        >
          {balance > 0 ? formatINRChip(balance) : "✓"}
        </Text>
      </TouchableOpacity>
      {expanded && (
        <View style={payStyles.expandRow}>
          <View style={payStyles.expandItem}>
            <Text style={payStyles.expandLabel}>Fixed Salary</Text>
            <Text style={payStyles.expandValue}>{formatINR(row.salary)}</Text>
          </View>
          <View style={payStyles.expandItem}>
            <Text style={payStyles.expandLabel}>Commission</Text>
            <Text style={payStyles.expandValue}>{formatINR(row.commission)}</Text>
          </View>
          <View style={payStyles.expandItem}>
            <Text style={payStyles.expandLabel}>Total Due</Text>
            <Text style={payStyles.expandValue}>
              {formatINR(row.salary + row.commission)}
            </Text>
          </View>
          <View style={payStyles.expandItem}>
            <Text style={payStyles.expandLabel}>Paid</Text>
            <Text style={[payStyles.expandValue, { color: Theme.darkGreen }]}>
              {formatINR(row.paid)}
            </Text>
          </View>
          {balance > 0 && (
            <View style={payStyles.expandItem}>
              <Text style={payStyles.expandLabel}>Balance Due</Text>
              <Text style={[payStyles.expandValue, { color: Theme.teslaRed }]}>
                {formatINR(balance)}
              </Text>
            </View>
          )}
        </View>
      )}
    </>
  );
});
const payStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    gap: 4,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  monthCell: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    minWidth: 0,
  },
  monthLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  pendingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Theme.teslaRed,
  },
  cell: {
    flex: 1,
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    textAlign: "right",
  },
  expandRow: {
    backgroundColor: Theme.surfaceLight,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
  },
  expandItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  expandLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  expandValue: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
});

// ─── Document row ──────────────────────────────────────────────────────────────

const DocRow = memo(function DocRow({ doc }: { doc: DocStatus }) {
  return (
    <View style={docStyles.row}>
      <View
        style={[
          docStyles.bar,
          { backgroundColor: doc.present ? Theme.darkGreen : Theme.teslaRed },
        ]}
      />
      <View style={docStyles.body}>
        <Text style={docStyles.label}>{doc.label}</Text>
        <Text style={docStyles.note}>{doc.note}</Text>
      </View>
      <View
        style={[
          docStyles.badge,
          { backgroundColor: doc.present ? Theme.positiveMuted : "rgba(232,33,39,0.10)" },
        ]}
      >
        <Text
          style={[
            docStyles.badgeText,
            { color: doc.present ? Theme.darkGreen : Theme.teslaRed },
          ]}
        >
          {doc.present ? "On Record" : "Missing"}
        </Text>
      </View>
    </View>
  );
});
const docStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  bar: { width: 3, height: 36, borderRadius: 2, flexShrink: 0 },
  body: { flex: 1, minWidth: 0, gap: 2 },
  label: { fontSize: 12, fontWeight: "700", color: Theme.textPrimaryDark },
  note: { fontSize: 10, fontWeight: "600", color: Theme.textMuted },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeText: { fontSize: 8, fontWeight: "800", letterSpacing: 0.4 },
});

// ─── Section card wrapper ──────────────────────────────────────────────────────

function SectionCard({ children }: { children: React.ReactNode }) {
  return (
    <View style={sectionCardStyles.card}>{children}</View>
  );
}
const sectionCardStyles = StyleSheet.create({
  card: {
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 24,
    paddingHorizontal: 16,
    marginBottom: 28,
    overflow: "hidden",
  },
});

// ─── LegendChip ───────────────────────────────────────────────────────────────

function LegendChip({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: color }} />
      <Text style={{ fontSize: 9, fontWeight: "600", color: Theme.textMuted }}>
        {label}
      </Text>
    </View>
  );
}

// ─── Empty state ───────────────────────────────────────────────────────────────

function EmptyAnalytics() {
  return (
    <View style={emptyStyles.wrap}>
      <Text style={emptyStyles.icon}>📈</Text>
      <Text style={emptyStyles.title}>No trip data yet</Text>
      <Text style={emptyStyles.sub}>
        Performance analytics will appear once this driver has trips with
        financial records.
      </Text>
    </View>
  );
}
const emptyStyles = StyleSheet.create({
  wrap: {
    paddingVertical: 48,
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 24,
  },
  icon: { fontSize: 36 },
  title: {
    fontSize: 15,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    textAlign: "center",
  },
  sub: {
    fontSize: 12,
    color: Theme.textMuted,
    textAlign: "center",
    lineHeight: 18,
  },
});

// ─── Main component ────────────────────────────────────────────────────────────

export const DriverAnalyticsTab = memo(function DriverAnalyticsTab({
  trips,
  driverTransactions,
  driverRequests,
  driver,
  driverOffer,
  driverRatings,
}: Props) {
  const { width: windowWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [period, setPeriod] = useState<AnalyticsPeriod>("monthly");
  const [expandedMonthKey, setExpandedMonthKey] = useState<string | null>(null);

  const isTablet = windowWidth >= 640;
  const isDesktop = windowWidth >= 1024;
  const ITEMS_PER_ROW = isTablet ? 4 : 2;

  const chartWidth = Math.max(
    160,
    windowWidth - 2 * Layout.screenPaddingHorizontal - 32,
  );

  const chartH = isTablet ? 160 : 140;

  // ── Memoized analytics ──────────────────────────────────────────────────
  const kpi = useMemo(
    () =>
      computeDriverKpiSummary(
        trips,
        driverTransactions,
        driverRequests,
        driver,
        driverOffer,
        driverRatings,
      ),
    [trips, driverTransactions, driverRequests, driver, driverOffer, driverRatings],
  );

  const periodPoints = useMemo(
    () => computeDriverPeriodPoints(trips, driverTransactions, driverOffer, period),
    [trips, driverTransactions, driverOffer, period],
  );

  const vehicleStats = useMemo(
    () => computeVehicleOpStats(trips, driverOffer),
    [trips, driverOffer],
  );

  const paymentSummary = useMemo(
    () =>
      computePaymentSummary(
        trips,
        driverTransactions,
        driverRequests,
        driver,
        driverOffer,
      ),
    [trips, driverTransactions, driverRequests, driver, driverOffer],
  );

  const docCompliance = useMemo(
    () => computeDocCompliance(driver),
    [driver],
  );

  // Adapt period points for chart primitives
  const earningsLinePoints = useMemo(
    () => toLinePoints(periodPoints, "earnings"),
    [periodPoints],
  );
  const paidLinePoints = useMemo(
    () => toLinePoints(periodPoints, "paid"),
    [periodPoints],
  );
  const revExpPoints = useMemo(
    () => toRevExpPoints(periodPoints),
    [periodPoints],
  );

  const marginColor =
    kpi.totalRevenue > 0
      ? ((kpi.totalRevenue - kpi.totalEarnings) / kpi.totalRevenue) * 100 >= 20
        ? Theme.darkGreen
        : Theme.warning
      : Theme.textMuted;

  // ── KPI items array ──────────────────────────────────────────────────────
  const kpiItems = useMemo(() => [
    { id: "rev", label: "Revenue Generated", value: formatINRChip(kpi.totalRevenue), sub: `${kpi.tripsTotal} trips`, accent: Theme.primary },
    { id: "earn", label: "Total Earnings", value: formatINRChip(kpi.totalEarnings), sub: "Commission + Salary", accent: Theme.darkGreen },
    { id: "trips", label: "Trips Completed", value: String(kpi.tripsCompleted), sub: `of ${kpi.tripsTotal} assigned` },
    { id: "vehs", label: "Vehicles Operated", value: String(kpi.vehiclesOperated), sub: "Unique vehicles" },
    { id: "salary", label: "Monthly Salary", value: kpi.monthlySalary ? formatINRChip(kpi.monthlySalary) : "—", sub: kpi.monthlySalary ? "Fixed per month" : "Commission-based" },
    { id: "pending", label: "Pending Balance", value: kpi.pendingBalance > 0 ? formatINRChip(kpi.pendingBalance) : "₹ 0", sub: kpi.pendingBalance > 0 ? "Unpaid earnings" : "Fully settled", accent: kpi.pendingBalance > 0 ? Theme.teslaRed : Theme.darkGreen, alert: kpi.pendingBalance > 0 },
    { id: "settle", label: "Settlement Health", value: `${kpi.settlementHealth}%`, sub: kpi.settlementHealth >= 80 ? "Good" : kpi.settlementHealth >= 50 ? "Partial" : "Behind", accent: kpi.settlementHealth >= 80 ? Theme.darkGreen : kpi.settlementHealth >= 50 ? Theme.warning : Theme.teslaRed },
    { id: "rating", label: "Driver Rating", value: kpi.driverRating > 0 ? kpi.driverRating.toFixed(1) : "—", sub: kpi.driverRating > 0 ? "Average score" : "No ratings yet", accent: kpi.driverRating >= 4 ? Theme.darkGreen : kpi.driverRating >= 2.5 ? Theme.warning : kpi.driverRating > 0 ? Theme.teslaRed : Theme.textMuted },
  ], [kpi]);

  const kpiRows = useMemo(() => {
    const rows: (typeof kpiItems[number])[][] = [];
    for (let i = 0; i < kpiItems.length; i += ITEMS_PER_ROW) {
      rows.push(kpiItems.slice(i, i + ITEMS_PER_ROW));
    }
    return rows;
  }, [kpiItems, ITEMS_PER_ROW]);

  if (trips.length === 0 && kpi.totalRevenue === 0) {
    return (
      <ScrollView
        style={rootStyles.scroll}
        contentContainerStyle={[
          rootStyles.scrollContent,
          { paddingBottom: 32 + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <EmptyAnalytics />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={rootStyles.scroll}
      contentContainerStyle={[
        rootStyles.scrollContent,
        { paddingBottom: 32 + insets.bottom },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View style={[rootStyles.content, isDesktop && rootStyles.contentDesktop]}>
        {/* ── Period picker ─────────────────────────────────────────────── */}
        <View style={rootStyles.periodRow}>
          {PERIOD_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[
                rootStyles.periodBtn,
                period === opt.value && rootStyles.periodBtnActive,
              ]}
              onPress={() => setPeriod(opt.value)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  rootStyles.periodBtnText,
                  period === opt.value && rootStyles.periodBtnTextActive,
                ]}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── KPI grid ──────────────────────────────────────────────────── */}
        <View style={rootStyles.kpiGrid}>
          {kpiRows.map((row, rowIdx) => (
            <View key={rowIdx} style={rootStyles.kpiRow}>
              {row.map((item) => (
                <KpiCard
                  key={item.id}
                  id={item.id}
                  label={item.label}
                  value={item.value}
                  sub={item.sub}
                  accent={item.accent}
                  alert={item.alert}
                />
              ))}
            </View>
          ))}
        </View>

        {/* ── Earnings & Revenue Trends ──────────────────────────────────── */}
        <SectionHeader title="Earnings Trends" sub={`${period} view`} />

        <ChartCard title="Earnings (Commission Due)">
          <LineChart
            data={earningsLinePoints}
            width={chartWidth}
            height={chartH}
            field="revenue"
            color={Theme.darkGreen}
            gradientId="earnGrad"
          />
        </ChartCard>

        <ChartCard title="Payments Received">
          <LineChart
            data={paidLinePoints}
            width={chartWidth}
            height={chartH}
            field="revenue"
            color={Theme.primary}
            gradientId="paidGrad"
          />
        </ChartCard>

        <ChartCard
          title="Revenue vs Earnings"
          legend={
            <View style={{ flexDirection: "row", gap: 10 }}>
              <LegendChip color={Theme.primary} label="Revenue" />
              <LegendChip color={Theme.darkGreen} label="Earnings" />
            </View>
          }
        >
          <RevExpBarChart data={revExpPoints} width={chartWidth} height={isTablet ? 185 : 160} />
        </ChartCard>

        {/* ── Performance Score ─────────────────────────────────────────── */}
        <SectionHeader title="Performance Score" />
        <View style={cardStyles.card}>
          <PerformanceMeter score={kpi.performanceScore} />
          <View style={scoreBreakStyles.row}>
            <View style={scoreBreakStyles.item}>
              <View
                style={[
                  scoreBreakStyles.bar,
                  {
                    width: `${kpi.settlementHealth}%`,
                    backgroundColor: Theme.primary,
                  },
                ]}
              />
              <Text style={scoreBreakStyles.label}>Settlement {kpi.settlementHealth}%</Text>
            </View>
            <View style={scoreBreakStyles.item}>
              <View
                style={[
                  scoreBreakStyles.bar,
                  {
                    width: `${kpi.tripsTotal > 0 ? (kpi.tripsCompleted / kpi.tripsTotal) * 100 : 0}%`,
                    backgroundColor: Theme.darkGreen,
                  },
                ]}
              />
              <Text style={scoreBreakStyles.label}>
                Completion{" "}
                {kpi.tripsTotal > 0
                  ? Math.round((kpi.tripsCompleted / kpi.tripsTotal) * 100)
                  : 0}%
              </Text>
            </View>
            <View style={scoreBreakStyles.item}>
              <View
                style={[
                  scoreBreakStyles.bar,
                  {
                    width: `${(kpi.driverRating / 5) * 100}%`,
                    backgroundColor: Theme.warning,
                  },
                ]}
              />
              <Text style={scoreBreakStyles.label}>
                Rating {kpi.driverRating > 0 ? kpi.driverRating.toFixed(1) : "—"}
              </Text>
            </View>
          </View>
        </View>

        {/* ── Vehicle Operations ─────────────────────────────────────────── */}
        {vehicleStats.length > 0 && (
          <>
            <SectionHeader
              title="Vehicle Operations"
              sub="Vehicles operated by this driver"
            />
            <SectionCard>
              <View style={vehStyles.row}>
                <Text style={[vehHeaderStyles.th, { width: 28 }]}>#</Text>
                <Text style={[vehHeaderStyles.th, { flex: 1 }]}>Vehicle</Text>
                <Text style={[vehHeaderStyles.th, { width: 56, textAlign: "right" }]}>
                  Revenue
                </Text>
                <Text style={[vehHeaderStyles.th, { width: 56, textAlign: "right" }]}>
                  Earnings
                </Text>
                <Text style={[vehHeaderStyles.th, { width: 56, textAlign: "right" }]}>
                  Margin
                </Text>
              </View>
              {vehicleStats.map((stat, i) => (
                <VehicleRow
                  key={stat.vehicleId ?? stat.vehicleNumber}
                  stat={stat}
                  rank={i + 1}
                />
              ))}
            </SectionCard>
          </>
        )}

        {/* ── Payment Intelligence ───────────────────────────────────────── */}
        <SectionHeader
          title="Payment Summary"
          sub="Salary + commission breakdown"
        />

        {/* Summary cards */}
        <View style={rootStyles.kpiRow}>
          <View style={summaryCardStyles.card}>
            <Text style={summaryCardStyles.label}>Total Due</Text>
            <Text style={summaryCardStyles.value}>
              {formatINRChip(paymentSummary.totalSalary + paymentSummary.totalCommission)}
            </Text>
            <Text style={summaryCardStyles.sub}>
              Salary + Commission
            </Text>
          </View>
          <View style={summaryCardStyles.card}>
            <Text style={summaryCardStyles.label}>Total Paid</Text>
            <Text style={[summaryCardStyles.value, { color: Theme.darkGreen }]}>
              {formatINRChip(paymentSummary.totalPaid)}
            </Text>
            <Text style={summaryCardStyles.sub}>Cash outs recorded</Text>
          </View>
        </View>
        <View style={[rootStyles.kpiRow, { marginBottom: 12 }]}>
          <View style={summaryCardStyles.card}>
            <Text style={summaryCardStyles.label}>Advances</Text>
            <Text style={[summaryCardStyles.value, { color: Theme.warning }]}>
              {paymentSummary.advances > 0 ? formatINRChip(paymentSummary.advances) : "—"}
            </Text>
            <Text style={summaryCardStyles.sub}>Paid in advance</Text>
          </View>
          <View
            style={[
              summaryCardStyles.card,
              paymentSummary.totalPending > 0 && { borderColor: "rgba(232,33,39,0.20)", backgroundColor: "rgba(232,33,39,0.04)" },
            ]}
          >
            <Text style={summaryCardStyles.label}>Pending</Text>
            <Text
              style={[
                summaryCardStyles.value,
                {
                  color:
                    paymentSummary.totalPending > 0
                      ? Theme.teslaRed
                      : Theme.darkGreen,
                },
              ]}
            >
              {paymentSummary.totalPending > 0
                ? formatINRChip(paymentSummary.totalPending)
                : "₹ 0"}
            </Text>
            <Text style={summaryCardStyles.sub}>
              {paymentSummary.totalPending > 0 ? "Requested, unpaid" : "All settled"}
            </Text>
          </View>
        </View>

        {/* Monthly statement table */}
        {paymentSummary.months.length > 0 && (
          <View style={statementStyles.card}>
            <Text style={statementStyles.title}>MONTHLY STATEMENT</Text>
            {/* Header */}
            <View style={[payStyles.row, { borderBottomWidth: 1 }]}>
              <Text style={[statementStyles.th, { flex: 2 }]}>Month</Text>
              <Text style={[statementStyles.th, { flex: 1 }]}>Salary</Text>
              <Text style={[statementStyles.th, { flex: 1 }]}>Comm.</Text>
              <Text style={[statementStyles.th, { flex: 1 }]}>Paid</Text>
              <Text style={[statementStyles.th, { flex: 1 }]}>Due</Text>
            </View>
            {paymentSummary.months.slice(0, 12).map((row) => (
              <PaymentRow
                key={row.monthKey}
                row={row}
                expanded={expandedMonthKey === row.monthKey}
                onToggle={() =>
                  setExpandedMonthKey((prev) =>
                    prev === row.monthKey ? null : row.monthKey,
                  )
                }
              />
            ))}
          </View>
        )}

        {/* ── Document Compliance ────────────────────────────────────────── */}
        <SectionHeader title="Document Compliance" sub="Driver profile records" />
        <SectionCard>
          {docCompliance.map((doc) => (
            <DocRow key={doc.key} doc={doc} />
          ))}
        </SectionCard>
      </View>
    </ScrollView>
  );
});

// ─── Styles ────────────────────────────────────────────────────────────────────

const rootStyles = StyleSheet.create({
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 20,
  },
  content: { flex: 1 },
  contentDesktop: { maxWidth: 860, alignSelf: "center", width: "100%" },
  periodRow: {
    flexDirection: "row",
    backgroundColor: Theme.surfaceGray,
    borderRadius: 14,
    padding: 3,
    marginBottom: 20,
    gap: 2,
  },
  periodBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 11,
    alignItems: "center",
  },
  periodBtnActive: {
    backgroundColor: Theme.screenBackground,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  periodBtnText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 0.2,
  },
  periodBtnTextActive: { color: Theme.textPrimaryDark },
  kpiGrid: { gap: 8, marginBottom: 24 },
  kpiRow: { flexDirection: "row", gap: 8 },
});

const scoreBreakStyles = StyleSheet.create({
  row: { gap: 10, marginTop: 16 },
  item: { gap: 4 },
  bar: {
    height: 5,
    borderRadius: 3,
  },
  label: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textMuted,
  },
});

const summaryCardStyles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 3,
    minHeight: 80,
    justifyContent: "flex-end",
  },
  label: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  value: {
    fontSize: 18,
    fontWeight: "800",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.5,
    paddingLeft: Layout.currencyTextPaddingStart,
  },
  sub: { fontSize: 10, fontWeight: "600", color: Theme.textMuted },
});

const statementStyles = StyleSheet.create({
  card: {
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 24,
    paddingHorizontal: 16,
    marginBottom: 24,
    overflow: "hidden",
  },
  title: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    paddingTop: 14,
    paddingBottom: 4,
  },
  th: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    textAlign: "right",
  },
});

const vehHeaderStyles = StyleSheet.create({
  th: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
});
