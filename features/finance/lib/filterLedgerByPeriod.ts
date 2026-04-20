/**
 * Pure util: filter ledger rows by period. No React, testable.
 */
import type { LedgerRow } from "../services/finance.service";
import type { FinancePeriodFilter } from "../types";
import {
  endOfIsoWeekMonday,
  endOfMonth,
  startOfIsoWeekMonday,
  startOfMonth,
  toIsoDateLocal,
} from "@/lib/dateRangePresets";

export type LedgerPeriodFilterOptions = {
  customFrom?: string | null;
  customTo?: string | null;
};

function rowDayIso(r: LedgerRow): string {
  return (r.transaction_date || r.created_at || "").slice(0, 10);
}

/** Whether a YYYY-MM-DD string falls in the active period window. */
export function ledgerDayMatchesPeriod(
  dayIso: string,
  period: FinancePeriodFilter,
  opts?: LedgerPeriodFilterOptions,
): boolean {
  if (!dayIso || dayIso.length < 10) return period === "RANGE";
  const d = dayIso.slice(0, 10);
  const now = new Date();
  const today = toIsoDateLocal(now);

  if (period === "RANGE") return true;

  if (period === "CUSTOM") {
    const from = (opts?.customFrom ?? "").slice(0, 10);
    const to = (opts?.customTo ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      return true;
    }
    return d >= from && d <= to;
  }

  if (period === "TODAY") return d === today;

  if (period === "YESTERDAY") {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    return d === toIsoDateLocal(y);
  }

  if (period === "WEEK") {
    const s = toIsoDateLocal(startOfIsoWeekMonday(now));
    const e = toIsoDateLocal(endOfIsoWeekMonday(now));
    return d >= s && d <= e;
  }

  if (period === "MONTH") {
    const s = toIsoDateLocal(startOfMonth(now));
    const e = toIsoDateLocal(endOfMonth(now));
    return d >= s && d <= e;
  }

  return true;
}

export function filterLedgerByPeriod(
  rows: LedgerRow[],
  period: FinancePeriodFilter,
  opts?: LedgerPeriodFilterOptions,
): LedgerRow[] {
  return rows.filter((r) =>
    ledgerDayMatchesPeriod(rowDayIso(r), period, opts),
  );
}
