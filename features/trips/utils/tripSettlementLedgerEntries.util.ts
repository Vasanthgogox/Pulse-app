import type { LedgerRow } from "@/features/finance/services/finance.service";

export type TripSettlementLane = "receivable" | "payable";

/** Ledger rows that settled a receivable or payable lane on this trip. */
export function tripLedgerEntriesForSettlementLane(
  entries: LedgerRow[],
  lane: TripSettlementLane,
  payableEntityType: "supplier" | "driver" = "supplier",
): LedgerRow[] {
  if (lane === "receivable") {
    return entries.filter(
      (tx) =>
        tx.contact_type === "client" && Number(tx.amount_in ?? 0) > 0,
    );
  }
  const contactType = payableEntityType === "driver" ? "driver" : "supplier";
  return entries.filter(
    (tx) =>
      tx.contact_type === contactType && Number(tx.amount_out ?? 0) > 0,
  );
}

/** Newest settlement entry for a lane (matches finance history sort). */
export function latestTripSettlementLedgerEntry(
  entries: LedgerRow[],
  lane: TripSettlementLane,
  payableEntityType: "supplier" | "driver" = "supplier",
): LedgerRow | null {
  const laneRows = tripLedgerEntriesForSettlementLane(
    entries,
    lane,
    payableEntityType,
  );
  if (laneRows.length === 0) return null;
  return [...laneRows].sort((a, b) => {
    const da = new Date(a.transaction_date || a.created_at).getTime();
    const db = new Date(b.transaction_date || b.created_at).getTime();
    return db - da;
  })[0]!;
}
