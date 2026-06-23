import type { TripRow } from "@/features/trips/services/trips.service";

/** v1: market = pay supplier (aggregator); asset = pay driver + vehicle; never both in UI. */
export type TripLedgerTripType = "market" | "asset";

export type TripPayoutModeInput = Pick<
  TripRow,
  "supplier_id" | "trip_payout_mode" | "driver_id" | "vehicle_id"
>;

/**
 * Resolves ledger payout mode for a trip.
 * Prefer persisted `trip_payout_mode` when set; otherwise infer from supplier link.
 */
export function resolveTripLedgerTripType(
  trip: TripPayoutModeInput | null | undefined,
): TripLedgerTripType {
  const raw = (trip?.trip_payout_mode ?? "").trim().toLowerCase();
  if (raw === "market" || raw === "asset") return raw;
  const sid = (trip?.supplier_id ?? "").trim();
  if (sid) return "market";
  return "asset";
}
