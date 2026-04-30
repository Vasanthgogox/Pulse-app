/**
 * Web-only trip map using Leaflet + leaflet-routing-machine with OSRM.
 * Mirrors the reference implementation at:
 *   /Users/nihas/Desktop/trips/src/pages/trips/TripMap.jsx
 */
import React, { useEffect, useRef, useState } from 'react';

// Hide the routing instructions panel injected by leaflet-routing-machine
const ROUTING_CSS = `
  .leaflet-routing-container { display: none !important; }
  .leaflet-routing-alternatives-container { display: none !important; }
`;
if (typeof document !== 'undefined') {
  if (!document.getElementById('trip-map-routing-styles')) {
    const s = document.createElement('style');
    s.id = 'trip-map-routing-styles';
    s.innerText = ROUTING_CSS;
    document.head.appendChild(s);
  }
}

/** Metro web cannot bundle leaflet.css (relative url(images/...) in CSS). Load from CDN instead. */
const LEAFLET_CSS_VERSION = '1.9.4';
const LEAFLET_CSS_LINK_ID = 'leaflet-dist-css';

function ensureLeafletStylesheet(): Promise<void> {
  if (typeof document === 'undefined') return Promise.resolve();
  const existing = document.getElementById(LEAFLET_CSS_LINK_ID) as HTMLLinkElement | null;
  if (existing?.dataset.loaded === '1') return Promise.resolve();
  if (existing && existing.dataset.loaded !== '1') {
    return new Promise((resolve, reject) => {
      const done = () => {
        existing.dataset.loaded = '1';
        resolve();
      };
      if (existing.sheet) {
        done();
        return;
      }
      existing.addEventListener('load', done, { once: true });
      existing.addEventListener('error', () => reject(new Error('Leaflet CSS failed to load')), {
        once: true,
      });
    });
  }
  return new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.id = LEAFLET_CSS_LINK_ID;
    link.rel = 'stylesheet';
    link.href = `https://unpkg.com/leaflet@${LEAFLET_CSS_VERSION}/dist/leaflet.css`;
    link.crossOrigin = 'anonymous';
    link.onload = () => {
      link.dataset.loaded = '1';
      resolve();
    };
    link.onerror = () => reject(new Error('Leaflet CSS failed to load'));
    document.head.appendChild(link);
  });
}

// ── Fallback Indian city coordinates (same as reference) ────────────────────
const INDIAN_CITY_COORDINATES: Record<string, [number, number]> = {
  mumbai: [19.076, 72.8777], delhi: [28.6139, 77.209], bangalore: [12.9716, 77.5946],
  chennai: [13.0827, 80.2707], kolkata: [22.5726, 88.3639], hyderabad: [17.385, 78.4867],
  ahmedabad: [23.0225, 72.5714], pune: [18.5204, 73.8567], surat: [21.1702, 72.8311],
  jaipur: [26.9124, 75.7873], lucknow: [26.8467, 80.9462], kanpur: [26.4499, 80.3319],
  nagpur: [21.1458, 79.0882], indore: [22.7196, 75.8577], thane: [19.2183, 72.9781],
  bhopal: [23.2599, 77.4126], visakhapatnam: [17.6868, 83.2185], patna: [25.5941, 85.1376],
  vadodara: [22.3072, 73.1812], ludhiana: [30.901, 75.8573], agra: [27.1767, 78.0081],
  nashik: [19.9975, 73.7898], meerut: [28.9845, 77.7064], rajkot: [22.3039, 70.8022],
  varanasi: [25.3176, 82.9739], aurangabad: [19.8762, 75.3433], amritsar: [31.634, 74.8723],
  coimbatore: [11.0168, 76.9558], mysore: [12.2958, 76.6394], mangalore: [12.9141, 74.856],
};

