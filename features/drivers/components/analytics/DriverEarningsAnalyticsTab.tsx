/**
 * DriverEarningsAnalyticsTab — Earnings + Productivity Intelligence.
 * ============================================================================
 *
 * Drops into `DriverDetailScreen` as the "Earnings Analytics" tab.
 * Receives already-loaded data from the parent (no new fetches).
 *
 * Layout:
 *   ┌───────────────────────────────────────────────────────────────┐
 *   │ KPI grid (8 cards)                                            │
 *   │  Salary Paid · Pending · Incentives · Advances · Deductions   │
 *   │  Fuel Recovery · Bonus · Monthly Earnings                     │
 *   ├───────────────────────────────────────────────────────────────┤
 *   │ Earnings trend (line) · Advances trend (line)                 │
 *   ├───────────────────────────────────────────────────────────────┤
 *   │ Incentive performance (rev vs commission bars)                │
 *   ├───────────────────────────────────────────────────────────────┤
 *   │ Productivity Intelligence — Rev/Day, Trips/Week, KM, Idle,   │
 *   │ Active, Rev/KM                                                │
 *   ├───────────────────────────────────────────────────────────────┤
 *   │ Auto Insights                                                 │
 *   └───────────────────────────────────────────────────────────────┘
 *
 * All calculations memoised; KPIs render in < 1 frame even on 1k+ trips.
 * Charts reuse the existing `react-native-svg` primitives from
 * `@/features/vehicles/components/analytics/AnalyticsChart`.
 */

import { useMemo } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";

import { Theme } from "@/constants/Theme";
import { formatINR, formatINRChip } from "@/lib/format";

import {
  ChartCard,
  KPIHeader,
  SectionHeader,
  InsightsPanel,
} from "@/components/analytics";
import {
  LineChart,
  RevExpBarChart,
} from "@/features/vehicles/components/analytics/AnalyticsChart";

import type { LedgerRow } from "@/features/finance";
import type { SalaryRequestRow } from "@/features/drivers/services/salaryRequests.service";
import type { TripRow } from "@/features/trips/services/trips.service";
import type { DriverRow } from "../../services/drivers.service";

import {
  computeDriverEarningsKpis,
  computeDriverEarningsMonths,
  computeDriverProductivity,
  type DriverEarningsMonth,
  type DriverOffer,
} from "./driverEarningsUtils";
import type { AnalyticsInsight } from "@/features/analytics";

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  trips: TripRow[];
  driverTransactions: LedgerRow[];
  driverRequests: SalaryRequestRow[];
  driver: DriverRow | null;
  driverOffer: DriverOffer | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Chart projections
// ─────────────────────────────────────────────────────────────────────────────

interface ChartPoint {
  label: string;
  revenue: number;
  expense: number;
  profit: number;
  margin: number;
  tripCount: number;
}

/** Project earnings-by-month onto the chart-primitive shape, where
 *  `revenue` is what we want to plot. */
function toLinePoints(
  months: readonly DriverEarningsMonth[],
  field: "commission" | "advance" | "netReceived" | "bonus",
): ChartPoint[] {
  return months.map((m) => ({
    label: m.label,
    revenue: m[field],
    expense: 0,
    profit: 0,
    margin: 0,
    tripCount: 0,
  }));
}

