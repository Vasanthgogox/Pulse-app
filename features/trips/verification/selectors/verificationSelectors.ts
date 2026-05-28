import type { TripRow } from "@/features/trips/services/trips.service";
import type {
  DistanceSource,
  TripVerificationSnapshot,
} from "../types";
import { deriveVerificationState } from "../state/verificationState";

export function toVerificationSnapshot(trip: TripRow): TripVerificationSnapshot {
  return {
    startOdometerKm: trip.start_odometer_km ?? null,
    endOdometerKm: trip.end_odometer_km ?? null,
    odometerDistanceKm: trip.odometer_distance_km ?? null,
    gpsDistanceKm: trip.gps_distance_km ?? null,
    distanceDiscrepancyKm: trip.distance_discrepancy_km ?? null,
    distanceSource: (trip.distance_source as DistanceSource | null) ?? null,
    state: deriveVerificationState(trip),
    odometerNotes: trip.odometer_notes ?? null,
    odometerUpdatedAt: trip.odometer_updated_at ?? null,
    odometerUpdatedBy: trip.odometer_updated_by ?? null,
  };
}

export function formatKm(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  return `${Number(v).toLocaleString("en-IN", { maximumFractionDigits: 1 })} KM`;
}
