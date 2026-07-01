import { getDoubleEntryDisplayLabel } from "@/features/finance/accounting/accountingModel";
import type { LedgerRow } from "@/features/finance/services/finance.service";
import { getTripLedgerEntries } from "@/features/finance/utils/getTripLedgerEntries";
import { formatLedgerDate } from "@/lib/format";

export type LedgerFocusedTransactionLane = "client" | "supplier" | "driver";

export type LedgerFocusedTransactionLine = {
  id: string;
  label: string;
  dateLabel: string;
  amountInr: number;
};

function laneMatches(tx: LedgerRow, lane: LedgerFocusedTransactionLane): boolean {
  if (lane === "client") return Number(tx.amount_in ?? 0) > 0;
  const out = Number(tx.amount_out ?? 0);
  if (out <= 0) return false;
  const ct = String(tx.contact_type ?? "").toLowerCase();
  if (lane === "supplier") return ct === "supplier";
  return ct === "driver";
}

function laneAmount(tx: LedgerRow, lane: LedgerFocusedTransactionLane): number {
  if (lane === "client") return Number(tx.amount_in ?? 0);
  return Number(tx.amount_out ?? 0);
}

/** Individual ledger posts for a trip lane (receipts or payments), newest first. */
export function buildLedgerFocusedTransactionLines(
  transactions: LedgerRow[] | null | undefined,
  tripId: string | null | undefined,
  tripDisplayNumber: string | null | undefined,
  lane: LedgerFocusedTransactionLane,
): LedgerFocusedTransactionLine[] {
  if (!tripId) return [];

  const entries = getTripLedgerEntries(transactions, tripId, tripDisplayNumber).filter((tx) =>
    laneMatches(tx, lane),
  );

  return entries
    .slice()
    .sort((a, b) => {
      const ta = new Date(a.transaction_date ?? a.created_at).getTime();
      const tb = new Date(b.transaction_date ?? b.created_at).getTime();
      return tb - ta;
    })
    .map((tx) => {
      const amountInr = laneAmount(tx, lane);
      const label =
        getDoubleEntryDisplayLabel(tx) ??
        (tx.description?.trim() ||
          tx.party_name?.trim() ||
          (lane === "client" ? "Receipt" : "Payment"));
      const dateRaw = tx.transaction_date ?? tx.created_at;
      return {
        id: tx.id,
        label,
        dateLabel: dateRaw ? formatLedgerDate(dateRaw) : "—",
        amountInr,
      };
    });
}
