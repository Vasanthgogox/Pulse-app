import { useEffect, useRef } from 'react';
import { subscribeTrackingTripBroadcast } from '@/features/tracking/broadcast/TrackingBroadcastSubscriptionManager';
import { getTripTrackingMapStore, releaseTripTrackingMapStore } from '@/features/tracking/map/TripTrackingMapStore';
import type { TrackingPositionPayload } from '@/features/tracking/types/broadcast.types';
import { TRACKING_RESEED_DEBOUNCE_MS } from '@/features/tracking/constants';

type Options = {
  tripId: string | null;
  enabled: boolean;
  /**
   * Called on each broadcast position with the ISO timestamp ONLY.
   * No lat/lon — coordinates go exclusively to TripTrackingMapStore.
   * Use this only to update a React timestamp label ("Updated X min ago").
   */
  onTimestamp?: (recordedAt: string) => void;
  /** Reconnect / reseed — refetch sparse seed from DB. */
  onReseed?: () => void;
};

/**
 * Pure event-forwarding hook: broadcast → store.applyBroadcast() → MarkerInterpolationEngine.
 *
 * INVARIANT: no GPS coordinates (lat/lon) leave this hook into React state.
 * The only React-observable output is onTimestamp(recordedAt) — a single ISO string.
 */
export function useTrackingTripBroadcast({
  tripId,
  enabled,
  onTimestamp,
  onReseed,
}: Options): void {
  const onTimestampRef = useRef(onTimestamp);
  const onReseedRef = useRef(onReseed);
  onTimestampRef.current = onTimestamp;
  onReseedRef.current = onReseed;

  useEffect(() => {
    if (!enabled || !tripId) return;

    const store = getTripTrackingMapStore(tripId);
    let reseedTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleReseed = () => {
      if (reseedTimer) clearTimeout(reseedTimer);
      reseedTimer = setTimeout(() => {
        onReseedRef.current?.();
      }, TRACKING_RESEED_DEBOUNCE_MS);
    };

    const unsub = subscribeTrackingTripBroadcast(tripId, {
      onPosition: (payload: TrackingPositionPayload) => {
        // ── Single source of truth: store owns all position state ──────────
        store.applyBroadcast(payload);
        // ── Only the ISO timestamp escapes into React (UI label) ───────────
        onTimestampRef.current?.(payload.recordedAt);
      },
      onReseed: scheduleReseed,
      onSessionEnded: () => store.clear(),
    });

    return () => {
      if (reseedTimer) clearTimeout(reseedTimer);
      unsub();
      releaseTripTrackingMapStore(tripId);
    };
  }, [tripId, enabled]);
}
