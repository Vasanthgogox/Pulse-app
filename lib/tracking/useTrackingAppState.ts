/**
 * Wires AppState transitions into TrackingEngine.
 *
 * Mount this once inside the driver trip control screen. When the app moves to
 * background the engine pauses GPS (background task takes over via TaskManager);
 * when it returns to foreground high-accuracy GPS resumes via the engine.
 */

import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import type { LocationObject } from 'expo-location';
type LocationCoords = LocationObject['coords'];
import { startForegroundPositionWatch, type ForegroundPositionWatchHandle } from '@/lib/safeForegroundPositionWatch';
import { TrackingEngine } from './TrackingEngine';

const FOREGROUND_OPTIONS = {
  // expo-location Accuracy.High = 5 (native GPS chip)
  accuracy: 5 as Parameters<typeof startForegroundPositionWatch>[0]['accuracy'],
  timeInterval: 10_000,
  distanceInterval: 50,
};

/**
 * @param active - true while a trip is in tracking phase; false to stop watching
 */
export function useTrackingAppState(active: boolean): void {
  const watchRef = useRef<ForegroundPositionWatchHandle | null>(null);
  const engine = TrackingEngine.getInstance();

  useEffect(() => {
    if (!active) return;

    async function startFg() {
      watchRef.current = await startForegroundPositionWatch(
        FOREGROUND_OPTIONS,
        (loc: LocationObject) => engine.handleGpsReading(loc.coords as LocationCoords, loc.timestamp),
      );
    }

    void startFg();

    const sub = AppState.addEventListener('change', async (state: AppStateStatus) => {
      if (state === 'active') {
        engine.onForeground();
        if (!watchRef.current) void startFg();
      } else if (state === 'background' || state === 'inactive') {
        engine.onBackground();
        watchRef.current?.remove();
        watchRef.current = null;
      }
    });

    return () => {
      sub.remove();
      watchRef.current?.remove();
      watchRef.current = null;
    };
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps
}
