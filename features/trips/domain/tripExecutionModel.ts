import type { TripRow } from "@/features/trips/services/trips.service";

export type TripExecutionModel = "asset" | "aggregate";

function normalizePayoutMode(mode: TripRow["trip_payout_mode"]): string {
  return String(mode ?? "")
    .trim()
    .toLowerCase();
}

/**
 * Canonical execution model for trip accounting and UX branching.
 * This is the single source of truth for asset vs aggregate behavior.
 */
export function getTripExecutionModel(trip: TripRow): TripExecutionModel {
  // A mover's own execution trip (created when a mover deploys an awarded load
  // with its own driver + vehicle) is ALWAYS asset — the mover pays its driver
  // and books truck expenses on it. Force asset here so its finance UI (driver
  // payout + fuel/toll) can never fall back to the supplier/aggregate layout,
  // regardless of how trip_payout_mode was persisted.
  if (String(trip.source ?? "").trim().toLowerCase() === "mover_asset") {
    return "asset";
  }
  const payoutMode = normalizePayoutMode(trip.trip_payout_mode);
  if (payoutMode === "asset") return "asset";
  if (payoutMode === "market") return "aggregate";
  /**
   * Unset mode. `supplier_id` alone cannot decide this: on the direct-quote
   * deploy path it is bookkeeping only (the shipper's supplier row for the
   * winning bidder) and is therefore present on BOTH models.
   *
   * The real discriminator is how the load is executed:
   *   own driver + own vehicle  -> the supplier hauls it himself         -> asset
   *   anything else             -> handed to a sub-supplier (phone/plate
   *                                typed in, no roster ids)              -> aggregate
   *
   * create_trip_from_direct_quote does not stamp trip_payout_mode, so without
   * this check every first-supplier asset deploy rendered the aggregate
   * trip-detail UI (no Expense Hub, no driver payout).
   */
  const hasOwnDriver = String(trip.driver_id ?? "").trim().length > 0;
  const hasOwnVehicle = String(trip.vehicle_id ?? "").trim().length > 0;
  if (hasOwnDriver && hasOwnVehicle) return "asset";
  if (String(trip.supplier_id ?? "").trim()) return "aggregate";
  return "asset";
}

export function isAssetExecutionTrip(trip: TripRow): boolean {
  return getTripExecutionModel(trip) === "asset";
}

export function isAggregateExecutionTrip(trip: TripRow): boolean {
  return getTripExecutionModel(trip) === "aggregate";
}
