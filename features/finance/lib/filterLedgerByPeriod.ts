/**
 * Pure util: filter ledger rows by period. No React, testable.
 */
import type { LedgerRow } from "../services/finance.service";
import type { FinancePeriodFilter } from "../types";
import { dayIsoMatchesPeriod } from "@/lib/dateRangePresets";

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
  return dayIsoMatchesPeriod(dayIso, period, opts);
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
