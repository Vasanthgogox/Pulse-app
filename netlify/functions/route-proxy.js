/**
 * Netlify function: server-side route fetch for web clients.
 * Prevents browser CORS/provider restrictions from forcing straight-line fallback.
 */
const OSRM_DIRECTIONS_BASE = "https://router.project-osrm.org/route/v1/driving";
const MAPBOX_DIRECTIONS_BASE =
  "https://api.mapbox.com/directions/v5/mapbox/driving";

function isFiniteNumber(value) {
  return Number.isFinite(value);
}

function toCoordinatePair(point) {
  return { latitude: point[1], longitude: point[0] };
}

async function fetchOsrm(from, to) {
  const coords = `${from.longitude},${from.latitude};${to.longitude},${to.latitude}`;
  const url = `${OSRM_DIRECTIONS_BASE}/${coords}?overview=full&geometries=geojson`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Pulse-Routing-Proxy/1.0",
    },
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (!Array.isArray(data?.routes) || data.routes.length === 0) return null;
  const route = data.routes[0];
  if (!Array.isArray(route?.geometry?.coordinates)) return null;
  return {
    coordinates: route.geometry.coordinates.map(toCoordinatePair),
    distance: route.distance,
    duration: route.duration,
  };
}

async function fetchMapbox(from, to, token) {
  if (!token) return null;
  const coords = `${from.longitude},${from.latitude};${to.longitude},${to.latitude}`;
  const params = new URLSearchParams({
    access_token: token,
    geometries: "geojson",
    overview: "full",
    steps: "false",
  });
  const url = `${MAPBOX_DIRECTIONS_BASE}/${coords}?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  if (!Array.isArray(data?.routes) || data.routes.length === 0) return null;
  const route = data.routes[0];
  if (!Array.isArray(route?.geometry?.coordinates)) return null;
  return {
    coordinates: route.geometry.coordinates.map(toCoordinatePair),
    distance: route.distance,
    duration: route.duration,
  };
}

exports.handler = async (event) => {
  try {
    const q = event.queryStringParameters || {};
    const fromLat = Number(q.fromLat);
    const fromLon = Number(q.fromLon);
    const toLat = Number(q.toLat);
    const toLon = Number(q.toLon);
    if (
      !isFiniteNumber(fromLat) ||
      !isFiniteNumber(fromLon) ||
      !isFiniteNumber(toLat) ||
      !isFiniteNumber(toLon)
    ) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Invalid coordinates" }),
      };
    }
    const from = { latitude: fromLat, longitude: fromLon };
    const to = { latitude: toLat, longitude: toLon };

    const osrm = await fetchOsrm(from, to);
    if (osrm) {
      return { statusCode: 200, body: JSON.stringify({ ok: true, route: osrm }) };
    }

    const mapboxToken =
      process.env.MAPBOX_TOKEN || process.env.EXPO_PUBLIC_MAPBOX_TOKEN || "";
    const mapbox = await fetchMapbox(from, to, mapboxToken.trim());
    if (mapbox) {
      return { statusCode: 200, body: JSON.stringify({ ok: true, route: mapbox }) };
    }

    return {
      statusCode: 404,
      body: JSON.stringify({ ok: false, error: "No route available" }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : "Routing proxy failed",
      }),
    };
  }
};

