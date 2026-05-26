/**
 * Driver Earnings Intelligence — pure computation utilities.
 * ============================================================================
 *
 * Powers `<DriverEarningsAnalyticsTab>`. All functions are side-effect-free
 * and memoizable. Shares `tripEarnings` / commission math with the existing
 * Performance Analytics tab via `computeDriverCommissionForTrip`.
 *
 * Categorization is driven by description tags written by the cash-flow
 * forms (`ADVANCE`, `DEDUCTION`, `PENALTY`, `FUEL`, `SALARY`, `BONUS`).
 * Anything not tagged falls into the regular "settlement" bucket — this
 * mirrors the categorization already used in
 * `driverAnalyticsUtils.ts::computePaymentSummary`.
 */

import type { LedgerRow } from "@/features/finance";
import type { TripRow } from "@/features/trips/services/trips.service";
import { computeDriverCommissionForTrip } from "@/features/finance";
import type { SalaryRequestRow } from "@/features/drivers/services/salaryRequests.service";
import type { DriverRow } from "../../services/drivers.service";

import type {
  DriverEarningsKpiHeader,
  DriverProductivityMetrics,
  TrendPoint,
} from "@/features/analytics";

// ─────────────────────────────────────────────────────────────────────────────
// Shared types
// ─────────────────────────────────────────────────────────────────────────────

export interface DriverOffer {
  payableAmount: number | null;
  commissionPercent: number | null;
  commissionPerKm: number | null;
}

/** Categorised ledger totals across the full window. */
export interface DriverTxnCategorisation {
  salary: number;
  advance: number;
  deduction: number;
  fuel: number;
  bonus: number;
  regular: number;
  total: number;
}

