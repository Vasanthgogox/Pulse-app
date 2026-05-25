import { MAP_TRUCK_MARKER_HTML } from '@/lib/mapMarkerIcons.util';
import { MarkerInterpolationEngine, type LngLat } from '@/features/tracking/map/MarkerInterpolationEngine';
import {
  getTripTrackingMapStore,
  type TripMapPoint,
} from '@/features/tracking/map/TripTrackingMapStore';

type MapLibreMarkerLike = {
  setLngLat: (c: [number, number]) => MapLibreMarkerLike;
  remove?: () => void;
};

type MapLibreModule = {
  Marker: new (o: { element: HTMLElement; anchor?: string }) => MapLibreMarkerLike;
};

/**
 * Imperative truck marker on a MapLibre map — no React state per GPS event.
 */
export class TripTrackingMapManager {
  private marker: MapLibreMarkerLike | null = null;
  private markerEl: HTMLElement | null = null;
  private readonly interp: MarkerInterpolationEngine;
  private unsub: (() => void) | null = null;

  constructor(
    private readonly tripId: string,
    private readonly getMap: () => { map: unknown; maplibregl: MapLibreModule } | null,
  ) {
    this.interp = new MarkerInterpolationEngine((pos, _done) => {
      this.marker?.setLngLat([pos.longitude, pos.latitude]);
    });
  }

  attach(): void {
    const store = getTripTrackingMapStore(this.tripId);
    this.unsub = store.subscribe((point) => this.onStorePoint(point));
  }

  detach(): void {
    this.unsub?.();
    this.unsub = null;
    this.interp.cancel();
    this.marker?.remove?.();
    this.marker = null;
    this.markerEl = null;
  }

  private onStorePoint(point: TripMapPoint | null): void {
    if (!point) {
      this.marker?.remove?.();
      this.marker = null;
      return;
    }
    this.ensureMarker();
    const target: LngLat = {
      latitude: point.latitude,
      longitude: point.longitude,
    };
    this.interp.setTarget(target, point.stale);
    if (this.markerEl) {
      this.markerEl.style.opacity = point.stale ? '0.55' : '1';
      this.markerEl.style.filter = point.stale ? 'grayscale(0.6)' : 'none';
    }
  }

  private ensureMarker(): void {
    if (this.marker) return;
    const ctx = this.getMap();
    if (!ctx) return;
    const el = document.createElement('div');
    el.innerHTML = MAP_TRUCK_MARKER_HTML;
    el.style.transition = 'opacity 0.3s ease';
    this.markerEl = el;
    this.marker = new ctx.maplibregl.Marker({ element: el, anchor: 'center' })
      .setLngLat([0, 0]);
    const map = ctx.map as { addLayer?: unknown } & {
      _loaded?: boolean;
    };
    try {
      (this.marker as MapLibreMarkerLike & { addTo?: (m: unknown) => void }).addTo?.(map);
    } catch {
      /* map not ready */
    }
  }
}
