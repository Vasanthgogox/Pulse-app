import type { TripRow } from "@/features/trips/services/trips.service";

type PaidSeedInput = {
  trip: Pick<TripRow, "source" | "amount_paid">;
  hasLinkedClientTx: boolean;
};

/**
 * Client detail "paid" seed for a trip before ledger attribution.
 * Manual trips keep amount_paid as fallback only when no linked client tx exists.
 */
export function computeClientPaidSeed({
  trip,
  hasLinkedClientTx,
}: PaidSeedInput): number {
  const isManualTrip = String(trip.source ?? "").trim().toLowerCase() === "manual";
  if (isManualTrip && hasLinkedClientTx) return 0;
  return Number(trip.amount_paid ?? 0);
}

