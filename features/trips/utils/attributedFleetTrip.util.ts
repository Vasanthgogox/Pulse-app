import type { TripRow } from "@/features/trips/services/trips.service";

/** Written by `attribution-trip-create` when a driver open trip is accepted into fleet. */
export const ATTRIBUTED_FLEET_TRIP_NOTES_PREFIX = "Attributed trip from";

export function buildAttributedFleetTripNotes(sourceRef: string): string {
  const ref = String(sourceRef ?? "").trim() || "source trip";
  return `${ATTRIBUTED_FLEET_TRIP_NOTES_PREFIX} ${ref}`;
}

/** Fleet trip created via the driver attribution accept flow (employer-side row). */
export function isAttributedFleetTrip(
  trip: Pick<TripRow, "notes"> | null | undefined,
): boolean {
  const notes = String(trip?.notes ?? "").trim();
  if (!notes) return false;
  return notes.startsWith(ATTRIBUTED_FLEET_TRIP_NOTES_PREFIX);
}
