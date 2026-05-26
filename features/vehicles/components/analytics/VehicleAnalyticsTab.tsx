/**
 * Vehicle Asset Analytics tab.
 *
 * Receives already-loaded data from VehicleDetailScreen — no additional
 * fetches. All analytics are derived client-side via useMemo so the tab
 * renders instantly once the parent has its data.
 *
 * Layout (flat — rendered inside the parent ScrollView):
 *   Period picker → KPI grid → Revenue trend → Rev/Exp comparison
 *   → Expense breakdown → Profit trend → Driver performance
 *   → Document expiry → Utilization
 */
import React, { memo, useMemo, useState } from "react";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { formatINR, formatINRChip } from "@/lib/format";
import type { TripRow } from "@/features/trips/services/trips.service";
import type { LedgerRow } from "@/features/finance";
import type { VehicleRow } from "../../services/vehicles.service";
import {
  computeDocExpiry,
  computeDriverStats,
  computeExpenseCategories,
  computeKpiSummary,
  computePeriodPoints,
  type AnalyticsPeriod,
  type DocExpiry,
  type DriverStat,
  type MissionRow,
} from "./analyticsUtils";
import {
  DonutChart,
  ExpenseLegend,
  LineChart,
  ProfitBarChart,
  RevExpBarChart,
  UtilizationRing,
} from "./AnalyticsChart";

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  missionRows: MissionRow[];
  vehicleTrips: TripRow[];
  vehicleTransactions: LedgerRow[];
  vehicle: VehicleRow | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PERIOD_OPTIONS: { value: AnalyticsPeriod; label: string }[] = [
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly" },
];

const RANK_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  gold: { bg: "#FEF3C7", text: "#B45309", label: "Gold" },
  silver: { bg: "#F1F5F9", text: "#475569", label: "Silver" },
  bronze: { bg: "#FEF2F2", text: "#B45309", label: "Bronze" },
};

const DOC_STATUS_STYLE: Record<
  DocExpiry["status"],
  { bg: string; text: string; label: string }
> = {
  valid: { bg: Theme.positiveMuted, text: Theme.darkGreen, label: "Valid" },
  expiringSoon: {
    bg: Theme.warningMuted,
    text: Theme.warning,
    label: "Expiring",
  },
  expired: {
    bg: "rgba(232,33,39,0.10)",
    text: Theme.teslaRed,
    label: "Expired",
  },
  missing: { bg: Theme.surfaceGray, text: Theme.textMuted, label: "Missing" },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

interface KpiCardProps {
  id?: string;
  label: string;
  value: string;
  sub?: string;
  accent?: string;
  wide?: boolean;
  alert?: boolean;
}

const KpiCard = memo(function KpiCard({
  label,
  value,
  sub,
  accent,
  wide,
  alert,
}: KpiCardProps) {
  return (
    <View
      style={[
        kpiStyles.card,
        wide && kpiStyles.cardWide,
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
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 3,
    minHeight: 80,
    justifyContent: "flex-end",
  },
  cardWide: {
    minHeight: 70,
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
  sub: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textMuted,
  },
});

// Section header
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

// Chart card wrapper
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
    <View style={chartCardStyles.card}>
      <View style={chartCardStyles.header}>
        <Text style={chartCardStyles.title}>{title}</Text>
        {legend}
      </View>
      {children}
    </View>
  );
}

const chartCardStyles = StyleSheet.create({
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
    letterSpacing: 0.1,
  },
});

// Chart legend chip (Revenue vs Expense)
function LegendChip({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      <View
        style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: color }}
      />
      <Text style={{ fontSize: 9, fontWeight: "600", color: Theme.textMuted }}>
        {label}
      </Text>
    </View>
  );
}

// ─── Driver Performance Row ───────────────────────────────────────────────────

