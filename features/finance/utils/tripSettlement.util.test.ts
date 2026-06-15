import {
  computeTripSettlementDues,
  rollupTripSettlementLedger,
  tripPayableCostTarget,
} from "@/features/finance/utils/tripSettlement.util";
import type { LedgerRow } from "@/features/finance/services/finance.service";
import type { TripRow } from "@/features/trips/services/trips.service";

function trip(overrides: Partial<TripRow> = {}): TripRow {
  return {
    id: "trip-1",
    organization_id: "org-1",
    client_price: 15000,
    supplier_rate: 0,
    driver_id: "driver-1",
    trip_payout_mode: "asset",
    amount_paid: 0,
    ...overrides,
  } as TripRow;
}

function ledger(partial: Partial<LedgerRow>): LedgerRow {
  return {
    id: "tx-1",
    trip_id: "trip-1",
    amount_in: 0,
    amount_out: 0,
    ...partial,
  } as LedgerRow;
}

describe("tripSettlement.util", () => {
  it("counts driver commission as asset payable target", () => {
    const target = tripPayableCostTarget(
      trip(),
      "org-1",
      null,
      { commissionPercent: 10, payableAmount: null, commissionPerKm: null },
    );
    expect(target).toBe(1500);
  });

  it("uses driver-tagged payouts for asset payable due", () => {
    const settlement = computeTripSettlementDues({
      trip: trip(),
      viewerOrgId: "org-1",
      ledgerEntries: [
        ledger({
          id: "in-1",
          contact_type: "client",
          amount_in: 21000,
        }),
        ledger({
          id: "out-1",
          contact_type: "driver",
          amount_out: 500,
        }),
      ],
      driverOffer: {
        commissionPercent: 10,
        payableAmount: null,
        commissionPerKm: null,
      },
    });

    expect(settlement.receivableTarget).toBe(15000);
    expect(settlement.receivableDue).toBe(0);
    expect(settlement.payableTarget).toBe(1500);
    expect(settlement.payableDue).toBe(1000);
    expect(settlement.payablePaid).toBe(500);
  });

  it("rolls client receipts separately from other inflows", () => {
    const rollup = rollupTripSettlementLedger(
      [
        ledger({ id: "a", contact_type: "client", amount_in: 12000 }),
        ledger({ id: "b", contact_type: "driver", amount_in: 3000 }),
      ],
      { amountPaidFallback: 15000 },
    );
    expect(rollup.clientReceived).toBe(15000);
  });
});
