import type { TripRow } from "@/features/trips/services/trips.service";

export type OperationalOwner = "organization_vehicle" | "supplier_vehicle";
export type AccountingMode = "vehicle_economics" | "supplier_operations";

function normalizeMode(mode: TripRow["trip_payout_mode"]): string {
  return String(mode ?? "")
    .trim()
    .toLowerCase();
}

export function isAssetTrip(trip: TripRow): boolean {
  const payoutMode = normalizeMode(trip.trip_payout_mode);
  if (payoutMode === "asset") return true;
  if (payoutMode === "market") return false;
  return !trip.supplier_id;
}

export function isAggregationTrip(trip: TripRow): boolean {
  return !isAssetTrip(trip);
}

export function getOperationalOwner(trip: TripRow): OperationalOwner {
  return isAssetTrip(trip) ? "organization_vehicle" : "supplier_vehicle";
}

export function getAccountingMode(trip: TripRow): AccountingMode {
  return isAssetTrip(trip) ? "vehicle_economics" : "supplier_operations";
}
