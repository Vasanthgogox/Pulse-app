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
  /**
   * Unset mode: supplier-linked trips stay aggregate even after subcontractor driver assign.
   * Integrated asset loads with bookkeeping supplier_id must set trip_payout_mode = asset.
   */
  if (String(trip.supplier_id ?? "").trim()) return "aggregate";
  return "asset";
}

export function isAssetExecutionTrip(trip: TripRow): boolean {
  return getTripExecutionModel(trip) === "asset";
}

export function isAggregateExecutionTrip(trip: TripRow): boolean {
  return getTripExecutionModel(trip) === "aggregate";
}
