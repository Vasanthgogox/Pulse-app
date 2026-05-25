import { useEffect, useRef, useState } from 'react';
import {
  getTrackingState,
  type TrackingState,
} from '@/features/trips/utils/tripTrackingStatus.util';
import { getTripTrackingMapStore } from '@/features/tracking/map/TripTrackingMapStore';

type Overrides = {
  isPinging?: boolean;
  lastPingRespondedAt?: string | null;
  lastSeenAt?: string | null;
};

/**
 * React hook that exposes a live TrackingState snapshot for a trip.
 *
 * Re-renders on:
 *  - Every GPS tick from TripTrackingMapStore (via store.subscribe)
 *  - Every second (1s interval) so lastSeenLabel and driverOnline stay fresh
 *
 * Returns null when tripId is null (no trip selected / tracking not applicable).
 */
export function useTrackingState(
  tripId: string | null,
  tripStatus: string | null,
  overrides?: Overrides,
): TrackingState | null {
  // Keep overrides in a ref so interval/subscription closures always read the
  // latest values without requiring them in the effect dependency arrays.
  const overridesRef = useRef<Overrides | undefined>(overrides);
  overridesRef.current = overrides;

  const tripStatusRef = useRef<string | null>(tripStatus);
  tripStatusRef.current = tripStatus;

  const [state, setState] = useState<TrackingState | null>(() => {
    if (!tripId) return null;
    return getTrackingState(tripId, tripStatus, overrides);
  });

  // Store subscription — re-evaluates on every GPS tick.
  useEffect(() => {
    if (!tripId) {
      setState(null);
      return;
    }
    const store = getTripTrackingMapStore(tripId);
    const unsub = store.subscribe(() => {
      setState(getTrackingState(tripId, tripStatusRef.current, overridesRef.current));
    });
    return unsub;
  }, [tripId]);

  // 1s interval — keeps lastSeenLabel and driverOnline fresh between GPS ticks.
  useEffect(() => {
    if (!tripId) return;
    const id = globalThis.setInterval(() => {
      setState(getTrackingState(tripId, tripStatusRef.current, overridesRef.current));
    }, 1000);
    return () => globalThis.clearInterval(id);
  }, [tripId]);

  return state;
}

export type { TrackingState };