/** Monthly bucket of categorised txn flows + commission earned. */
export interface DriverEarningsMonth {
  monthKey: string; // 'YYYY-MM'
  label: string;
  salary: number;
  advance: number;
  deduction: number;
  fuel: number;
  bonus: number;
  regular: number;
  commission: number;
  paid: number; // salary + regular + bonus (excl. advance + deduction + fuel)
  netReceived: number; // paid + bonus - deduction
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function tripDateStr(trip: TripRow): string {
  return (trip.pickup_date ?? trip.created_at ?? "").slice(0, 10);
}

function txDateStr(tx: LedgerRow): string {
  return (tx.transaction_date ?? tx.created_at ?? "").slice(0, 10);
}

function tripEarnings(trip: TripRow, offer: DriverOffer | null): number {
  return computeDriverCommissionForTrip(
    {
      driver_id: trip.driver_id,
      driver_commission: trip.driver_commission ?? null,
      supplier_rate: trip.supplier_rate ?? null,
      client_price: trip.client_price ?? null,
      distance: trip.distance ?? null,
    },
    offer ?? null,
  );
}

/** Tag-bucketing rules — order matters; first match wins. */
function categoriseTx(
  tx: LedgerRow,
): "advance" | "deduction" | "fuel" | "salary" | "bonus" | "regular" {
  const desc = (tx.description ?? "").toUpperCase();
  if (desc.includes("ADVANCE")) return "advance";
  if (desc.includes("DEDUCTION") || desc.includes("PENALTY")) return "deduction";
  if (desc.includes("FUEL")) return "fuel";
  if (desc.includes("SALARY")) return "salary";
  if (desc.includes("BONUS") || desc.includes("INCENTIVE")) return "bonus";
  return "regular";
}

// ─────────────────────────────────────────────────────────────────────────────
// Categorisation + KPI header
// ─────────────────────────────────────────────────────────────────────────────

export function categoriseDriverTransactions(
  txns: readonly LedgerRow[],
): DriverTxnCategorisation {
  let salary = 0;
  let advance = 0;
  let deduction = 0;
  let fuel = 0;
  let bonus = 0;
  let regular = 0;
  for (const tx of txns) {
    const amount = Number(tx.amount_out ?? 0);
    if (amount <= 0) continue;
    switch (categoriseTx(tx)) {
      case "advance":
        advance += amount;
        break;
      case "deduction":
        deduction += amount;
        break;
      case "fuel":
        fuel += amount;
        break;
      case "salary":
        salary += amount;
        break;
      case "bonus":
        bonus += amount;
        break;
      case "regular":
      default:
        regular += amount;
    }
  }
  return {
    salary,
    advance,
    deduction,
    fuel,
    bonus,
    regular,
    total: salary + advance + deduction + fuel + bonus + regular,
  };
}

/** Top-line KPIs for the Earnings Analytics header.
 *
 *  `salaryPaid`        — txn amount tagged SALARY (or untagged = regular settlement)
 *  `pendingSalary`     — open salary requests amount
 *  `tripIncentives`    — sum of `tripEarnings()` across this driver's trips (commission earned)
 *  `advanceTotal`      — txn amount tagged ADVANCE
 *  `deductions`        — txn amount tagged DEDUCTION / PENALTY
 *  `fuelRecovery`      — txn amount tagged FUEL
 *  `bonusTotal`        — txn amount tagged BONUS / INCENTIVE
 *  `monthlyEarnings`   — avg of last 3 months' commission earned
 */
export function computeDriverEarningsKpis(
  trips: readonly TripRow[],
  txns: readonly LedgerRow[],
  requests: readonly SalaryRequestRow[],
  offer: DriverOffer | null,
): DriverEarningsKpiHeader {
  const cat = categoriseDriverTransactions(txns);
  const tripIncentives = trips.reduce((s, t) => s + tripEarnings(t, offer), 0);
  const pendingSalary = requests
    .filter((r) => r.status === "pending")
    .reduce((s, r) => s + Number(r.amount ?? 0), 0);

  // Avg of last 3 months' commission earned for the "monthly earnings" KPI.
  const now = new Date();
  const cutoff = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  const recent = trips.filter((t) => {
    const d = new Date(tripDateStr(t));
    return Number.isFinite(d.getTime()) && d >= cutoff;
  });
  const recentEarnings = recent.reduce((s, t) => s + tripEarnings(t, offer), 0);
  const monthlyEarnings = recent.length > 0 ? recentEarnings / 3 : 0;

  return {
    salaryPaid: cat.salary + cat.regular,
    pendingSalary,
    tripIncentives,
    advanceTotal: cat.advance,
    deductions: cat.deduction,
    fuelRecovery: cat.fuel,
    bonusTotal: cat.bonus,
    monthlyEarnings,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Monthly trends
// ─────────────────────────────────────────────────────────────────────────────

function monthLabelShort(monthKey: string): string {
  const idx = parseInt(monthKey.slice(5, 7), 10) - 1;
  return MONTH_SHORT[idx] ?? monthKey.slice(5, 7);
}

/** Build a monthly earnings ledger over the last N months. */
export function computeDriverEarningsMonths(
  trips: readonly TripRow[],
  txns: readonly LedgerRow[],
  offer: DriverOffer | null,
  monthsBack = 6,
): DriverEarningsMonth[] {
  const keys: string[] = [];
  const now = new Date();
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  return keys.map((key) => {
    const tSlice = trips.filter((t) => tripDateStr(t).slice(0, 7) === key);
    const txSlice = txns.filter((tx) => txDateStr(tx).slice(0, 7) === key);
    const monthCat = categoriseDriverTransactions(txSlice);
    const commission = tSlice.reduce((s, t) => s + tripEarnings(t, offer), 0);
    const paid = monthCat.salary + monthCat.regular + monthCat.bonus;
    const netReceived = paid - monthCat.deduction;
    return {
      monthKey: key,
      label: monthLabelShort(key),
      salary: monthCat.salary,
      advance: monthCat.advance,
      deduction: monthCat.deduction,
      fuel: monthCat.fuel,
      bonus: monthCat.bonus,
      regular: monthCat.regular,
      commission,
      paid,
      netReceived,
    };
  });
}

/** Project a monthly series onto a generic `TrendPoint[]` for charts. */
export function projectEarningsToTrend(
  months: readonly DriverEarningsMonth[],
  field:
    | "commission"
    | "paid"
    | "advance"
    | "netReceived"
    | "bonus"
    | "deduction"
    | "fuel",
): TrendPoint[] {
  return months.map((m) => ({
    period: m.monthKey,
    label: m.label,
    value: m[field],
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Productivity Intelligence
// ─────────────────────────────────────────────────────────────────────────────

/** Compute productivity metrics over a fixed window. Defaults to last
 *  90 days — the "operational present" — same window the existing
 *  `DriverAnalyticsTab` uses for KPI deltas. */
export function computeDriverProductivity(
  trips: readonly TripRow[],
  driver: DriverRow | null,
  options: { windowDays?: number; now?: Date } = {},
): DriverProductivityMetrics {
  const now = options.now ?? new Date();
  const windowDays = options.windowDays ?? 90;
  const windowStart = new Date(now);
  windowStart.setDate(windowStart.getDate() - windowDays);

  const tripsInWindow = trips
    .map((t) => ({ trip: t, date: new Date(tripDateStr(t)) }))
    .filter(
      (entry): entry is { trip: TripRow; date: Date } =>
        Number.isFinite(entry.date.getTime()) && entry.date >= windowStart,
    );

  const totalRevenue = tripsInWindow.reduce(
    (s, e) => s + Number(e.trip.client_price ?? 0),
    0,
  );
  const totalKm = tripsInWindow.reduce(
    (s, e) => s + Number(e.trip.distance ?? 0),
    0,
  );

  // Active days = distinct calendar days with at least one trip.
  const activeDaysSet = new Set<string>();
  for (const e of tripsInWindow) {
    activeDaysSet.add(tripDateStr(e.trip));
  }

  // Total relevant days = clamp(windowDays, days since driver joined).
  const joinedAt = driver?.created_at ? new Date(driver.created_at) : null;
  const effectiveStart =
    joinedAt && Number.isFinite(joinedAt.getTime()) && joinedAt > windowStart
      ? joinedAt
      : windowStart;
  const totalDays = Math.max(
    1,
    Math.ceil((now.getTime() - effectiveStart.getTime()) / (1000 * 60 * 60 * 24)),
  );
  const activeDays = activeDaysSet.size;
  const idleDays = Math.max(0, totalDays - activeDays);

  // Trips/week = trips / (totalDays / 7).
  const tripsPerWeek =
    totalDays > 0 ? (tripsInWindow.length / totalDays) * 7 : 0;

  return {
    revenuePerDay: activeDays > 0 ? totalRevenue / activeDays : 0,
    tripsPerWeek,
    kmDriven: totalKm,
    idleDays,
    activeDays,
    revenuePerKm: totalKm > 0 ? totalRevenue / totalKm : 0,
  };
}
