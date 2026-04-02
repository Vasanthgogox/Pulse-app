/**
 * Pure util: filter ledger rows by period (TODAY | MONTH | RANGE). No React, testable.
 */
import type { LedgerRow } from '../services/finance.service';
import type { FinancePeriodFilter } from '../types';

export function filterLedgerByPeriod(
  rows: LedgerRow[],
  period: FinancePeriodFilter,
): LedgerRow[] {
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .slice(0, 10);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    .toISOString()
    .slice(0, 10);
  return rows.filter((r) => {
    const d = (r.transaction_date || r.created_at || "").slice(0, 10);
    if (period === "TODAY") return d === today;
    if (period === "MONTH") return d >= startOfMonth && d <= endOfMonth;
    return true;
  });
}
