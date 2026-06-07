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
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { usePartyAnalyticsInsetStyle } from "@/components/analytics/partyAnalyticsLayout";
import Theme from "@/constants/Theme";
import { formatINR, formatINRChip } from "@/lib/format";
import type { TripRow } from "@/features/trips/services/trips.service";
import type { LedgerRow } from "@/features/finance";
import type { SalaryRequestRow } from "@/features/drivers/services/salaryRequests.service";
import type { DriverRow } from "../../services/drivers.service";
import type { RatingRow } from "@/features/ratings";
import {
  PeriodPicker,
  PulseAnalyticsShell,
  PulseChartPanel,
  PulseGaugePanel,
  PulseHealthRow,
  PulseHealthScorePanel,
  PulseKpiGrid,
  PulsePanelGrid,
  PulseSection,
  TrendLineChart,
  pulseChartHeight,
  usePulseChartWidth,
  type PulseKpiItem,
} from "@/components/analytics";
import { scoreLevelFromValue } from "@/features/analytics";
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

// ─── Section header (table panels) ─────────────────────────────────────────────

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
  const { width } = useWindowDimensions();
  const [period, setPeriod] = useState<AnalyticsPeriod>("monthly");
  const [expandedMonthKey, setExpandedMonthKey] = useState<string | null>(null);
  const insetStyle = usePartyAnalyticsInsetStyle();
  const chartWidthHalf = usePulseChartWidth({ embedded: true, columns: 2 });
  const chartH = pulseChartHeight(width, true);

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

  const earningsLinePoints = useMemo(
    () => toLinePoints(periodPoints, "earnings"),
    [periodPoints],
  );
  const paidLinePoints = useMemo(
    () => toLinePoints(periodPoints, "paid"),
    [periodPoints],
  );

  const completionPct =
    kpi.tripsTotal > 0
      ? Math.round((kpi.tripsCompleted / kpi.tripsTotal) * 100)
      : 0;
  const ratingPct =
    kpi.driverRating > 0 ? Math.round((kpi.driverRating / 5) * 100) : 0;

  const headerKpiRows = useMemo(
    (): ReadonlyArray<ReadonlyArray<PulseKpiItem | null>> => [
      [
        {
          id: "perf",
          label: "Performance",
          value: `${kpi.performanceScore}`,
          subtext: "Composite 0–100",
          valueColor:
            kpi.performanceScore >= 75
              ? Theme.positive
              : kpi.performanceScore >= 50
                ? Theme.warning
                : Theme.negative,
          iconName: "tachometer",
        },
        {
          id: "trips",
          label: "Trips completed",
          value: String(kpi.tripsCompleted),
          subtext: `of ${kpi.tripsTotal} assigned`,
          valueColor: Theme.textBody,
          iconName: "truck",
        },
        {
          id: "salary",
          label: "Monthly salary",
          value: kpi.monthlySalary ? formatINRChip(kpi.monthlySalary) : "—",
          subtext: kpi.monthlySalary ? "Fixed per month" : "Commission-based",
          valueColor: Theme.textBody,
          iconName: "credit-card",
        },
        {
          id: "rating",
          label: "Driver rating",
          value: kpi.driverRating > 0 ? kpi.driverRating.toFixed(1) : "—",
          subtext:
            kpi.driverRating > 0 ? "Average score" : "No ratings yet",
          valueColor:
            kpi.driverRating >= 4
              ? Theme.positive
              : kpi.driverRating >= 2.5
                ? Theme.warning
                : kpi.driverRating > 0
                  ? Theme.negative
                  : Theme.textMuted,
          iconName: "star",
        },
      ],
    ],
    [kpi],
  );

  const paymentKpiRows = useMemo(
    (): ReadonlyArray<ReadonlyArray<PulseKpiItem | null>> => [
      [
        {
          id: "due",
          label: "Total due",
          value: formatINRChip(
            paymentSummary.totalSalary + paymentSummary.totalCommission,
          ),
          subtext: "Salary + commission",
          valueColor: Theme.primary,
        },
        {
          id: "paid-sum",
          label: "Total paid",
          value: formatINRChip(paymentSummary.totalPaid),
          subtext: "Cash outs recorded",
          valueColor: Theme.positive,
        },
        {
          id: "advances",
          label: "Advances",
          value:
            paymentSummary.advances > 0
              ? formatINRChip(paymentSummary.advances)
              : "—",
          subtext: "Paid in advance",
          valueColor: Theme.warning,
        },
        {
          id: "pending-sum",
          label: "Pending",
          value:
            paymentSummary.totalPending > 0
              ? formatINRChip(paymentSummary.totalPending)
              : "₹ 0",
          subtext:
            paymentSummary.totalPending > 0
              ? "Requested, unpaid"
              : "All settled",
          valueColor:
            paymentSummary.totalPending > 0
              ? Theme.negative
              : Theme.positive,
        },
      ],
    ],
    [paymentSummary],
  );

  const driverName = (driver?.name ?? "Driver").trim() || "Driver";

  const financialOverview = {
    primaryMetricLabel: "DRIVER PAYMENTS",
    primaryValue: formatINR(kpi.totalEarnings),
    leftLabel: "PAID",
    leftValue: formatINR(kpi.totalPaid),
    rightLabel: "DUE",
    rightValue: formatINR(Math.max(kpi.pendingBalance, 0)),
    decorIcon: "id-card" as const,
  };

  if (trips.length === 0 && kpi.totalRevenue === 0) {
    return (
      <PulseAnalyticsShell
        title="Driver finance analytics"
        subtitle={`${driverName} · payable, settlement, and performance`}
        embedded
      >
        <EmptyAnalytics />
      </PulseAnalyticsShell>
    );
  }

  return (
    <PulseAnalyticsShell
      title="Driver finance analytics"
      subtitle={`${driverName} · payable, settlement, and performance`}
      embedded
      financialOverview={financialOverview}
    >
      <View style={insetStyle}>
        <PulseKpiGrid rows={headerKpiRows} />

        <PulseSection
          title="Performance intelligence"
          subtitle="Composite score across settlement, completion, and ratings"
        >
          <PulseHealthRow
            score={
              <PulseHealthScorePanel
                title="Performance score"
                score={kpi.performanceScore}
                level={scoreLevelFromValue(kpi.performanceScore)}
                caption={`${kpi.tripsCompleted} trips completed · ${kpi.tripsTotal} assigned`}
                bars={[
                  {
                    label: "Settlement",
                    percent: kpi.settlementHealth,
                    color: Theme.primary,
                  },
                  {
                    label: "Completion",
                    percent: completionPct,
                    color: Theme.positive,
                  },
                  {
                    label: "Rating",
                    percent: ratingPct,
                    color: Theme.warning,
                  },
                ]}
              />
            }
            gauge={
              <PulseGaugePanel
                value={kpi.settlementHealth}
                level={scoreLevelFromValue(kpi.settlementHealth)}
                label="Settlement health"
                caption={
                  kpi.pendingBalance > 0
                    ? `${formatINRChip(kpi.pendingBalance)} outstanding`
                    : "Fully settled"
                }
              />
            }
          />
        </PulseSection>

        <PulseSection
          title="Payable & settlement"
          subtitle={`${period} view · commission earned vs paid out`}
        >
          <PeriodPicker value={period} onChange={setPeriod} />

          <PulsePanelGrid>
            <PulseChartPanel
              title="Commission payable"
              subtitle="Earned commission by period"
            >
              <TrendLineChart
                data={earningsLinePoints}
                width={chartWidthHalf}
                height={chartH}
                field="revenue"
                color={Theme.chartSeries1}
                gradientId="driverEarnGrad"
              />
            </PulseChartPanel>
            <PulseChartPanel
              title="Payments made"
              subtitle="Cash settled to driver"
            >
              <TrendLineChart
                data={paidLinePoints}
                width={chartWidthHalf}
                height={chartH}
                field="revenue"
                color={Theme.chartSeries2}
                gradientId="driverPaidGrad"
              />
            </PulseChartPanel>
          </PulsePanelGrid>
        </PulseSection>

        {vehicleStats.length > 0 ? (
          <PulseSection
            title="Vehicle operations"
            subtitle="Vehicles operated by this driver"
          >
            <PulseChartPanel title="Fleet contribution" subtitle="Revenue & margin by vehicle">
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
            </PulseChartPanel>
          </PulseSection>
        ) : null}

        <PulseSection
          title="Payment intelligence"
          subtitle="Salary + commission breakdown and monthly statement"
        >
          <PulseKpiGrid rows={paymentKpiRows} />

          {paymentSummary.months.length > 0 ? (
            <PulseChartPanel
              title="Monthly statement"
              subtitle="Salary, commission, paid and balance due"
            >
              <View style={[payStyles.row, tableStyles.headerRow]}>
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
            </PulseChartPanel>
          ) : null}
        </PulseSection>

        <PulseSection title="Document compliance" subtitle="Driver profile records">
          <PulseChartPanel title="Compliance status" subtitle="Licence, ID and profile documents">
            {docCompliance.map((doc) => (
              <DocRow key={doc.key} doc={doc} />
            ))}
          </PulseChartPanel>
        </PulseSection>
      </View>
    </PulseAnalyticsShell>
  );
});

// ─── Styles ────────────────────────────────────────────────────────────────────

const tableStyles = StyleSheet.create({
  headerRow: {
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
    paddingBottom: 8,
    marginBottom: 4,
  },
});

const statementStyles = StyleSheet.create({
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
