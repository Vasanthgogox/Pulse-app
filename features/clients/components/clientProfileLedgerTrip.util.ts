/**
 * Trip id + route label for client statement ledger rows.
 */
import type { LedgerRow } from "@/features/finance/services/finance.service";
import { getTripOperationalDisplay } from "@/features/operations/display";
import type { TripRow } from "@/features/trips/services/trips.service";

export type LedgerTripRouteCell = {
  tripIdLabel: string;
  routeLabel: string;
};

export function buildTripByIdMap(trips: readonly TripRow[]): Map<string, TripRow> {
  const map = new Map<string, TripRow>();
  for (const t of trips) {
    if (t.id) map.set(t.id, t);
  }
  return map;
}

export function ledgerTripRouteCell(
  row: LedgerRow,
  tripById: Map<string, TripRow>,
): LedgerTripRouteCell | null {
  const tripId = row.trip_id?.trim();
  if (!tripId) return null;
  const trip = tripById.get(tripId);
  const tripIdLabel = getTripOperationalDisplay({
    trip_operational_code:
      row.trips?.trip_operational_code ?? trip?.trip_operational_code ?? null,
    trip_code: row.trips?.trip_code ?? trip?.trip_code ?? null,
    display_trip_id: row.trips?.display_trip_id ?? trip?.display_trip_id ?? null,
    trip_number:
      row.trips?.trip_number ?? trip?.trip_number ?? row.trip_number ?? null,
  });
  const pickup = (trip?.pickup_area ?? "").trim();
  const drop = (trip?.drop_location ?? trip?.drop_area ?? "").trim();
  const routeLabel =
    pickup && drop ? `${pickup} → ${drop}` : pickup || drop || "";
  return {
    tripIdLabel: tripIdLabel !== "—" ? tripIdLabel : tripId.slice(0, 8).toUpperCase(),
    routeLabel,
  };
}
