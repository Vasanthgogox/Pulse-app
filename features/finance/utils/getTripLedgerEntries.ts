import type { LedgerRow } from "../services/finance.service";

export function getTripLedgerEntries(
  transactions: LedgerRow[] | null | undefined,
  tripId: string | null | undefined,
): LedgerRow[] {
  if (!tripId || !transactions?.length) return [];
  const entries: LedgerRow[] = [];
  for (let i = 0; i < transactions.length; i++) {
    const tx = transactions[i];
    if (tx.trip_id === tripId) entries.push(tx);
  }
  return entries;
}
