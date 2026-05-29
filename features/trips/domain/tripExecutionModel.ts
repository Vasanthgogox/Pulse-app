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
  const payoutMode = normalizePayoutMode(trip.trip_payout_mode);
  if (payoutMode === "asset") return "asset";
  if (payoutMode === "market") return "aggregate";
  /** Unset mode: own roster (driver or vehicle) wins over bookkeeping supplier_id. */
  const hasAssignedFleet =
    Boolean(String(trip.driver_id ?? "").trim()) ||
    Boolean(String(trip.vehicle_id ?? "").trim());
  if (hasAssignedFleet) return "asset";
  return trip.supplier_id ? "aggregate" : "asset";
}

export function isAssetExecutionTrip(trip: TripRow): boolean {
  return getTripExecutionModel(trip) === "asset";
}

export function isAggregateExecutionTrip(trip: TripRow): boolean {
  return getTripExecutionModel(trip) === "aggregate";
}