/** Project for the rev-vs-commission grouped bar chart. */
function toIncentiveBars(months: readonly DriverEarningsMonth[]): ChartPoint[] {
  return months.map((m) => ({
    label: m.label,
    revenue: m.commission, // earned commission as "headline"
    expense: m.paid,       // paid as the comparator
    profit: m.commission - m.paid,
    margin:
      m.commission > 0 ? ((m.commission - m.paid) / m.commission) * 100 : 0,
    tripCount: 0,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Insights derivation
// ─────────────────────────────────────────────────────────────────────────────

function deriveInsights(
  months: readonly DriverEarningsMonth[],
  kpis: ReturnType<typeof computeDriverEarningsKpis>,
): AnalyticsInsight[] {
  const out: AnalyticsInsight[] = [];
  if (months.length < 2) return out;

  const last = months[months.length - 1];
  const prev = months[months.length - 2];
  if (!last || !prev) return out;

  // Commission trend (last vs prev month).
  if (prev.commission > 0) {
    const deltaPct = ((last.commission - prev.commission) / prev.commission) * 100;
    if (deltaPct >= 15) {
      out.push({
        id: "earn-up",
        tone: "positive",
        message: `Commission grew ${Math.round(deltaPct)}% vs last month (₹${formatINRChip(last.commission)})`,
      });
    } else if (deltaPct <= -15) {
      out.push({
        id: "earn-down",
        tone: "warning",
        message: `Commission dropped ${Math.round(Math.abs(deltaPct))}% vs last month — check trip allocation`,
      });
    }
  }

  // Settlement gap.
  if (kpis.tripIncentives > 0 && kpis.salaryPaid > 0) {
    const settled = (kpis.salaryPaid / kpis.tripIncentives) * 100;
    if (settled < 70) {
      out.push({
        id: "settle-low",
        tone: "negative",
        message: `Only ${Math.round(settled)}% of earned commission has been paid out — ${formatINR(kpis.tripIncentives - kpis.salaryPaid)} pending`,
      });
    } else if (settled >= 95) {
      out.push({
        id: "settle-high",
        tone: "positive",
        message: `${Math.round(settled)}% settlement health — payouts are keeping pace with commission earned`,
      });
    }
  }

  // Advance dependency.
  const advTotal = months.reduce((s, m) => s + m.advance, 0);
  const payTotal = months.reduce((s, m) => s + m.paid, 0);
  if (payTotal > 0 && advTotal / payTotal >= 0.4) {
    out.push({
      id: "adv-heavy",
      tone: "warning",
      message: `Advances are ${Math.round((advTotal / payTotal) * 100)}% of payouts — reconcile before next salary cycle`,
    });
  }

  // Deduction spike.
  if (kpis.deductions > 0 && kpis.salaryPaid > 0) {
    const deductionPct = (kpis.deductions / kpis.salaryPaid) * 100;
    if (deductionPct >= 8) {
      out.push({
        id: "deduct-spike",
        tone: "warning",
        message: `Deductions are ${Math.round(deductionPct)}% of payout — review penalties and recoveries`,
      });
    }
  }

  // Pending salary.
  if (kpis.pendingSalary >= 5000) {
    out.push({
      id: "pending-req",
      tone: "info",
      message: `${formatINR(kpis.pendingSalary)} salary request pending approval`,
    });
  }

  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function DriverEarningsAnalyticsTab({
  trips,
  driverTransactions,
  driverRequests,
  driver,
  driverOffer,
}: Props) {
  const { width } = useWindowDimensions();
  const chartW = Math.min(width - 32 - 32, 720);

  const kpis = useMemo(
    () => computeDriverEarningsKpis(trips, driverTransactions, driverRequests, driverOffer),
    [trips, driverTransactions, driverRequests, driverOffer],
  );

  const months = useMemo(
    () => computeDriverEarningsMonths(trips, driverTransactions, driverOffer, 6),
    [trips, driverTransactions, driverOffer],
  );

  const productivity = useMemo(
    () => computeDriverProductivity(trips, driver),
    [trips, driver],
  );

  const insights = useMemo(() => deriveInsights(months, kpis), [months, kpis]);

  return (
    <View style={styles.wrap}>
      {/* ── Earnings KPI header ─────────────────────────────────────────── */}
      <SectionHeader
        title="Earnings Intelligence"
        subtitle="Salary, incentives, advances and deductions over the last 6 months"
      />
      <KPIHeader
        columns={2}
        cards={[
          {
            id: "salary-paid",
            label: "Salary paid",
            value: formatINR(kpis.salaryPaid),
            sub: "Settled to date",
            accent: Theme.chartSeries2,
          },
          {
            id: "pending-salary",
            label: "Pending salary",
            value: formatINR(kpis.pendingSalary),
            sub: "Awaiting approval",
            accent: kpis.pendingSalary > 0 ? Theme.chartSeries4 : Theme.textMuted,
            alert: kpis.pendingSalary > 0,
          },
          {
            id: "incentives",
            label: "Trip incentives",
            value: formatINR(kpis.tripIncentives),
            sub: "Commission earned",
            accent: Theme.chartSeries1,
          },
          {
            id: "advances",
            label: "Advances",
            value: formatINR(kpis.advanceTotal),
            sub: "Outstanding",
            accent: Theme.chartSeries4,
          },
          {
            id: "deductions",
            label: "Deductions",
            value: formatINR(kpis.deductions),
            sub: "Penalties / recoveries",
            accent: kpis.deductions > 0 ? Theme.chartSeries3 : Theme.textMuted,
          },
          {
            id: "fuel",
            label: "Fuel recovery",
            value: formatINR(kpis.fuelRecovery),
            sub: "Fuel adjustments",
            accent: Theme.chartSeries5,
          },
          {
            id: "bonus",
            label: "Bonus",
            value: formatINR(kpis.bonusTotal),
            sub: "Performance bonuses",
            accent: Theme.chartSeries2,
          },
          {
            id: "monthly",
            label: "Monthly earnings",
            value: formatINR(kpis.monthlyEarnings),
            sub: "Avg last 3 months",
            accent: Theme.chartSeries1,
          },
        ]}
      />

      {/* ── Trend charts ─────────────────────────────────────────────────── */}
      <SectionHeader
        title="Earnings trends"
        subtitle="Monthly commission, advances and net received"
      />
      <View style={styles.chartGrid}>
        <ChartCard title="Earnings trend" subtitle="Commission earned per month">
          <LineChart
            data={toLinePoints(months, "commission")}
            width={chartW}
            field="revenue"
            color={Theme.chartSeries1}
            gradientId="earningsGrad"
          />
        </ChartCard>
        <ChartCard title="Advances trend" subtitle="Advances drawn per month">
          <LineChart
            data={toLinePoints(months, "advance")}
            width={chartW}
            field="revenue"
            color={Theme.chartSeries4}
            gradientId="advancesGrad"
          />
        </ChartCard>
        <ChartCard
          title="Incentive performance"
          subtitle="Commission earned vs paid"
        >
          <RevExpBarChart data={toIncentiveBars(months)} width={chartW} />
        </ChartCard>
      </View>

      {/* ── Productivity Intelligence ───────────────────────────────────── */}
      <SectionHeader
        title="Productivity Intelligence"
        subtitle="Last 90 days — measure throughput vs idle time"
      />
      <KPIHeader
        columns={2}
        cards={[
          {
            id: "p-rev-day",
            label: "Revenue / Day",
            value: formatINR(productivity.revenuePerDay),
            sub: "Per active day",
            accent: Theme.chartSeries1,
          },
          {
            id: "p-trips-week",
            label: "Trips / Week",
            value: productivity.tripsPerWeek.toFixed(1),
            sub: "Throughput",
            accent: Theme.chartSeries5,
          },
          {
            id: "p-km",
            label: "KM Driven",
            value: Math.round(productivity.kmDriven).toLocaleString("en-IN"),
            sub: "Total distance",
            accent: Theme.chartSeries2,
          },
          {
            id: "p-rev-km",
            label: "Revenue / KM",
            value: `₹${productivity.revenuePerKm.toFixed(2)}`,
            sub: "Yield per km",
            accent: Theme.chartSeries1,
          },
          {
            id: "p-active",
            label: "Active Days",
            value: String(productivity.activeDays),
            sub: "Days with trips",
            accent: Theme.chartSeries2,
          },
          {
            id: "p-idle",
            label: "Idle Days",
            value: String(productivity.idleDays),
            sub: "Days without trips",
            accent:
              productivity.idleDays > productivity.activeDays
                ? Theme.chartSeries3
                : Theme.textMuted,
            alert: productivity.idleDays > productivity.activeDays * 2,
          },
        ]}
      />

      {/* ── Auto Insights ───────────────────────────────────────────────── */}
      {insights.length > 0 ? (
        <>
          <SectionHeader title="Auto insights" />
          <InsightsPanel insights={insights} />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 14,
  },
  chartGrid: {
    gap: 10,
  },
});