const DriverRow = memo(function DriverRow({
  stat,
  rank,
}: {
  stat: DriverStat;
  rank: number;
}) {
  const rankStyle = stat.rankTier ? RANK_COLORS[stat.rankTier] : null;

  return (
    <View style={driverStyles.row}>
      <View style={driverStyles.rankCell}>
        {rankStyle ? (
          <View style={[driverStyles.rankBadge, { backgroundColor: rankStyle.bg }]}>
            <Text style={[driverStyles.rankText, { color: rankStyle.text }]}>
              {rankStyle.label}
            </Text>
          </View>
        ) : (
          <Text style={driverStyles.rankNum}>#{rank}</Text>
        )}
      </View>
      <View style={driverStyles.nameCell}>
        <Text style={driverStyles.name} numberOfLines={1}>
          {stat.driverName}
        </Text>
        <Text style={driverStyles.trips}>{stat.tripCount} trips</Text>
      </View>
      <View style={driverStyles.statCell}>
        <Text style={driverStyles.statValue}>{formatINRChip(stat.revenue)}</Text>
        <Text style={driverStyles.statLabel}>Revenue</Text>
      </View>
      <View style={driverStyles.statCell}>
        <Text
          style={[
            driverStyles.statValue,
            { color: stat.margin >= 0 ? Theme.darkGreen : Theme.teslaRed },
          ]}
        >
          {stat.margin.toFixed(0)}%
        </Text>
        <Text style={driverStyles.statLabel}>Margin</Text>
      </View>
      <View style={driverStyles.scoreCell}>
        <View style={driverStyles.scoreBg}>
          <View
            style={[
              driverStyles.scoreFill,
              {
                width: `${stat.performanceScore}%`,
                backgroundColor:
                  stat.performanceScore >= 70
                    ? Theme.darkGreen
                    : stat.performanceScore >= 40
                      ? Theme.warning
                      : Theme.teslaRed,
              },
            ]}
          />
        </View>
        <Text style={driverStyles.scoreNum}>{stat.performanceScore}</Text>
      </View>
    </View>
  );
});

const driverStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  rankCell: { width: 52, alignItems: "center" },
  rankBadge: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  rankText: { fontSize: 8, fontWeight: "800", letterSpacing: 0.3 },
  rankNum: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textMuted,
  },
  nameCell: { flex: 1, minWidth: 0, gap: 1 },
  name: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  trips: { fontSize: 9, fontWeight: "600", color: Theme.textMuted },
  statCell: { width: 54, alignItems: "flex-end", gap: 1 },
  statValue: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  statLabel: { fontSize: 8, fontWeight: "600", color: Theme.textMuted },
  scoreCell: { width: 52, alignItems: "center", gap: 3 },
  scoreBg: {
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: Theme.surfaceGray,
    overflow: "hidden",
  },
  scoreFill: { height: 4, borderRadius: 2 },
  scoreNum: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
});

// ─── Document Expiry Row ──────────────────────────────────────────────────────

