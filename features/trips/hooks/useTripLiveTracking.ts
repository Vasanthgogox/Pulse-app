/**
 * Unified trip live-tracking hook (dispatcher side).
 * Data layer: TanStack Query (`useTripLiveTrackingSeedQuery`) — one fetch per tripId+driverId key.
 * Map layer: TripTrackingMapStore.applySeed on successful presence (imperative, not React arrays for GPS).
 */

import { useCallback, useEffect, useMemo } from 'react';
import {
  getTripTrackingMapStore,
  releaseTripTrackingMapStore,
} from '@/features/tracking/map/TripTrackingMapStore';
import type { DriverPresenceRow } from '@/features/tracking/services/driverPresence.service';
import type { TripCheckpointRow } from '@/features/tracking/services/tripCheckpoints.service';
import { useTripLiveTrackingSeedQuery } from '@/lib/queries/useTripLiveTrackingSeedQuery';

/** Stable fallback — inline `?? []` creates a new reference every render and breaks effect deps. */
const EMPTY_TRAIL: TripCheckpointRow[] = [];

export type TrackingUiSnapshot = {
  recordedAt: string | null;
  stale: boolean;
  sessionId: string | null;
};

export type UseTripLiveTrackingResult = {
  trackingActive: boolean;
  seedPoint: DriverPresenceRow | null;
  trail: TripCheckpointRow[];
  snapshot: TrackingUiSnapshot;
  isLoading: boolean;
  /** Invalidates/refetches the seed query (broadcast reseed, manual refresh). */
  reseed: () => void;
};

export function useTripLiveTracking({
  tripId,
  driverId,
  trackingEnabled,
}: {
  tripId: string | null;
  driverId?: string | null;
  trackingEnabled: boolean;
}): UseTripLiveTrackingResult {
  const normalizedDriverId = driverId ?? null;
  const seedQuery = useTripLiveTrackingSeedQuery(
    tripId,
    normalizedDriverId,
    trackingEnabled,
  );

  const presence = seedQuery.data?.presence ?? null;
  const trail = useMemo(
    () => seedQuery.data?.checkpoints ?? EMPTY_TRAIL,
    [seedQuery.data?.checkpoints],
  );

  const snapshot = useMemo((): TrackingUiSnapshot => {
    if (!presence) {
      return { recordedAt: null, stale: false, sessionId: null };
    }
    return {
      recordedAt: presence.recorded_at,
      stale: false,
      sessionId: presence.session_id,
    };
  }, [presence?.recorded_at, presence?.session_id]);

  useEffect(() => {
    if (!trackingEnabled || !tripId) return;

    if (presence) {
      getTripTrackingMapStore(tripId).applySeed(
        presence.latitude,
        presence.longitude,
        presence.recorded_at,
      );
    }

    return () => {
      releaseTripTrackingMapStore(tripId);
    };
  }, [tripId, trackingEnabled, presence?.latitude, presence?.longitude, presence?.recorded_at]);

  const reseed = useCallback(() => {
    void seedQuery.refetch();
  }, [seedQuery.refetch]);

  return {
    trackingActive: trackingEnabled,
    seedPoint: presence,
    trail,
    snapshot,
    isLoading: seedQuery.isLoading || seedQuery.isFetching,
    reseed,
  };
}
