/**
 * Dispatcher-side hook: live driver marker for the trip detail map.
 *
 * GPS coordinates never enter React state. All position updates go:
 *   Broadcast → ref → flushToGL() → Mapbox GeoJSON source → rAF
 *
 * The hook seeds the initial marker from driver_presence (DB), then switches
 * to Broadcast for live updates. Smooth interpolation at 60fps runs entirely
 * inside requestAnimationFrame — no React render per GPS ping.
 */

import { useEffect, useRef } from 'react';
import type { Map as MaplibreMap, GeoJSONSource } from 'maplibre-gl';
import { supabase } from '@/lib/supabase';
import type { BroadcastGpsEvent, BroadcastSessionEvent, DriverPresenceSeed } from '@/lib/tracking/types';

const INTERPOLATION_MS = 1_200; // slightly under GPS interval to prevent visible lag

type MapViewRef = React.RefObject<{ getMap?: () => MaplibreMap | undefined } | null>;

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

function flushToGL(mapRef: MapViewRef, pos: [number, number], heading: number): void {
  const map = mapRef.current?.getMap?.();
  if (!map) return;
  const src = map.getSource('driver-marker') as GeoJSONSource | undefined;
  src?.setData({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: pos },
    properties: { heading },
  });
}

function scheduleInterpolation(
  mapRef: MapViewRef,
  currentRef: React.MutableRefObject<[number, number] | null>,
  targetRef: React.MutableRefObject<[number, number] | null>,
  headingRef: React.MutableRefObject<number>,
  animFrameRef: React.MutableRefObject<number | null>,
): void {
  // Cancel any in-progress animation; restart from current interpolated position
  if (animFrameRef.current != null) {
    cancelAnimationFrame(animFrameRef.current);
    animFrameRef.current = null;
  }

  const from = currentRef.current;
  const to = targetRef.current;
  if (!from || !to) return;

  const startTime = performance.now();
  const fromCopy: [number, number] = [from[0], from[1]];
  const toCopy: [number, number] = [to[0], to[1]];

  function step(now: number) {
    const t = Math.min((now - startTime) / INTERPOLATION_MS, 1);
    const eased = easeInOut(t);
    const lon = fromCopy[0] + (toCopy[0] - fromCopy[0]) * eased;
    const lat = fromCopy[1] + (toCopy[1] - fromCopy[1]) * eased;
    currentRef.current = [lon, lat];
    flushToGL(mapRef, [lon, lat], headingRef.current);
    if (t < 1) {
      animFrameRef.current = requestAnimationFrame(step);
    } else {
      animFrameRef.current = null;
    }
  }
  animFrameRef.current = requestAnimationFrame(step);
}

/**
 * Subscribe to live GPS updates for a single trip and update the Mapbox marker imperatively.
 *
 * @param mapRef - ref to the Mapbox map view component
 * @param tripId - the trip being tracked; null disables the subscription
 * @param seed   - initial position from driver_presence DB row; seeds the marker on load
 */
export function useLiveDriverMarker(
  mapRef: MapViewRef,
  tripId: string | null,
  seed: DriverPresenceSeed | null,
): void {
  const currentPosRef  = useRef<[number, number] | null>(null);
  const targetPosRef   = useRef<[number, number] | null>(null);
  const headingRef     = useRef<number>(0);
  const animFrameRef   = useRef<number | null>(null);
  const lastSessionRef = useRef<string | null>(null);

  // Seed initial position from DB presence (re-seed only on driver change)
  useEffect(() => {
    if (!seed) return;
    currentPosRef.current = [seed.lon, seed.lat];
    headingRef.current = seed.heading ?? 0;
    lastSessionRef.current = seed.sessionId;
    flushToGL(mapRef, currentPosRef.current, headingRef.current);
  }, [seed?.driverId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Broadcast subscription — runs entirely outside React render cycle
  useEffect(() => {
    if (!tripId) return;

    const ch = supabase()
      .channel(`tracking:trip:${tripId}`)
      .on('broadcast', { event: 'gps_ping' }, ({ payload }: { payload: BroadcastGpsEvent }) => {
        // Reject pings from stale sessions (device takeover scenario)
        if (lastSessionRef.current && payload.session_id !== lastSessionRef.current) return;
        targetPosRef.current = [payload.lon, payload.lat];
        if (payload.heading != null) headingRef.current = payload.heading;
        scheduleInterpolation(mapRef, currentPosRef, targetPosRef, headingRef, animFrameRef);
      })
      .on('broadcast', { event: 'session_started' }, ({ payload }: { payload: BroadcastSessionEvent }) => {
        // Accept the new canonical session after a device takeover or reconnect
        lastSessionRef.current = payload.session_id;
      })
      .on('broadcast', { event: 'session_resumed' }, ({ payload }: { payload: BroadcastSessionEvent }) => {
        lastSessionRef.current = payload.session_id;
      })
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'CLOSED') {
          // Pause interpolation on disconnect to avoid marker drifting to a stale target
          if (animFrameRef.current) {
            cancelAnimationFrame(animFrameRef.current);
            animFrameRef.current = null;
          }
          // Supabase client auto-reconnects with exponential backoff.
          // On next gps_ping the interpolation will resume from the last known position.
        }
      });

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      supabase().removeChannel(ch);
    };
  }, [tripId]); // eslint-disable-line react-hooks/exhaustive-deps
}