const DocRow = memo(function DocRow({ doc }: { doc: DocExpiry }) {
  const style = DOC_STATUS_STYLE[doc.status];

  const countdown =
    doc.daysRemaining === null
      ? "Not uploaded"
      : doc.daysRemaining < 0
        ? `Expired ${Math.abs(doc.daysRemaining)}d ago`
        : doc.daysRemaining === 0
          ? "Expires today"
          : `${doc.daysRemaining}d remaining`;

  const dateDisplay = doc.expiryDate
    ? new Date(doc.expiryDate).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "2-digit",
      })
    : "—";

  return (
    <View style={docStyles.row}>
      <View
        style={[docStyles.statusBar, { backgroundColor: style.text }]}
      />
      <View style={docStyles.content}>
        <Text style={docStyles.docLabel}>{doc.label}</Text>
        <Text
          style={[
            docStyles.countdown,
            doc.status !== "valid" && { color: style.text },
          ]}
        >
          {countdown}
        </Text>
      </View>
      <View style={docStyles.right}>
        <Text style={docStyles.date}>{dateDisplay}</Text>
        <View style={[docStyles.badge, { backgroundColor: style.bg }]}>
          <Text style={[docStyles.badgeText, { color: style.text }]}>
            {style.label}
          </Text>
        </View>
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
  statusBar: {
    width: 3,
    height: 36,
    borderRadius: 2,
    flexShrink: 0,
  },
  content: { flex: 1, minWidth: 0, gap: 2 },
  docLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  countdown: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  right: { alignItems: "flex-end", gap: 4 },
  date: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: { fontSize: 8, fontWeight: "800", letterSpacing: 0.4 },
});

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyAnalytics() {
  return (
    <View style={emptyStyles.wrap}>
      <Text style={emptyStyles.icon}>📊</Text>
      <Text style={emptyStyles.title}>No trip data yet</Text>
      <Text style={emptyStyles.sub}>
        Analytics will appear once this vehicle has completed trips with
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

// ─── Main component ───────────────────────────────────────────────────────────

export const VehicleAnalyticsTab = memo(function VehicleAnalyticsTab({
  missionRows,
  vehicle,
}: Props) {
  const { width: windowWidth } = useWindowDimensions();
  const [period, setPeriod] = useState<AnalyticsPeriod>("monthly");

  const isTablet = windowWidth >= 640;
  const isDesktop = windowWidth >= 1024;
  const ITEMS_PER_ROW = isTablet ? 4 : 2;

  // Chart width: screen - 2×screenPadding - 2×cardPadding
  const chartWidth = Math.max(
    160,
    windowWidth - 2 * Layout.screenPaddingHorizontal - 32,
  );

  const chartH = isTablet ? 160 : 140;
  const barChartH = isTablet ? 185 : 160;

  // All analytics derived from the already-loaded missionRows
  const kpi = useMemo(
    () => computeKpiSummary(missionRows, vehicle),
    [missionRows, vehicle],
  );
  const periodPoints = useMemo(
    () => computePeriodPoints(missionRows, period),
    [missionRows, period],
  );
  const driverStats = useMemo(
    () => computeDriverStats(missionRows),
    [missionRows],
  );
  const docExpiry = useMemo(() => computeDocExpiry(vehicle), [vehicle]);
  const expenseCats = useMemo(
    () => computeExpenseCategories(missionRows),
    [missionRows],
  );

  const netMarginColor =
    kpi.netMargin >= 20
      ? Theme.darkGreen
      : kpi.netMargin >= 5
        ? Theme.warning
        : Theme.teslaRed;

  const kpiItems = useMemo(() => [
    { id: "rev", label: "Revenue", value: formatINRChip(kpi.totalRevenue), sub: "All time", accent: Theme.primary },
    { id: "margin", label: "Net Margin", value: `${kpi.netMargin.toFixed(1)}%`, sub: kpi.netMargin >= 20 ? "Healthy" : kpi.netMargin >= 5 ? "Fair" : "Low", accent: netMarginColor },
    { id: "trips", label: "Trips Completed", value: String(kpi.tripsCompleted), sub: `of ${missionRows.length} total` },
    { id: "km", label: "KM Driven", value: kpi.totalKm >= 1000 ? `${(kpi.totalKm / 1000).toFixed(1)}K` : kpi.totalKm > 0 ? String(Math.round(kpi.totalKm)) : "—", sub: "Total distance" },
    { id: "util", label: "Utilization", value: `${kpi.utilizationPct}%`, sub: `${kpi.activeDays} active / 30d`, accent: kpi.utilizationPct >= 60 ? Theme.darkGreen : kpi.utilizationPct >= 30 ? Theme.warning : Theme.textMuted },
    { id: "revday", label: "Rev / Active Day", value: kpi.revenuePerDay > 0 ? formatINRChip(kpi.revenuePerDay) : "—", sub: "Last 30 days" },
    { id: "renewals", label: "Upcoming Renewals", value: String(kpi.upcomingRenewals), sub: kpi.upcomingRenewals === 0 ? "All docs current" : "Expiring in 60d", accent: kpi.upcomingRenewals > 0 ? Theme.teslaRed : Theme.darkGreen, alert: kpi.upcomingRenewals > 0 },
  ], [kpi, missionRows.length, netMarginColor]);

  const kpiRows = useMemo(() => {
    const rows: typeof kpiItems[] = [];
    for (let i = 0; i < kpiItems.length; i += ITEMS_PER_ROW) {
      rows.push(kpiItems.slice(i, i + ITEMS_PER_ROW));
    }
    return rows;
  }, [kpiItems, ITEMS_PER_ROW]);

  if (missionRows.length === 0 && kpi.totalRevenue === 0) {
    return <EmptyAnalytics />;
  }

  return (
    <View style={[styles.root, isDesktop && styles.rootDesktop]}>
      {/* ── Period picker ───────────────────────────────────────────────── */}
      <View style={styles.periodRow}>
        {PERIOD_OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt.value}
            style={[
              styles.periodBtn,
              period === opt.value && styles.periodBtnActive,
            ]}
            onPress={() => setPeriod(opt.value)}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.periodBtnText,
                period === opt.value && styles.periodBtnTextActive,
              ]}
            >
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── KPI grid ────────────────────────────────────────────────────── */}
      <View style={styles.kpiGrid}>
        {kpiRows.map((row, ri) => (
          <View key={ri} style={styles.kpiRow}>
            {row.map(item => (
              <KpiCard key={item.id} {...item} />
            ))}
          </View>
        ))}
      </View>

      {/* ── Financial Performance ──────────────────────────────────────── */}
      <SectionHeader title="Financial Performance" sub={`${period} view`} />

      <ChartCard title="Revenue Trend">
        <LineChart
          data={periodPoints}
          width={chartWidth}
          field="revenue"
          color={Theme.primary}
          gradientId="revGrad"
          height={chartH}
        />
      </ChartCard>

      <ChartCard
        title="Revenue vs Expense"
        legend={
          <View style={{ flexDirection: "row", gap: 10 }}>
            <LegendChip color={Theme.primary} label="Revenue" />
            <LegendChip color={Theme.teslaRed} label="Expense" />
          </View>
        }
      >
        <RevExpBarChart data={periodPoints} width={chartWidth} height={barChartH} />
      </ChartCard>

      <ChartCard title="Net Profit">
        <ProfitBarChart data={periodPoints} width={chartWidth} height={barChartH} />
      </ChartCard>

      {/* ── Expense Breakdown ──────────────────────────────────────────── */}
      {expenseCats.length > 0 && (
        <>
          <SectionHeader title="Expense Breakdown" />
          <View style={chartCardStyles.card}>
            <Text style={chartCardStyles.title}>Cost Composition</Text>
            <View style={expenseStyles.donutRow}>
              <DonutChart data={expenseCats} size={100} />
              <ExpenseLegend items={expenseCats} />
            </View>
            <View style={expenseStyles.catList}>
              {expenseCats.map((cat) => (
                <View key={cat.label} style={expenseStyles.catRow}>
                  <View
                    style={[expenseStyles.catDot, { backgroundColor: cat.color }]}
                  />
                  <Text style={expenseStyles.catLabel}>{cat.label}</Text>
                  <View style={expenseStyles.catBarBg}>
                    <View
                      style={[
                        expenseStyles.catBarFill,
                        {
                          width: `${cat.pct}%`,
                          backgroundColor: cat.color,
                        },
                      ]}
                    />
                  </View>
                  <Text style={expenseStyles.catAmount}>
                    {formatINRChip(cat.amount)}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </>
      )}

      {/* ── Margin trend ───────────────────────────────────────────────── */}
      <ChartCard title="Margin % Trend">
        <LineChart
          data={periodPoints}
          width={chartWidth}
          field="margin"
          color={Theme.darkGreen}
          gradientId="marginGrad"
          height={120}
        />
      </ChartCard>

      {/* ── Driver Performance ─────────────────────────────────────────── */}
      {driverStats.length > 0 && (
        <>
          <SectionHeader
            title="Driver Performance"
            sub="Ranked by revenue generated on this vehicle"
          />
          <View style={sectionCardStyles.card}>
            {/* Table header */}
            <View style={driverStyles.row}>
              <Text style={[driverHeaderStyles.th, { width: 52 }]}>Rank</Text>
              <Text style={[driverHeaderStyles.th, { flex: 1 }]}>Driver</Text>
              <Text
                style={[driverHeaderStyles.th, { width: 54, textAlign: "right" }]}
              >
                Revenue
              </Text>
              <Text
                style={[driverHeaderStyles.th, { width: 54, textAlign: "right" }]}
              >
                Margin
              </Text>
              <Text
                style={[driverHeaderStyles.th, { width: 52, textAlign: "center" }]}
              >
                Score
              </Text>
            </View>
            {driverStats.map((stat, i) => (
              <DriverRow key={stat.driverId ?? stat.driverName} stat={stat} rank={i + 1} />
            ))}
          </View>
        </>
      )}

      {/* ── Document Expiry ────────────────────────────────────────────── */}
      <SectionHeader
        title="Document Expiry"
        sub="Compliance status for this vehicle"
      />
      <View style={sectionCardStyles.card}>
        {docExpiry.map((doc) => (
          <DocRow key={doc.key} doc={doc} />
        ))}
      </View>

      {/* ── Vehicle Utilization ────────────────────────────────────────── */}
      <SectionHeader title="Vehicle Utilization" sub="Last 30 days" />
      <View style={utilStyles.grid}>
        {/* Utilization ring card */}
        <View style={utilStyles.ringCard}>
          <View style={utilStyles.ringWrap}>
            <UtilizationRing pct={kpi.utilizationPct} size={80} />
            <View style={utilStyles.ringCenter}>
              <Text style={utilStyles.ringPct}>{kpi.utilizationPct}%</Text>
            </View>
          </View>
          <Text style={utilStyles.ringLabel}>Utilization</Text>
          <Text style={utilStyles.ringSub}>
            {kpi.activeDays} of 30 days
          </Text>
        </View>
        {/* Stats grid */}
        <View style={utilStyles.statsCol}>
          <View style={utilStyles.statRow}>
            <View style={utilStyles.statItem}>
              <Text style={utilStyles.statLabel}>Active Days</Text>
              <Text style={utilStyles.statValue}>{kpi.activeDays}</Text>
            </View>
            <View style={utilStyles.statItem}>
              <Text style={utilStyles.statLabel}>Idle Days</Text>
              <Text style={utilStyles.statValue}>
                {Math.max(0, 30 - kpi.activeDays)}
              </Text>
            </View>
          </View>
          <View style={utilStyles.divider} />
          <View style={utilStyles.statRow}>
            <View style={utilStyles.statItem}>
              <Text style={utilStyles.statLabel}>Trips / Month</Text>
              <Text style={utilStyles.statValue}>
                {missionRows.length > 0
                  ? (missionRows.length / Math.max(1, 3)).toFixed(1)
                  : "—"}
              </Text>
            </View>
            <View style={utilStyles.statItem}>
              <Text style={utilStyles.statLabel}>Rev / Day</Text>
              <Text style={utilStyles.statValue}>
                {kpi.revenuePerDay > 0
                  ? formatINRChip(kpi.revenuePerDay)
                  : "—"}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Bottom spacing */}
      <View style={{ height: 32 }} />
    </View>
  );
});

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    gap: 0,
  },
  rootDesktop: {
    maxWidth: 860,
    alignSelf: "center",
    width: "100%",
  },
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
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 0.2,
  },
  periodBtnTextActive: {
    color: Theme.textPrimaryDark,
  },
  kpiGrid: {
    gap: 8,
    marginBottom: 24,
  },
  kpiRow: {
    flexDirection: "row",
    gap: 8,
  },
});

