import type { TripRow } from "@/features/trips/services/trips.service";
import { computeLedgerDerivedPaidSeed } from "@/features/finance/utils/ledgerDerivedPaidSeed.util";

type PaidSeedInput = {
  trip: Pick<TripRow, "amount_paid">;
  hasLinkedClientTx: boolean;
};

/**
 * Client-detail-specific name for the Ledger Derived Amount Rule
 * (computeLedgerDerivedPaidSeed) — kept as a thin wrapper so existing call sites
 * and tests don't need to change. New call sites should prefer the canonical
 * utility directly; this exists for the client-detail screen's naming continuity only.
 */
export function computeClientPaidSeed({
  trip,
  hasLinkedClientTx,
}: PaidSeedInput): number {
  return computeLedgerDerivedPaidSeed({
    amountPaid: trip.amount_paid,
    hasLinkedTransaction: hasLinkedClientTx,
  });
}

