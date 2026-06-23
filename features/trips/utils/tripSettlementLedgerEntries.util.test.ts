import type { LedgerRow } from "@/features/finance/services/finance.service";
import {
  latestTripSettlementLedgerEntry,
  tripLedgerEntriesForSettlementLane,
} from "./tripSettlementLedgerEntries.util";

function row(partial: Partial<LedgerRow> & { id: string }): LedgerRow {
  return {
    organization_id: "org",
    transaction_date: "2026-01-01",
    created_at: "2026-01-01T00:00:00Z",
    ...partial,
  } as LedgerRow;
}

describe("tripSettlementLedgerEntries", () => {
  const entries: LedgerRow[] = [
    row({
      id: "1",
      contact_type: "client",
      amount_in: 25000,
      transaction_date: "2026-03-01",
    }),
    row({
      id: "2",
      contact_type: "client",
      amount_in: 5000,
      transaction_date: "2026-02-01",
    }),
    row({
      id: "3",
      contact_type: "supplier",
      amount_out: 12000,
      transaction_date: "2026-02-15",
    }),
  ];

  it("filters receivable client cash-in rows", () => {
    expect(tripLedgerEntriesForSettlementLane(entries, "receivable")).toHaveLength(
      2,
    );
  });

  it("returns newest receivable settlement entry", () => {
    const latest = latestTripSettlementLedgerEntry(entries, "receivable");
    expect(latest?.id).toBe("1");
  });

  it("filters payable supplier cash-out rows", () => {
    expect(
      tripLedgerEntriesForSettlementLane(entries, "payable", "supplier"),
    ).toHaveLength(1);
  });
});
