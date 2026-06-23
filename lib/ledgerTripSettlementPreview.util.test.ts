import {
  ledgerEntryLooksLikeDuplicate,
  resolveLedgerTripSettlementPreview,
} from "@/lib/ledgerTripSettlementPreview.util";
import type { TripEntryFinancialSnapshot } from "@/features/finance/utils/computeTripEntryFinancials.util";

function baseSnap(
  overrides: Partial<TripEntryFinancialSnapshot["lines"]> = {},
): TripEntryFinancialSnapshot {
  return {
    trip_id: "t1",
    trip_type: "market",
    client_id: "c1",
    supplier_id: "s1",
    driver_id: null,
    financials: {
      client_receivable: 0,
      supplier_payable: 0,
      driver_payable: 0,
      supplier_payable_raw: 0,
      driver_payable_raw: 0,
    },
    lines: {
      client_sale: 25000,
      client_received: 25000,
      client_due: 0,
      supplier_cost: 20000,
      supplier_paid: 20000,
      supplier_due: 0,
      driver_to_pay: 0,
      driver_paid: 0,
      driver_due: 0,
      ...overrides,
    },
  };
}

describe("resolveLedgerTripSettlementPreview", () => {
  it("marks client cash-in as fully settled when received equals sale", () => {
    const preview = resolveLedgerTripSettlementPreview(baseSnap(), "in", "CLIENT");
    expect(preview?.isFullySettled).toBe(true);
    expect(preview?.recordedInr).toBe(25000);
    expect(preview?.dueInr).toBe(0);
  });

  it("flags duplicate when re-entering the settled amount", () => {
    const preview = resolveLedgerTripSettlementPreview(baseSnap(), "in", "CLIENT");
    expect(ledgerEntryLooksLikeDuplicate(preview, 25000)).toBe(true);
    expect(ledgerEntryLooksLikeDuplicate(preview, 10000)).toBe(false);
  });

  it("shows partial supplier payable when some amount is already paid", () => {
    const snap = baseSnap({
      supplier_cost: 20000,
      supplier_paid: 12000,
      supplier_due: 8000,
    });
    snap.financials.supplier_payable_raw = 8000;
    const preview = resolveLedgerTripSettlementPreview(snap, "out", "SUPPLIER");
    expect(preview?.isPartiallySettled).toBe(true);
    expect(preview?.dueInr).toBe(8000);
    expect(preview?.recordedInr).toBe(12000);
  });
});
