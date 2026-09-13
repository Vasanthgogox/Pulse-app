import type { TripRow } from "./services/trips.service";

/**
 * In-memory first-paint seed for Trip Detail (not TanStack Query).
 *
 * Used by:
 * - Award / Authorize Voyage (`setInitialTripForDetail` before navigate)
 * - Trips list → detail (`useOpenTripDetail` stashes the existing TripRow)
 *
 * TripRow is a partial seed only. `get_trip_detail_bundle` / `queryKeys.trips.bundle`
 * remains the authoritative hydration source — never write this seed into that cache.
 */
let initialTripById: Record<string, TripRow> = {};

export function setInitialTripForDetail(trip: TripRow): void {
  if (trip?.id) initialTripById[trip.id] = trip;
}

export function getInitialTripForDetail(tripId: string): TripRow | null {
  const t = initialTripById[tripId] ?? null;
  return t?.id === tripId ? t : null;
}

export function clearInitialTripForDetail(tripId: string): void {
  delete initialTripById[tripId];
}
