/**
 * Routing service for fetching optimal road routes.
 * Primary: Mapbox Directions (geometries=geojson)
 * Fallback: Google Directions (requires polyline decoding)
 */

export interface LatLon {
  latitude: number;
  longitude: number;
}

export interface RouteResult {
  coordinates: LatLon[];
  distance: number; // in meters
  duration: number; // in seconds
}

const MAPBOX_DIRECTIONS_BASE = 'https://api.mapbox.com/directions/v5/mapbox/driving';
const OSRM_DIRECTIONS_BASE = 'https://router.project-osrm.org/route/v1/driving';
const OSRM_NETWORK_ERROR_COOLDOWN_MS = 60_000;
const OSRM_TEMPORARY_BACKOFF_MS = 5 * 60_000;
const OSRM_FETCH_TIMEOUT_MS = 8_000;
let lastOSRMNetworkErrorLogAt = 0;
let osrmBackoffUntil = 0;

function isNetworkRequestTransientError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const message = error.message.toLowerCase();
  return (
    message.includes('network request failed') ||
    message.includes('network request timed out') ||
    message.includes('the request timed out') ||
    message.includes('aborted')
  );
}

function logOSRMError(error: unknown) {
  if (isNetworkRequestTransientError(error)) {
    const now = Date.now();
    osrmBackoffUntil = now + OSRM_TEMPORARY_BACKOFF_MS;
    if (now - lastOSRMNetworkErrorLogAt >= OSRM_NETWORK_ERROR_COOLDOWN_MS) {
      lastOSRMNetworkErrorLogAt = now;
      console.warn(
        '[routingService] osrm network unavailable; using fallback providers (Mapbox/Google).',
      );
    }
    return;
  }

  console.error('[routingService] osrm error:', error);
}

/**
 * Fetch a route from OSRM (Open Source Routing Machine).
 * Truly free, no token required (uses OSM data).
 */
async function getOSRMRoute(from: LatLon, to: LatLon): Promise<RouteResult | null> {
  if (Date.now() < osrmBackoffUntil) return null;

  const coords = `${from.longitude},${from.latitude};${to.longitude},${to.latitude}`;
  const url = `${OSRM_DIRECTIONS_BASE}/${coords}?overview=full&geometries=geojson`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), OSRM_FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(url, {
        headers: {
          'User-Agent': 'Q-Mobile-Logistics/1.0',
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!res.ok) return null;
    const data = await res.json();

    if (!data.routes || data.routes.length === 0) return null;

    const route = data.routes[0];
    const coordinates = route.geometry.coordinates.map((c: [number, number]) => ({
      latitude: c[1],
      longitude: c[0],
    }));

    return {
      coordinates,
      distance: route.distance,
      duration: route.duration,
    };
  } catch (error) {
    logOSRMError(error);
    return null;
  }
}

/**
 * Fetch a route from Mapbox Directions API using GeoJSON format.
 */
async function getMapboxRoute(from: LatLon, to: LatLon): Promise<RouteResult | null> {
  const token = typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_MAPBOX_TOKEN?.trim();
  if (!token) return null;

  const coords = `${from.longitude},${from.latitude};${to.longitude},${to.latitude}`;
  const params = new URLSearchParams({
    access_token: token,
    geometries: 'geojson',
    overview: 'full',
    steps: 'false',
  });

  const url = `${MAPBOX_DIRECTIONS_BASE}/${coords}?${params.toString()}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();

    if (!data.routes || data.routes.length === 0) return null;

    const route = data.routes[0];
    const coordinates = route.geometry.coordinates.map((c: [number, number]) => ({
      latitude: c[1],
      longitude: c[0],
    }));

    return {
      coordinates,
      distance: route.distance,
      duration: route.duration,
    };
  } catch (error) {
    console.error('[routingService] mapbox error:', error);
    return null;
  }
}

/**
 * Fetch a route from Google Directions API.
 * Note: returns polyline string, requires decoding if used. 
 * For now, we prefer Mapbox as it gives GeoJSON directly.
 */
async function getGoogleRoute(from: LatLon, to: LatLon): Promise<RouteResult | null> {
  const apiKey = typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY?.trim();
  if (!apiKey) return null;

  const origin = `${from.latitude},${from.longitude}`;
  const destination = `${to.latitude},${to.longitude}`;
  const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${destination}&key=${apiKey}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();

    if (data.status !== 'OK' || !data.routes || data.routes.length === 0) return null;

    const route = data.routes[0];
    // Google returns polyline. For simplicity in this implementation without adding deps,
    // we use a simple decoder or prefer Mapbox.
    // If Mapbox fails and Google is needed, we'd need a polyline decoder here.
    
    // Simple polyline decoder implementation
    const decodePolyline = (encoded: string) => {
      let index = 0, len = encoded.length;
      let lat = 0, lng = 0;
      const coords = [];

      while (index < len) {
        let b, shift = 0, result = 0;
        do {
          b = encoded.charCodeAt(index++) - 63;
          result |= (b & 0x1f) << shift;
          shift += 5;
        } while (b >= 0x20);
        let dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
        lat += dlat;

        shift = 0;
        result = 0;
        do {
          b = encoded.charCodeAt(index++) - 63;
          result |= (b & 0x1f) << shift;
          shift += 5;
        } while (b >= 0x20);
        let dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
        lng += dlng;

        coords.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
      }
      return coords;
    };

    return {
      coordinates: decodePolyline(route.overview_polyline.points),
      distance: route.legs[0].distance.value,
      duration: route.legs[0].duration.value,
    };
  } catch (error) {
    console.error('[routingService] google error:', error);
    return null;
  }
}

/**
 * Main entry point: Get optimal route.
 * Prioritizes OSRM (Truly free, no token) -> Mapbox (Token required) -> Google (Token required).
 */
export async function getOptimalRoute(from: LatLon, to: LatLon): Promise<RouteResult | null> {
  // 1. Try OSRM (Truly free, open-source data)
  const osrmResult = await getOSRMRoute(from, to);
  if (osrmResult) return osrmResult;

  // 2. Try Mapbox (100k free/mo, requires token)
  const mapboxResult = await getMapboxRoute(from, to);
  if (mapboxResult) return mapboxResult;

  // 3. Try Google (Requires token + billing)
  return await getGoogleRoute(from, to);
}
