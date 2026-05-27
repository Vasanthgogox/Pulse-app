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

import { Theme } from "@/constants/Theme";
import { formatINR, formatINRChip } from "@/lib/format";

import {
  PulseAnalyticsShell,
  PulseChartPanel,
  PulseInsightsPanel,
  PulseKpiGrid,
  PulsePanelGrid,
  PulseSection,
  TrendBarChart,
  TrendLineChart,
  usePulseChartWidth,
  type PulseKpiItem,
  type TrendPoint,
} from "@/components/analytics";

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

/** Project earnings-by-month onto the chart-primitive shape, where
 *  `revenue` is what we want to plot. */
function toLinePoints(
  months: readonly DriverEarningsMonth[],
  field: "commission" | "advance" | "netReceived" | "bonus",
): TrendPoint[] {
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
function toIncentiveBars(months: readonly DriverEarningsMonth[]): TrendPoint[] {
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
  const chartW = usePulseChartWidth();
  const chartWHalf = usePulseChartWidth({ columns: 2 });

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

  const earningsKpiRows = useMemo(
    (): ReadonlyArray<ReadonlyArray<PulseKpiItem | null>> => [
      [
        {
          id: "salary-paid",
          label: "Salary paid",
          value: formatINR(kpis.salaryPaid),
          subtext: "Settled to date",
          valueColor: Theme.positive,
          iconName: "money",
        },
        {
          id: "pending-salary",
          label: "Pending salary",
          value: formatINR(kpis.pendingSalary),
          subtext: "Awaiting approval",
          valueColor: kpis.pendingSalary > 0 ? Theme.negative : Theme.textMuted,
          iconName: "clock-o",
        },
        {
          id: "incentives",
          label: "Trip incentives",
          value: formatINR(kpis.tripIncentives),
          subtext: "Commission earned",
          valueColor: Theme.primary,
          iconName: "line-chart",
        },
        {
          id: "advances",
          label: "Advances",
          value: formatINR(kpis.advanceTotal),
          subtext: "Outstanding",
          valueColor: Theme.negative,
          iconName: "credit-card",
        },
      ],
      [
        {
          id: "deductions",
          label: "Deductions",
          value: formatINR(kpis.deductions),
          subtext: "Penalties / recoveries",
          valueColor: kpis.deductions > 0 ? Theme.warning : Theme.textMuted,
          iconName: "minus-circle",
        },
        {
          id: "fuel",
          label: "Fuel recovery",
          value: formatINR(kpis.fuelRecovery),
          subtext: "Fuel adjustments",
          valueColor: Theme.textBody,
          iconName: "tint",
        },
        {
          id: "bonus",
          label: "Bonus",
          value: formatINR(kpis.bonusTotal),
          subtext: "Performance bonuses",
          valueColor: Theme.positive,
          iconName: "star",
        },
        {
          id: "monthly",
          label: "Monthly earnings",
          value: formatINR(kpis.monthlyEarnings),
          subtext: "Avg last 3 months",
          valueColor: Theme.primary,
          iconName: "calendar",
        },
      ],
    ],
    [kpis],
  );

  const productivityKpiRows = useMemo(
    (): ReadonlyArray<ReadonlyArray<PulseKpiItem | null>> => [
      [
        {
          id: "p-rev-day",
          label: "Revenue / day",
          value: formatINR(productivity.revenuePerDay),
          subtext: "Per active day",
          valueColor: Theme.primary,
          iconName: "money",
        },
        {
          id: "p-trips-week",
          label: "Trips / week",
          value: productivity.tripsPerWeek.toFixed(1),
          subtext: "Throughput",
          valueColor: Theme.textBody,
          iconName: "truck",
        },
        {
          id: "p-km",
          label: "KM driven",
          value: Math.round(productivity.kmDriven).toLocaleString("en-IN"),
          subtext: "Total distance",
          valueColor: Theme.positive,
          iconName: "road",
        },
        {
          id: "p-rev-km",
          label: "Revenue / km",
          value: `₹${productivity.revenuePerKm.toFixed(2)}`,
          subtext: "Yield per km",
          valueColor: Theme.primary,
          iconName: "line-chart",
        },
      ],
      [
        {
          id: "p-active",
          label: "Active days",
          value: String(productivity.activeDays),
          subtext: "Days with trips",
          valueColor: Theme.positive,
          iconName: "check",
        },
        {
          id: "p-idle",
          label: "Idle days",
          value: String(productivity.idleDays),
          subtext: "Days without trips",
          valueColor:
            productivity.idleDays > productivity.activeDays
              ? Theme.warning
              : Theme.textMuted,
          iconName: "pause",
        },
        null,
        null,
      ],
    ],
    [productivity],
  );

  return (
    <PulseAnalyticsShell
      title="Earnings intelligence"
      subtitle="Salary, incentives, advances and deductions over the last 6 months"
    >
      <PulseKpiGrid rows={earningsKpiRows} />

      <PulseSection
        title="Earnings trends"
        subtitle="Monthly commission, advances and net received"
      >
        <PulseChartPanel
          title="Earnings trend"
          subtitle="Commission earned per month"
        >
          <TrendLineChart
            data={toLinePoints(months, "commission")}
            width={chartW}
            height={168}
            field="revenue"
            color={Theme.chartSeries1}
            gradientId="earningsGrad"
          />
        </PulseChartPanel>
        <PulsePanelGrid>
          <PulseChartPanel
            title="Advances trend"
            subtitle="Advances drawn per month"
          >
            <TrendLineChart
              data={toLinePoints(months, "advance")}
              width={chartWHalf}
              height={168}
              field="revenue"
              color={Theme.chartSeries4}
              gradientId="advancesGrad"
            />
          </PulseChartPanel>
          <PulseChartPanel
            title="Incentive performance"
            subtitle="Commission earned vs paid"
          >
            <TrendBarChart
              data={toIncentiveBars(months)}
              width={chartWHalf}
              height={168}
              primaryField="revenue"
              secondaryField="expense"
              primaryColor={Theme.chartSeries1}
              secondaryColor={Theme.chartSeries5}
            />
          </PulseChartPanel>
        </PulsePanelGrid>
      </PulseSection>

      <PulseSection
        title="Productivity intelligence"
        subtitle="Last 90 days — measure throughput vs idle time"
      >
        <PulseKpiGrid rows={productivityKpiRows} />
      </PulseSection>

      {insights.length > 0 ? (
        <PulseInsightsPanel
          insights={insights.map((i) => ({
            message: i.message,
            tone: i.tone,
          }))}
        />
      ) : null}
    </PulseAnalyticsShell>
  );
}
