import { getLatestDriverLocationForTripOrDriver } from "@/features/driver/services/driverLocation.service";
import { getDriverPresenceForTrip } from "@/features/tracking/services/driverPresence.service";
import type { TripRow } from "@/features/trips/services/trips.service";
import {
  formatHubPingOfflineLabel,
  formatHubPingTimeLabel,
} from "@/features/trips/utils/driverLastPingDisplay.util";
import {
  isDriverLocationRecentlySeen,
  isTripTrackingActive,
  latestIsoTimestamp,
} from "@/features/trips/utils/tripTrackingStatus.util";
import { queryKeys } from "@/lib/queryKeys";
import { useQuery } from "@tanstack/react-query";

export type TripHubInTransitPingMeta = {
  timeLabel: string | null;
  offlineLabel: string | null;
  isOnline: boolean;
  recordedAt: string | null;
};

/** Plain object — TanStack Query cannot round-trip `Map` through cache. */
export type TripHubInTransitPingIndex = Record<string, TripHubInTransitPingMeta>;

const PING_FETCH_CHUNK = 8;

function shouldFetchHubPing(trip: TripRow): boolean {
  return (
    isTripTrackingActive(trip.status, trip.completed_at) &&
    !!(trip.driver_id ?? "").trim()
  );
}

export function buildTripHubInTransitPingMeta(
  recordedAt: string | null | undefined,
): TripHubInTransitPingMeta {
  const at = (recordedAt ?? "").trim() || null;
  const offlineLabel = formatHubPingOfflineLabel(at);
  const isOnline = isDriverLocationRecentlySeen(at);
  return {
    timeLabel: at ? formatHubPingTimeLabel(at) : null,
    offlineLabel,
    isOnline,
    recordedAt: at,
  };
}

async function fetchPingForTrip(
  tripId: string,
  driverId: string,
): Promise<TripHubInTransitPingMeta> {
  const [locRes, presenceRes] = await Promise.all([
    getLatestDriverLocationForTripOrDriver(tripId, driverId),
    getDriverPresenceForTrip(tripId),
  ]);

  const recordedAt = latestIsoTimestamp([
    locRes.location?.recorded_at,
    presenceRes.presence?.recorded_at,
  ]);
  return buildTripHubInTransitPingMeta(recordedAt);
}

async function fetchInTransitPings(
  trips: TripRow[],
): Promise<TripHubInTransitPingIndex> {
  const eligible = trips.filter(shouldFetchHubPing);
  const index: TripHubInTransitPingIndex = {};

  for (let i = 0; i < eligible.length; i += PING_FETCH_CHUNK) {
    const chunk = eligible.slice(i, i + PING_FETCH_CHUNK);
    const rows = await Promise.all(
      chunk.map(async (trip) => {
        const meta = await fetchPingForTrip(trip.id, trip.driver_id!);
        return { tripId: trip.id, meta };
      }),
    );
    for (const { tripId, meta } of rows) {
      index[tripId] = meta;
    }
  }

  return index;
}

export function getTripHubInTransitPing(
  index: TripHubInTransitPingIndex | undefined,
  tripId: string,
): TripHubInTransitPingMeta | null {
  if (!index || !tripId) return null;
  return index[tripId] ?? null;
}

export function useTripHubInTransitPings(
  organizationId: string | null | undefined,
  trips: TripRow[],
) {
  const inTransitIds = trips
    .filter(shouldFetchHubPing)
    .map((t) => t.id)
    .sort()
    .join(",");

  return useQuery({
    queryKey: queryKeys.trips.hubInTransitPings(
      organizationId ?? "",
      inTransitIds,
    ),
    enabled: !!organizationId && inTransitIds.length > 0,
    staleTime: 90_000,
    refetchInterval: 120_000,
    queryFn: () => fetchInTransitPings(trips.filter(shouldFetchHubPing)),
  });
}
