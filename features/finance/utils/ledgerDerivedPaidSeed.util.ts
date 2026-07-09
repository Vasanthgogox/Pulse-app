/**
 * Ledger Derived Amount Rule (docs/FINANCE_ACCEPTANCE_GATE_v1.md):
 * If a trip has ledger-linked transactions, trip.amount_paid is a derived value
 * (trg_sync_trip_payment_status keeps it in sync) and must never be added to those
 * transactions again. Consumers choose either the ledger transactions or the derived
 * field — never both. This is the single canonical implementation of that rule; every
 * screen/aggregator that seeds a "paid so far" total before walking ledger transactions
 * must call this instead of reimplementing the check.
 */
export function computeLedgerDerivedPaidSeed(input: {
  amountPaid: number | null | undefined;
  hasLinkedTransaction: boolean;
}): number {
  if (input.hasLinkedTransaction) return 0;
  return Number(input.amountPaid ?? 0);
}
