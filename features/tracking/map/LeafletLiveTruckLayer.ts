/**
 * Leaflet adapter for TripTrackingMapStore + MarkerInterpolationEngine.
 *
 * Mirrors TripTrackingMapManager (which targets MapLibre) but attaches to a
 * Leaflet map instance (used by TripMap.web.tsx / trip radar).
 *
 * No React state — all updates go through store → RAF → marker.setLatLng().
 * Leaflet (L) is passed in to avoid a dynamic import inside this class.
 */

import type * as LeafletNS from 'leaflet';
import {
  MarkerInterpolationEngine,
  type LngLat,
} from '@/features/tracking/map/MarkerInterpolationEngine';
import {
  getTripTrackingMapStore,
  type TripMapPoint,
} from '@/features/tracking/map/TripTrackingMapStore';
import {
  buildDriverAvatarMarkerHtml,
  MAP_DRIVER_AVATAR_MARKER_ICON_ANCHOR,
  MAP_DRIVER_AVATAR_MARKER_ICON_SIZE,
  type DriverMapMarkerOptions,
} from '@/lib/mapMarkerIcons.util';

export class LeafletLiveTruckLayer {
  private marker: LeafletNS.Marker | null = null;
  private readonly interp: MarkerInterpolationEngine;
  private unsub: (() => void) | null = null;

  constructor(
    private readonly tripId: string,
    private readonly map: LeafletNS.Map,
    private readonly L: typeof LeafletNS,
    private readonly driverMarker?: DriverMapMarkerOptions,
  ) {
    this.interp = new MarkerInterpolationEngine((pos) => {
      // A queued interpolation frame can fire after the map/marker was torn
      // down (effect re-run or unmount → map.remove()). The marker object
      // survives but its internal position (_leaflet_pos) is gone, so
      // setLatLng throws "Cannot read property '_leaflet_pos' of undefined".
      // Only move the marker while it is still attached to a live map.
      const marker = this.marker;
      if (!marker || !this.isMapLive() || !this.map.hasLayer(marker)) return;
      try {
        marker.setLatLng([pos.latitude, pos.longitude]);
      } catch {
        // Map torn down between the guard and this call — drop the frame.
      }
    });
  }

  /**
   * Subscribe to the store and place the marker.
   * @param initialLatLng - optional seed position (from driver_presence); placed immediately.
   */
  attach(initialLatLng?: LeafletNS.LatLngTuple): void {
    const icon = this.L.divIcon({
      html: buildDriverAvatarMarkerHtml(
        this.driverMarker?.avatarUri,
        this.driverMarker?.avatarSeed,
        this.driverMarker?.isOnline ?? true,
      ),
      className: '',
      iconSize: MAP_DRIVER_AVATAR_MARKER_ICON_SIZE as LeafletNS.PointTuple,
      iconAnchor: MAP_DRIVER_AVATAR_MARKER_ICON_ANCHOR as LeafletNS.PointTuple,
    });
    this.marker = this.L.marker(initialLatLng ?? [0, 0], {
      icon,
      zIndexOffset: 1000,
    }).addTo(this.map);

    if (!initialLatLng) {
      this.marker.setOpacity(0);
    }

    const store = getTripTrackingMapStore(this.tripId);
    this.unsub = store.subscribe((point) => this.onStorePoint(point));
  }

  /**
   * True while the map still has its DOM panes. After `map.remove()` Leaflet
   * clears `_panes`/`_mapPane`, and layer calls (even `hasLayer` → `setLatLng`)
   * then read `_leaflet_pos` off an undefined pane and throw (GX-PULSE-X).
   */
  private isMapLive(): boolean {
    const internals = this.map as unknown as {
      _mapPane?: unknown;
      _container?: unknown;
    };
    return !!internals._mapPane && !!internals._container;
  }

  detach(): void {
    this.unsub?.();
    this.unsub = null;
    this.interp.cancel();
    try {
      this.marker?.remove();
    } catch {
      // Map already removed — the marker went with it.
    }
    this.marker = null;
  }

  private onStorePoint(point: TripMapPoint | null): void {
    // Store events can also land after teardown (realtime push racing unmount).
    if (!this.marker || !this.isMapLive()) return;
    if (!point) {
      try { this.marker.setOpacity(0); } catch { /* map gone */ }
      return;
    }
    if (!this.map.hasLayer(this.marker)) return;

    this.marker.setOpacity(point.stale ? 0.55 : 1);

    const el = this.marker.getElement();
    if (el) {
      el.style.filter = point.stale ? 'grayscale(0.6)' : 'none';
      el.style.transition = 'opacity 0.3s ease, filter 0.3s ease';
    }

    const target: LngLat = { latitude: point.latitude, longitude: point.longitude };
    this.interp.setTarget(target, point.stale);
  }
}
