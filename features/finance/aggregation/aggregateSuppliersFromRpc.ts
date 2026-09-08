/**
 * Server-side equivalent of aggregateSuppliers.ts's row-building step. The
 * financial numbers (due/paid/unsettled/trips) come from
 * get_supplier_ledger_aggregation (unbounded); the decoration below
 * (name/subline/contactPerson) is copied verbatim from aggregateSuppliers.ts
 * (lines 161-189) so the rendered row is identical to today's for a supplier
 * with the same data. aggregateSuppliers.ts itself is left unchanged and
 * still used by connectionGoalsAnalytics.util.ts.
 */
import type { FinancialRowData, AggregationTotals, SupplierLike } from './types';
import type { SupplierLedgerAggregationRow } from '@/features/finance/services/ledgerAggregationRpc.service';

function getSupplierDisplayName(s: SupplierLike): string {
  return (s.name || s.company_name || s.contact_person || 'Unnamed').trim() || 'Unnamed';
}

export function aggregateSuppliersFromRpc(
  suppliers: readonly SupplierLike[],
  rpcRows: readonly SupplierLedgerAggregationRow[],
): { rows: FinancialRowData[]; totals: AggregationTotals } {
  const bySupplierId = new Map(rpcRows.map((r) => [r.supplier_id, r]));

  const rows: FinancialRowData[] = [];
  let totalPayables = 0;
  let totalUnsettled = 0;

  for (let i = 0; i < suppliers.length; i++) {
    const s = suppliers[i];
    const id = s.id;
    const financials = bySupplierId.get(id);
    const due = financials?.due ?? 0;
    const paid = financials?.paid ?? 0;
    const unsettled = financials?.unsettled ?? Math.max(0, due - paid);
    const tripCount = financials?.trips_count ?? 0;
    totalPayables += due;
    totalUnsettled += unsettled;

    rows.push({
      id,
      name: getSupplierDisplayName(s),
      subline: s.supplier_type === 'integrated' ? 'INTEGRATED' : s.supplier_type === 'offline' || s.supplier_type === 'marketplace' ? 'NON_INTEGRATED' : 'SECURE NODE',
      trips: tripCount,
      sourced: tripCount,
      due: unsettled,
      payables: due,
      paid,
      sales: due,
      is_integrated: s.supplier_type === 'integrated',
      linked_organization_id: s.linked_organization_id ?? undefined,
      contactPerson: (s.contact_person ?? '').trim() || undefined,
    });
  }

  return {
    rows,
    totals: { totalIn: totalPayables, totalOut: totalUnsettled },
  };
}
