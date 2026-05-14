import type { LocationObject } from "expo-location";
import { useEffect, useRef } from "react";

export type DriverMapLiveFixArgs = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  position: LocationObject;
};

/**
 * Foreground GPS/watch updates for map UI only. Does not write to `driver_locations`;
 * DB persistence stays on {@link useAdaptiveTripLocationPingLoop}.
 */
export function useDriverMapLivePositionWatch(opts: {
  enabled: boolean;
  onFix: (args: DriverMapLiveFixArgs) => void;
}): void {
  const { enabled, onFix } = opts;
  const onFixRef = useRef(onFix);
  onFixRef.current = onFix;

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    const subHolder: { cur: { remove: () => void } | null } = { cur: null };

    void (async () => {
      try {
        const Location = await import("expo-location");
        const { status } = await Location.getForegroundPermissionsAsync();
        if (cancelled || status !== "granted") return;

        subHolder.cur = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 3000,
            distanceInterval: 2,
          },
          (location) => {
            if (cancelled) return;
            onFixRef.current({
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
              accuracy: location.coords.accuracy ?? null,
              position: location,
            });
          },
        );
        if (cancelled) {
          subHolder.cur.remove();
          subHolder.cur = null;
        }
      } catch {
        // Map still updates from adaptive ping ticks.
      }
    })();

    return () => {
      cancelled = true;
      subHolder.cur?.remove();
    };
  }, [enabled]);
}
