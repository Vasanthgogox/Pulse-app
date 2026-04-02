/**
 * Pure util: compute total in/out from ledger rows. No React, testable.
 */
import type { LedgerRow } from '../services/finance.service';

export function ledgerTotals(rows: LedgerRow[]): { totalIn: number; totalOut: number } {
  return {
    totalIn: rows.reduce((s, r) => s + (r.amount_in ?? 0), 0),
    totalOut: rows.reduce((s, r) => s + (r.amount_out ?? 0), 0),
  };
}
