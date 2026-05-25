/**
 * Dispatcher-side hook: multi-driver live markers for the fleet map.
 *
 * Fleet view uses postgres_changes on driver_presence (not Broadcast) because:
 *  - Fleet needs 15–30s granularity, not the 8–15s Broadcast cadence
 *  - driver_presence is O(drivers) rows — one UPSERT per 30s per driver
 *  - No Broadcast channel proliferation for N-driver fleet views
 *
 * Same ref-only pattern as useLiveDriverMarker: no React state in the GPS path.
 * Each driver marker is interpolated independently via requestAnimationFrame.
 */

import { useEffect, useRef } from 'react';
import type { Map as MaplibreMap, GeoJSONSource } from 'maplibre-gl';
import { supabase } from '@/lib/supabase';

const INTERPOLATION_MS = 2_000; // slower than single-trip view; matches 30s presence cadence

type MapViewRef = React.RefObject<{ getMap?: () => MaplibreMap | undefined } | null>;

interface PresenceRow {
  driver_id: string;
  latitude: number;
  longitude: number;
  heading: number | null;
  speed_kmh: number | null;
  trip_id: string | null;
  updated_at: string;
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

function isInViewport(mapRef: MapViewRef, lon: number, lat: number): boolean {
  const map = mapRef.current?.getMap?.();
  if (!map) return true; // default: render if map not ready
  try {
    return (map as MaplibreMap).getBounds().contains([lon, lat]);
  } catch {
    return true;
  }
}

function flushDriverToGL(
  mapRef: MapViewRef,
  driverId: string,
  pos: [number, number],
  heading: number,
): void {
  const map = mapRef.current?.getMap?.();
  if (!map) return;
  const src = map.getSource(`driver-${driverId}`) as GeoJSONSource | undefined;
  src?.setData({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: pos },
    properties: { heading, driver_id: driverId },
  });
}

/**
 * Subscribes to driver_presence updates for an org and animates each driver marker.
 *
 * Callers must initialise a GeoJSON source per driver on the Mapbox map before this
 * hook can flush to GL. Source id convention: `driver-{driverId}`.
 *
 * @param mapRef - ref to the Mapbox map view
 * @param orgId  - organization whose active drivers to display; null disables
 */
export function useFleetMarkers(mapRef: MapViewRef, orgId: string | null): void {
  const currentPosMap  = useRef<Map<string, [number, number]>>(new Map());
  const headingMap     = useRef<Map<string, number>>(new Map());
  const animFrameMap   = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (!orgId) return;

    const ch = supabase()
      .channel(`fleet:presence:${orgId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'driver_presence',
          filter: `organization_id=eq.${orgId}`,
        },
        (payload) => {
          const row = payload.new as PresenceRow;
          const { driver_id: driverId, latitude, longitude, heading } = row;

          // Suppress off-screen updates to preserve GPU budget
          if (!isInViewport(mapRef, longitude, latitude)) return;

          const from = currentPosMap.current.get(driverId) ?? null;
          const to: [number, number] = [longitude, latitude];
          if (heading != null) headingMap.current.set(driverId, heading);
          const currentHeading = headingMap.current.get(driverId) ?? 0;

          if (!from) {
            // First update for this driver: place immediately without interpolation
            currentPosMap.current.set(driverId, to);
            flushDriverToGL(mapRef, driverId, to, currentHeading);
            return;
          }

          // Cancel any in-progress animation for this driver
          const existing = animFrameMap.current.get(driverId);
          if (existing != null) cancelAnimationFrame(existing);

          const startTime = performance.now();
          const fromCopy: [number, number] = [from[0], from[1]];

          function step(now: number) {
            const t = Math.min((now - startTime) / INTERPOLATION_MS, 1);
            const eased = easeInOut(t);
            const lon = fromCopy[0] + (to[0] - fromCopy[0]) * eased;
            const lat = fromCopy[1] + (to[1] - fromCopy[1]) * eased;
            currentPosMap.current.set(driverId, [lon, lat]);
            flushDriverToGL(mapRef, driverId, [lon, lat], headingMap.current.get(driverId) ?? 0);
            if (t < 1) {
              animFrameMap.current.set(driverId, requestAnimationFrame(step));
            } else {
              animFrameMap.current.delete(driverId);
            }
          }
          animFrameMap.current.set(driverId, requestAnimationFrame(step));
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'driver_presence',
          filter: `organization_id=eq.${orgId}`,
        },
        (payload) => {
          const driverId = (payload.old as { driver_id?: string }).driver_id;
          if (!driverId) return;
          const frame = animFrameMap.current.get(driverId);
          if (frame != null) cancelAnimationFrame(frame);
          animFrameMap.current.delete(driverId);
          currentPosMap.current.delete(driverId);
          headingMap.current.delete(driverId);
          // Remove the source data from GL
          flushDriverToGL(mapRef, driverId, [0, 0], 0);
        },
      )
      .subscribe();

    return () => {
      animFrameMap.current.forEach((id) => cancelAnimationFrame(id));
      animFrameMap.current.clear();
      currentPosMap.current.clear();
      headingMap.current.clear();
      supabase().removeChannel(ch);
    };
  }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps
}
