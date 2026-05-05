import type { LedgerRow } from "@/features/finance/services/finance.service";

/**
 * Sum all trip cash outflows except supplier settlements.
 * Used as non-supplier expense component in trip payable/cost rollups.
 */
export function tripNonSupplierOutflowTotal(
  ledgerRows: LedgerRow[] | null | undefined,
): number {
  if (!ledgerRows?.length) return 0;

  return ledgerRows.reduce((sum, row) => {
    const outflow = Number(row.amount_out ?? 0);
    if (outflow <= 0) return sum;

    const contactType = String(row.contact_type ?? "").trim().toLowerCase();
    if (contactType === "supplier") return sum;

    return sum + outflow;
  }, 0);
}
