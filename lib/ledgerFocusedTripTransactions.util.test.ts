import type { LedgerRow } from "@/features/finance/services/finance.service";
import { buildLedgerFocusedTransactionLines } from "@/lib/ledgerFocusedTripTransactions.util";

function tx(partial: Partial<LedgerRow> & Pick<LedgerRow, "id">): LedgerRow {
  return {
    organization_id: "org1",
    trip_id: "trip1",
    party_name: "Myntra",
    description: "Trip Payment",
    amount_in: 0,
    amount_out: 0,
    transaction_date: "2026-06-01",
    created_at: "2026-06-01T10:00:00Z",
    ...partial,
  };
}

describe("buildLedgerFocusedTransactionLines", () => {
  it("returns client receipts newest first", () => {
    const rows = buildLedgerFocusedTransactionLines(
      [
        tx({ id: "a", amount_in: 30000, transaction_date: "2026-06-01" }),
        tx({ id: "b", amount_in: 25200, transaction_date: "2026-06-12" }),
      ],
      "trip1",
      "TRIP-1",
      "client",
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].id).toBe("b");
    expect(rows[0].amountInr).toBe(25200);
    expect(rows[1].amountInr).toBe(30000);
  });

  it("filters supplier payments by contact_type", () => {
    const rows = buildLedgerFocusedTransactionLines(
      [
        tx({
          id: "s",
          amount_out: 12000,
          contact_type: "supplier",
          description: "Settlement",
        }),
        tx({
          id: "d",
          amount_out: 5000,
          contact_type: "driver",
        }),
      ],
      "trip1",
      "TRIP-1",
      "supplier",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("s");
  });
});
