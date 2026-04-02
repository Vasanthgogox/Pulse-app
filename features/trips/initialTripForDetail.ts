import type { TripRow } from "./services/trips.service";

/**
 * When the supplier opens trip detail from the load flow (Authorize Voyage),
 * we have the just-created trip from acceptAwardedQuote. Stash it here so
 * TripDetailScreen can show it immediately instead of "Trip not found" while
 * the supplier fallback or RPC catches up.
 */
let initialTripById: Record<string, TripRow> = {};

export function setInitialTripForDetail(trip: TripRow): void {
  if (trip?.id) initialTripById[trip.id] = trip;
}

export function getInitialTripForDetail(tripId: string): TripRow | null {
  const t = initialTripById[tripId] ?? null;
  return t;
}

export function clearInitialTripForDetail(tripId: string): void {
  delete initialTripById[tripId];
}
