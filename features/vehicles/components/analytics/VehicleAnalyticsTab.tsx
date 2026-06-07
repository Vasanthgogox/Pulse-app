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
  View,
  useWindowDimensions,
} from "react-native";
import { usePartyAnalyticsInsetStyle } from "@/components/analytics/partyAnalyticsLayout";
import Theme from "@/constants/Theme";
import { formatINR, formatINRChip } from "@/lib/format";
import type { TripRow } from "@/features/trips/services/trips.service";
import type { LedgerRow } from "@/features/finance";
import type { VehicleRow } from "../../services/vehicles.service";
import {
  PeriodPicker,
  PulseAnalyticsShell,
  PulseChartPanel,
  PulsePanelGrid,
  PulseSection,
  pulseChartHeight,
  usePulseChartWidth,
} from "@/components/analytics";
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
} from "./AnalyticsChart";
import VehicleIntelligenceSection from "./VehicleIntelligenceSection";
import type { VehicleMonthlyBuckets } from "./vehicleIntelligenceUtils";

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  missionRows: MissionRow[];
  vehicleTrips: TripRow[];
  vehicleTransactions: LedgerRow[];
  vehicle: VehicleRow | null;
  /** Org id forwarded to the Intelligence overlay so it can pull the
   *  server-side composite score (`compute_vehicle_performance_score`). */
  orgId?: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

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

// ─── Sub-components (tables & charts) ─────────────────────────────────────────

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
  vehicleTrips,
  vehicleTransactions,
  orgId = null,
}: Props) {
  const { width } = useWindowDimensions();
  const [period, setPeriod] = useState<AnalyticsPeriod>("monthly");
  const insetStyle = usePartyAnalyticsInsetStyle();
  const chartWidth = usePulseChartWidth({ embedded: true });
  const chartWidthHalf = usePulseChartWidth({ embedded: true, columns: 2 });
  const chartH = pulseChartHeight(width, true);
  const barChartH = chartH + 12;

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

  const intelMonthly = useMemo<VehicleMonthlyBuckets[]>(
    () =>
      computePeriodPoints(missionRows, "monthly").map((p) => ({
        label: p.label,
        revenue: p.revenue,
        expense: p.expense,
        profit: p.profit,
        tripCount: p.tripCount,
      })),
    [missionRows],
  );

  const vehicleLabel = vehicle?.vehicle_number?.trim() || "Vehicle";

  if (missionRows.length === 0 && kpi.totalRevenue === 0) {
    return (
      <PulseAnalyticsShell
        title="Vehicle asset analytics"
        subtitle={`${vehicleLabel} · revenue, cost, and utilization`}
        embedded
      >
        <EmptyAnalytics />
      </PulseAnalyticsShell>
    );
  }

  const financialOverview = {
    primaryMetricLabel: "VEHICLE SALES",
    primaryValue: formatINR(kpi.totalRevenue),
    leftLabel: "EXPENSE",
    leftValue: formatINR(kpi.totalExpense),
    rightLabel: "PROFIT",
    rightValue: formatINR(kpi.totalProfit),
    decorIcon: "truck" as const,
  };

  return (
    <PulseAnalyticsShell
      title="Vehicle asset analytics"
      subtitle={`${vehicleLabel} · revenue, cost, and utilization`}
      embedded
      financialOverview={financialOverview}
    >
      <View style={insetStyle}>
        <VehicleIntelligenceSection
          vehicle={vehicle}
          vehicleTrips={vehicleTrips}
          vehicleTransactions={vehicleTransactions}
          missionRows={missionRows}
          orgId={orgId}
          monthlyBuckets={intelMonthly}
        />

        <PulseSection
          title="Financial performance"
          subtitle={`${period} view · revenue, expense, and margin trends`}
        >
          <PeriodPicker
            value={period}
            onChange={(next) => setPeriod(next as AnalyticsPeriod)}
            options={["monthly", "quarterly", "yearly"]}
          />

          <PulseChartPanel
            title="Revenue trend"
            subtitle={`${missionRows.length} missions · ${formatINRChip(kpi.totalRevenue)} total`}
          >
            <LineChart
              data={periodPoints}
              width={chartWidth}
              field="revenue"
              color={Theme.chartSeries1}
              gradientId="vehicleRevGrad"
              height={chartH}
            />
          </PulseChartPanel>

          <PulsePanelGrid>
            <PulseChartPanel
              title="Revenue vs expense"
              subtitle="Side-by-side period comparison"
            >
              <RevExpBarChart
                data={periodPoints}
                width={chartWidthHalf}
                height={barChartH}
              />
            </PulseChartPanel>
            <PulseChartPanel
              title="Net profit"
              subtitle="Profit after operating costs"
            >
              <ProfitBarChart
                data={periodPoints}
                width={chartWidthHalf}
                height={barChartH}
              />
            </PulseChartPanel>
          </PulsePanelGrid>

          <PulseChartPanel
            title="Margin % trend"
            subtitle="Net margin contribution by period"
          >
            <LineChart
              data={periodPoints}
              width={chartWidth}
              field="margin"
              color={Theme.positive}
              gradientId="vehicleMarginGrad"
              height={chartH}
            />
          </PulseChartPanel>
        </PulseSection>

        {expenseCats.length > 0 ? (
          <PulseSection
            title="Expense breakdown"
            subtitle="Cost composition across operating categories"
          >
            <PulseChartPanel title="Cost composition" subtitle="Share of total operating expense">
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
            </PulseChartPanel>
          </PulseSection>
        ) : null}

        {driverStats.length > 0 ? (
          <PulseSection
            title="Driver performance"
            subtitle="Ranked by revenue generated on this vehicle"
          >
            <PulseChartPanel title="Driver leaderboard" subtitle="Revenue, margin and composite score">
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
                <DriverRow
                  key={stat.driverId ?? stat.driverName}
                  stat={stat}
                  rank={i + 1}
                />
              ))}
            </PulseChartPanel>
          </PulseSection>
        ) : null}

        <PulseSection
          title="Document expiry"
          subtitle="Compliance status for this vehicle"
        >
          <PulseChartPanel title="Compliance registry" subtitle="Registration, insurance and permits">
            {docExpiry.map((doc) => (
              <DocRow key={doc.key} doc={doc} />
            ))}
          </PulseChartPanel>
        </PulseSection>
      </View>
    </PulseAnalyticsShell>
  );
});

// ─── Styles ───────────────────────────────────────────────────────────────────

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

const driverHeaderStyles = StyleSheet.create({
  th: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
});
