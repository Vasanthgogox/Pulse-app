import type { TripRow } from "@/features/trips/services/trips.service";

/** Statuses that free a driver/vehicle for new assignment (aligned with trips.service guards). */
export const TRIP_TERMINAL_STATUSES = new Set([
  "completed",
  "cancelled",
  "done",
  "delivered",
]);

export type FleetBusyIds = {
  driverIdsOnActiveTrip: string[];
  vehicleIdsOnActiveTrip: string[];
};

export function isTripStatusTerminal(status: string | null | undefined): boolean {
  return TRIP_TERMINAL_STATUSES.has(String(status ?? "").trim().toLowerCase());
}

export function busyFleetIdsFromTrips(
  trips: readonly Pick<TripRow, "id" | "status" | "driver_id" | "vehicle_id">[],
  opts?: { excludeTripId?: string | null },
): FleetBusyIds {
  const exclude = opts?.excludeTripId?.trim() ?? "";
  const activeTrips = trips.filter((t) => {
    if (exclude && t.id === exclude) return false;
    return !isTripStatusTerminal(t.status);
  });

  const driverIdsOnActiveTrip = Array.from(
    new Set(
      activeTrips
        .map((t) => t.driver_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  );
  const vehicleIdsOnActiveTrip = Array.from(
    new Set(
      activeTrips
        .map((t) => t.vehicle_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  );

  return { driverIdsOnActiveTrip, vehicleIdsOnActiveTrip };
}
