/**
 * DCO-6: server-side aggregation for the DCO / Independent Operators
 * Finance tab. Mirrors aggregateSuppliersFromRpc.ts's shape, but with one
 * structural difference: dco_payees has no organization_id (a DCO is a
 * global, person-owned identity, not org-owned like suppliers), so there is
 * no anchor list to iterate — get_dco_ledger_aggregation's own result set
 * is already exactly "every DCO payee with at least one trip in this org."
 * A payee with zero trips here is correctly absent, not something this
 * adapter needs to backfill.
 */
import type { FinancialRowData, AggregationTotals } from './types';
import type { DcoLedgerAggregationRow } from '@/features/finance/services/ledgerAggregationRpc.service';

export interface DcoPayeeName {
  dco_user_id: string;
  name: string;
  phone?: string | null;
}

export function aggregateDcoPayeesFromRpc(
  rpcRows: readonly DcoLedgerAggregationRow[],
  namesByUserId: ReadonlyMap<string, DcoPayeeName>,
): { rows: FinancialRowData[]; totals: AggregationTotals } {
  const rows: FinancialRowData[] = [];
  let totalPayables = 0;
  let totalOutstanding = 0;

  for (const r of rpcRows) {
    const nameInfo = namesByUserId.get(r.dco_user_id);
    totalPayables += r.due;
    totalOutstanding += r.outstanding;

    rows.push({
      id: r.dco_payee_id,
      name: (nameInfo?.name || '').trim() || 'Unnamed',
      subline: 'DCO',
      trips: r.trips_count,
      sourced: r.trips_count,
      due: r.outstanding,
      payables: r.due,
      paid: r.paid,
      contactPerson: (nameInfo?.phone ?? '').trim() || undefined,
      counterpartyKind: 'dco',
    });
  }

  return {
    rows,
    totals: { totalIn: totalPayables, totalOut: totalOutstanding },
  };
}