const expenseStyles = StyleSheet.create({
  donutRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
    marginBottom: 16,
  },
  catList: { gap: 10 },
  catRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  catDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  catLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textPrimary,
    width: 60,
  },
  catBarBg: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: Theme.surfaceGray,
    overflow: "hidden",
  },
  catBarFill: { height: 6, borderRadius: 3 },
  catAmount: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    minWidth: 48,
    textAlign: "right",
  },
});

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

const driverHeaderStyles = StyleSheet.create({
  th: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
});

const utilStyles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 0,
  },
  ringCard: {
    width: 110,
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 20,
    padding: 14,
    alignItems: "center",
    gap: 4,
  },
  ringWrap: {
    width: 80,
    height: 80,
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  ringCenter: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  ringPct: {
    fontSize: 14,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.5,
  },
  ringLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  ringSub: {
    fontSize: 9,
    fontWeight: "600",
    color: Theme.textMuted,
    textAlign: "center",
  },
  statsCol: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 20,
    padding: 14,
    justifyContent: "center",
    gap: 10,
  },
  statRow: { flexDirection: "row", gap: 8 },
  statItem: { flex: 1, gap: 2 },
  statLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  statValue: {
    fontSize: 16,
    fontWeight: "800",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.5,
  },
  divider: {
    height: 1,
    backgroundColor: Theme.borderLight,
  },
});