const getFallbackCoordinates = (location?: string): [number, number] => {
  if (!location) return [20.5937, 78.9629];
  const lower = location.toLowerCase().trim();
  if (INDIAN_CITY_COORDINATES[lower]) return INDIAN_CITY_COORDINATES[lower];
  for (const [city, coords] of Object.entries(INDIAN_CITY_COORDINATES)) {
    if (lower.includes(city) || city.includes(lower)) return coords;
  }
  return [20.5937, 78.9629];
};

const getCoordinates = async (location: string, retryCount = 0): Promise<[number, number]> => {
  if (!location?.trim()) return getFallbackCoordinates(location);
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(location)},India&format=json&limit=1&countrycodes=IN`,
      { signal: controller.signal, headers: { 'User-Agent': 'TripMap/1.0', Accept: 'application/json' }, mode: 'cors' },
    );
    clearTimeout(id);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (Array.isArray(data) && data[0]?.lat && data[0]?.lon) {
      return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
    }
    throw new Error('No results');
  } catch (err: any) {
    if (
      retryCount < 2 &&
      (err.name === 'AbortError' || err.message?.includes('Failed to fetch') || err.message?.includes('HTTP 5'))
    ) {
      await new Promise((r) => setTimeout(r, (retryCount + 1) * 1000));
      return getCoordinates(location, retryCount + 1);
    }
    return getFallbackCoordinates(location);
  }
};

// ── Props ───────────────────────────────────────────────────────────────────
export interface TripMapProps {
  source?: string | null;
  destination?: string | null;
  sourceCoords?: { latitude: number; longitude: number } | null;
  destCoords?: { latitude: number; longitude: number } | null;
  truckLocation?: { latitude: number; longitude: number } | null;
  truckStatus?: { truckNo?: string; speed?: number; ignitionStatus?: boolean; location?: string; lastUpdated?: string } | null;
  intermediateStops?: string[];
  height?: number;
  onDistanceCalculated?: (distanceKm: string) => void;
}

// ── Component ───────────────────────────────────────────────────────────────
export function TripMap({
  source, destination, sourceCoords, destCoords,
  truckLocation, truckStatus,
  intermediateStops = [],
  height = 520,
  onDistanceCalculated,
}: TripMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [geocodingProgress, setGeocodingProgress] = useState({ current: 0, total: 0 });

  const initializeMap = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Dynamic imports to avoid SSR issues (same pattern as existing LeafletMap.web.tsx)
      const L = (await import('leaflet')).default;
      await ensureLeafletStylesheet();
      await import('leaflet-routing-machine' as any);

      // ── Resolve source coordinates ───────────────────────────────────────
      const locationsToGeocode = [source, destination, ...intermediateStops].filter(Boolean);
      setGeocodingProgress({ current: 0, total: locationsToGeocode.length });

      let srcCoords: [number, number];
      if (sourceCoords && Number.isFinite(sourceCoords.latitude) && Number.isFinite(sourceCoords.longitude)) {
        srcCoords = [sourceCoords.latitude, sourceCoords.longitude];
      } else if (source) {
        setGeocodingProgress((p) => ({ ...p, current: 1 }));
        srcCoords = await getCoordinates(source);
      } else {
        throw new Error('Source location required');
      }

      // ── Resolve destination coordinates ──────────────────────────────────
      let dstCoords: [number, number];
      if (destCoords && Number.isFinite(destCoords.latitude) && Number.isFinite(destCoords.longitude)) {
        dstCoords = [destCoords.latitude, destCoords.longitude];
      } else if (destination) {
        setGeocodingProgress((p) => ({ ...p, current: 2 }));
        dstCoords = await getCoordinates(destination);
      } else {
        throw new Error('Destination location required');
      }

      // ── Resolve intermediate stop coordinates ────────────────────────────
      const stopCoords: { location: string; coords: [number, number] }[] = [];
      for (let i = 0; i < intermediateStops.length; i++) {
        const stop = intermediateStops[i];
        if (stop?.trim()) {
          setGeocodingProgress((p) => ({ ...p, current: 3 + i }));
          const coords = await getCoordinates(stop);
          stopCoords.push({ location: stop, coords });
        }
      }

      // ── Center ───────────────────────────────────────────────────────────
      const allCoords = [srcCoords, dstCoords, ...stopCoords.map((s) => s.coords)];
      const avgLat = allCoords.reduce((s, c) => s + c[0], 0) / allCoords.length;
      const avgLng = allCoords.reduce((s, c) => s + c[1], 0) / allCoords.length;

      // ── Clean up old instance ────────────────────────────────────────────
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      if (!mapRef.current) return;

      // ── Create map ───────────────────────────────────────────────────────
      const map = L.map(mapRef.current).setView([avgLat, avgLng], 7);
      mapInstanceRef.current = map;

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 18,
        errorTileUrl:
          'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjU2IiBoZWlnaHQ9IjI1NiIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjU2IiBoZWlnaHQ9IjI1NiIgZmlsbD0iI2Y1ZjVmNSIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzk5OTk5OSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPk1hcCBub3QgYXZhaWxhYmxlPC90ZXh0Pjwvc3ZnPg==',
      }).addTo(map);

      // ── Markers (identical SVG icons as reference) ───────────────────────
      const sourceIcon = L.divIcon({
        html: `<svg width="28" height="40" viewBox="0 0 28 40" style="filter:drop-shadow(0 3px 6px rgba(0,0,0,0.16));">
          <path d="M14 0C6.27 0 0 6.27 0 14c0 10.5 14 26 14 26s14-15.5 14-26c0-7.73-6.27-14-14-14z" fill="#059669"/>
          <path d="M14 2C7.37 2 2 7.37 2 14c0 9.25 12 24 12 24s12-14.75 12-24c0-6.63-5.37-12-12-12z" fill="#10b981"/>
          <circle cx="14" cy="14" r="6" fill="#fff"/><circle cx="14" cy="14" r="3" fill="#059669"/>
        </svg>`,
        className: '', iconSize: [28, 40], iconAnchor: [14, 40], popupAnchor: [0, -40],
      });

      const destinationIcon = L.divIcon({
        html: `<svg width="28" height="40" viewBox="0 0 28 40" style="filter:drop-shadow(0 3px 6px rgba(0,0,0,0.16));">
          <path d="M14 0C6.27 0 0 6.27 0 14c0 10.5 14 26 14 26s14-15.5 14-26c0-7.73-6.27-14-14-14z" fill="#b91c1c"/>
          <path d="M14 2C7.37 2 2 7.37 2 14c0 9.25 12 24 12 24s12-14.75 12-24c0-6.63-5.37-12-12-12z" fill="#dc2626"/>
          <circle cx="14" cy="14" r="6" fill="#fff"/><circle cx="14" cy="14" r="3" fill="#b91c1c"/>
        </svg>`,
        className: '', iconSize: [28, 40], iconAnchor: [14, 40], popupAnchor: [0, -40],
      });

      const intermediateStopIcon = L.divIcon({
        html: `<svg width="24" height="32" viewBox="0 0 24 32" style="filter:drop-shadow(0 2px 4px rgba(0,0,0,0.15));">
          <path d="M12 0C5.37 0 0 5.37 0 12c0 9 12 20 12 20s12-11 12-20c0-6.63-5.37-12-12-12z" fill="#f59e0b"/>
          <path d="M12 2C6.48 2 2 6.48 2 12c0 7.5 10 18 10 18s10-10.5 10-18c0-5.52-4.48-10-10-10z" fill="#fbbf24"/>
          <circle cx="12" cy="12" r="5" fill="#fff"/><circle cx="12" cy="12" r="2.5" fill="#f59e0b"/>
        </svg>`,
        className: '', iconSize: [24, 32], iconAnchor: [12, 32], popupAnchor: [0, -32],
      });

      const truckIcon = L.divIcon({
        html: `<div style="background:#000;color:#fff;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 2px 4px rgba(0,0,0,0.2);">🚛</div>`,
        className: '', iconSize: [24, 24], iconAnchor: [12, 12],
      });

      L.marker(srcCoords, { icon: sourceIcon })
        .bindPopup(`<strong>From:</strong> ${source ?? 'Origin'}`)
        .addTo(map);

      L.marker(dstCoords, { icon: destinationIcon })
        .bindPopup(`<strong>To:</strong> ${destination ?? 'Destination'}`)
        .addTo(map);

      stopCoords.forEach((stop, idx) => {
        L.marker(stop.coords, { icon: intermediateStopIcon })
          .bindPopup(`<strong>Stop ${idx + 1}:</strong> ${stop.location}`)
          .addTo(map);
      });

      if (truckLocation && Number.isFinite(truckLocation.latitude) && Number.isFinite(truckLocation.longitude)) {
        const truckMarker = L.marker([truckLocation.latitude, truckLocation.longitude], {
          icon: truckIcon,
          zIndexOffset: 1000,
        });
        if (truckStatus) {
          const popupContent = `
            <div style="font-family:system-ui,sans-serif;padding:4px;min-width:200px;">
              <div style="font-weight:600;margin-bottom:4px;font-size:14px;">${truckStatus.truckNo ?? 'Truck'}</div>
              <div style="display:flex;align-items:center;gap:4px;margin-bottom:2px;color:${(truckStatus.speed ?? 0) > 0 ? '#16a34a' : '#666'};">
                <span style="width:6px;height:6px;border-radius:50%;background:${(truckStatus.speed ?? 0) > 0 ? '#16a34a' : '#666'};"></span>
                <span style="font-size:12px;">${truckStatus.speed ?? 0} km/h</span>
              </div>
              <div style="display:flex;align-items:center;gap:4px;margin-bottom:2px;color:${truckStatus.ignitionStatus ? '#16a34a' : '#666'};">
                <span style="width:6px;height:6px;border-radius:50%;background:${truckStatus.ignitionStatus ? '#16a34a' : '#666'};"></span>
                <span style="font-size:12px;">Engine ${truckStatus.ignitionStatus ? 'On' : 'Off'}</span>
              </div>
              ${truckStatus.location ? `<div style="font-size:11px;color:#666;margin-top:4px;">📍 ${truckStatus.location}</div>` : ''}
            </div>
          `;
          truckMarker.bindPopup(popupContent, { closeButton: false, maxWidth: 300, minWidth: 200 });
          truckMarker.openPopup();
        }
        truckMarker.addTo(map);
      }

      // ── OSRM routing via leaflet-routing-machine (matches reference) ─────
      const waypoints = [
        (L as any).latLng(srcCoords[0], srcCoords[1]),
        ...stopCoords.map((s) => (L as any).latLng(s.coords[0], s.coords[1])),
        (L as any).latLng(dstCoords[0], dstCoords[1]),
      ];

      const createFallbackRoute = () => {
        const allPoints = [srcCoords, ...stopCoords.map((s) => s.coords), dstCoords];
        const R = 6371;
        let totalDist = 0;
        for (let i = 0; i < allPoints.length - 1; i++) {
          const [lat1, lng1] = allPoints[i];
          const [lat2, lng2] = allPoints[i + 1];
          const toRad = (d: number) => (d * Math.PI) / 180;
          const dLat = toRad(lat2 - lat1);
          const dLng = toRad(lng2 - lng1);
          const a =
            Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
          totalDist += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        }
        const roadDist = (totalDist * 1.3).toFixed(1);
        if (onDistanceCalculated) onDistanceCalculated(roadDist);
        L.polyline(allPoints, { color: '#2196F3', weight: 3, opacity: 0.7, dashArray: '10, 10' }).addTo(map);
      };

      try {
        const routingControl = (L as any).Routing.control({
          waypoints,
          lineOptions: {
            styles: [{ color: '#2196F3', weight: 4, opacity: 0.8, lineCap: 'round', lineJoin: 'round' }],
          },
          routeWhileDragging: false,
          draggableWaypoints: false,
          addWaypoints: false,
          createMarker: () => null,
          show: false,
          collapsible: false,
          router: (L as any).Routing.osrmv1({
            serviceUrl:
              typeof window !== 'undefined' && window.location.hostname === 'localhost'
                ? '/osrm/route/v1'
                : 'https://router.project-osrm.org/route/v1',
            profile: 'driving',
          }),
        });

        routingControl.on('routesfound', (e: any) => {
          if (e.routes?.[0] && onDistanceCalculated) {
            onDistanceCalculated((e.routes[0].summary.totalDistance / 1000).toFixed(1));
          }
        });

        routingControl.on('routingerror', () => {
          createFallbackRoute();
        });

        // Guard against _clearLines crash (same patch as reference)
        const originalClearLines = routingControl._clearLines;
        routingControl._clearLines = function () {
          try {
            if (typeof originalClearLines === 'function') originalClearLines.call(this);
          } catch {}
        };

        routingControl.addTo(map);
      } catch {
        createFallbackRoute();
      }

      // ── Fit bounds ───────────────────────────────────────────────────────
      const boundsCoords: [number, number][] = [srcCoords, dstCoords, ...stopCoords.map((s) => s.coords)];
      if (truckLocation && Number.isFinite(truckLocation.latitude)) {
        boundsCoords.push([truckLocation.latitude, truckLocation.longitude]);
      }
      map.fitBounds(boundsCoords as any, { padding: [50, 50], maxZoom: 15 });

      map.whenReady(() => {
        setTimeout(() => setIsLoading(false), 800);
      });
    } catch {
      setError('Failed to load map. Please check your internet connection and try again.');
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const hasSource = sourceCoords ?? source;
    const hasDest = destCoords ?? destination;
    if (!hasSource || !hasDest) {
      setError('Source and destination are required to display the map.');
      setIsLoading(false);
      return;
    }
    initializeMap();
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    sourceCoords?.latitude, sourceCoords?.longitude,
    destCoords?.latitude, destCoords?.longitude,
    source, destination,
    truckLocation?.latitude, truckLocation?.longitude,
  ]);

  return (
    <div style={{ position: 'relative', height, width: '100%', borderRadius: 12, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
      {isLoading && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.92)', zIndex: 10, backdropFilter: 'blur(4px)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <div style={{ position: 'relative', width: 40, height: 40 }}>
              <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '4px solid #e5e7eb' }} />
              <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '4px solid transparent', borderTopColor: '#111827', animation: 'spin 0.8s linear infinite' }} />
            </div>
            <p style={{ fontSize: 14, color: '#4b5563', fontWeight: 500, margin: 0 }}>Loading map...</p>
            {geocodingProgress.total > 0 && (
              <p style={{ fontSize: 12, color: '#9ca3af', margin: 0 }}>
                Loading locations... ({geocodingProgress.current}/{geocodingProgress.total})
              </p>
            )}
          </div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}
      {error && !isLoading && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fef2f2', zIndex: 10 }}>
          <div style={{ textAlign: 'center', padding: 24, maxWidth: 280 }}>
            <div style={{ width: 48, height: 48, background: '#fee2e2', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <p style={{ fontSize: 13, fontWeight: 600, color: '#991b1b', margin: '0 0 8px' }}>Map Loading Failed</p>
            <p style={{ fontSize: 12, color: '#dc2626', margin: '0 0 16px' }}>{error}</p>
            <button
              onClick={initializeMap}
              style={{ padding: '6px 16px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 500 }}
            >
              Try Again
            </button>
          </div>
        </div>
      )}
      <div ref={mapRef} style={{ height: '100%', width: '100%' }} />
      <div style={{ position: 'absolute', bottom: 8, right: 8, background: 'rgba(255,255,255,0.85)', padding: '2px 8px', borderRadius: 4, fontSize: 11, color: '#6b7280', zIndex: 5 }}>
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>
          © OpenStreetMap
        </a>
      </div>
    </div>
  );
}
