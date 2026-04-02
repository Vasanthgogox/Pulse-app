/**
 * Place search for India with lat/lon.
 * Primary: Mapbox (100k free/mo, fast) → Google Places (if key) → Nominatim (1 req/s).
 * Fallback: cached places (AsyncStorage, selected only, max 500) + popular list.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface PlaceResult {
  placeId: string;
  displayName: string;
  lat: number;
  lon: number;
}

const PLACES_CACHE_KEY = 'qmobile_places_cache';
const PLACES_CACHE_MAX = 500;

type SearchOpts = {
  /** Optional abort signal for canceling network requests. */
  signal?: AbortSignal;
};

function normalizeKey(displayName: string): string {
  return displayName.trim().toLowerCase().replace(/\s+/g, ' ');
}

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'Q-Mobile-Logistics/1.0 (India places; contact@example.com)';

const MAPBOX_GEOCODING_BASE = 'https://api.mapbox.com/geocoding/v5/mapbox.places';

/**
 * Guardrails to reduce unwanted usage:
 * - Only call network APIs for queries >= 3 chars (shorter uses cache/popular)
 * - Per-provider cooldowns (Nominatim is 1 req/s)
 * - In-memory TTL cache to dedupe repeated typing/rerenders
 */
const MIN_API_QUERY_LENGTH = 3;
const MEMORY_CACHE_TTL_MS = 5 * 60 * 1000;
const MEMORY_CACHE_MAX = 200;

// Hard cap (per app session/device) to protect against runaway usage.
// When exceeded, we fall back to cached/popular results until the window refills.
const MAPBOX_HARD_CAP = { capacity: 20, refillMs: 60 * 1000 } as const;
const MAPBOX_CIRCUIT_BREAKER_MS = 5 * 60 * 1000;

const PLACES_DEBUG =
  typeof process !== 'undefined' &&
  String(process.env?.EXPO_PUBLIC_PLACES_DEBUG ?? '').trim() === '1';

const PROVIDER_COOLDOWN_MS = {
  mapbox: 250,
  google: 300,
  nominatim: 1100,
} as const;

type Provider = keyof typeof PROVIDER_COOLDOWN_MS;

const memoryCache = new Map<string, { ts: number; results: PlaceResult[] }>();
const inflight = new Map<string, Promise<PlaceResult[]>>();
const lastProviderCallAt: Record<Provider, number> = {
  mapbox: 0,
  google: 0,
  nominatim: 0,
};

type TokenBucket = { tokens: number; lastRefillAt: number };
const mapboxBucket: TokenBucket = { tokens: MAPBOX_HARD_CAP.capacity, lastRefillAt: Date.now() };
let mapboxBlockedUntil = 0;

function tryConsumeMapboxToken(): boolean {
  const now = Date.now();
  const elapsed = now - mapboxBucket.lastRefillAt;
  if (elapsed >= MAPBOX_HARD_CAP.refillMs) {
    const periods = Math.floor(elapsed / MAPBOX_HARD_CAP.refillMs);
    if (periods > 0) {
      mapboxBucket.tokens = MAPBOX_HARD_CAP.capacity;
      mapboxBucket.lastRefillAt = now;
    }
  }
  if (mapboxBucket.tokens <= 0) return false;
  mapboxBucket.tokens -= 1;
  return true;
}

function isMapboxBlocked(): boolean {
  return Date.now() < mapboxBlockedUntil;
}

function blockMapboxTemporarily() {
  mapboxBlockedUntil = Date.now() + MAPBOX_CIRCUIT_BREAKER_MS;
}

function cacheGet(key: string): PlaceResult[] | null {
  const hit = memoryCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.ts > MEMORY_CACHE_TTL_MS) {
    memoryCache.delete(key);
    return null;
  }
  return hit.results;
}

function cacheSet(key: string, results: PlaceResult[]) {
  memoryCache.set(key, { ts: Date.now(), results });
  if (memoryCache.size > MEMORY_CACHE_MAX) {
    // drop oldest entries to cap memory
    const entries = [...memoryCache.entries()].sort((a, b) => a[1].ts - b[1].ts);
    const toDrop = entries.slice(0, Math.ceil(MEMORY_CACHE_MAX / 5));
    for (const [k] of toDrop) memoryCache.delete(k);
  }
}

function canCallProvider(provider: Provider): boolean {
  const now = Date.now();
  if (now - lastProviderCallAt[provider] < PROVIDER_COOLDOWN_MS[provider]) return false;
  lastProviderCallAt[provider] = now;
  return true;
}

/** Mapbox Geocoding: fast, 100k free/month. India-only. center is [lon, lat]. */
async function searchMapbox(query: string, opts?: SearchOpts): Promise<PlaceResult[]> {
  const token = typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_MAPBOX_TOKEN?.trim();
  if (!token) return [];

  const trimmed = query.trim();
  if (!trimmed) return [];
  if (isMapboxBlocked()) return [];
  if (!canCallProvider('mapbox')) return [];
  if (!tryConsumeMapboxToken()) return [];

  const params = new URLSearchParams({
    access_token: token,
    country: 'IN',
    limit: '8',
    types: 'place,address,locality,neighborhood',
  });
  const url = `${MAPBOX_GEOCODING_BASE}/${encodeURIComponent(trimmed)}.json?${params.toString()}`;

  if (__DEV__ && PLACES_DEBUG) {
    console.debug('[places] mapbox', {
      q: trimmed,
      tokens_left_in_window: mapboxBucket.tokens,
      blocked_until_ms: mapboxBlockedUntil,
    });
  }

  const res = await fetch(url, { signal: opts?.signal });
  if (!res.ok) {
    // If Mapbox is throttling or temporarily failing, stop trying for a bit
    // so we don't keep hitting it on every keystroke.
    if (res.status === 429 || (res.status >= 500 && res.status <= 599)) {
      blockMapboxTemporarily();
    }
    return [];
  }
  const data = (await res.json()) as { features?: Array<{ id: string; place_name: string; center: [number, number] }> };
  const features = data.features ?? [];
  return features.map((f) => ({
    placeId: f.id ?? f.place_name,
    displayName: f.place_name ?? '',
    lat: Array.isArray(f.center) && f.center[1] != null ? f.center[1] : 0,
    lon: Array.isArray(f.center) && f.center[0] != null ? f.center[0] : 0,
  }));
}

/** Nominatim: search places in India; returns display name and coordinates. Fallback (1 req/s). */
async function searchNominatim(query: string, opts?: SearchOpts): Promise<PlaceResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  if (!canCallProvider('nominatim')) return [];

  const params = new URLSearchParams({
    q: trimmed,
    countrycodes: 'in',
    format: 'json',
    limit: '10',
    addressdetails: '0',
  });
  const url = `${NOMINATIM_BASE}?${params.toString()}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'User-Agent': USER_AGENT,
    },
    signal: opts?.signal,
  });
  if (!res.ok) return [];
  const data = (await res.json()) as Array<{ place_id: number; display_name: string; lat: string; lon: string }>;
  if (!Array.isArray(data)) return [];

  return data.map((item) => ({
    placeId: String(item.place_id),
    displayName: item.display_name ?? '',
    lat: parseFloat(item.lat) || 0,
    lon: parseFloat(item.lon) || 0,
  }));
}

/** Google Places Autocomplete + Details (optional). Requires EXPO_PUBLIC_GOOGLE_PLACES_API_KEY. */
async function searchGooglePlaces(query: string, opts?: SearchOpts): Promise<PlaceResult[]> {
  const apiKey = typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY?.trim();
  if (!apiKey) return [];

  const trimmed = query.trim();
  if (!trimmed) return [];
  if (!canCallProvider('google')) return [];

  const autocompleteUrl = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(trimmed)}&components=country:in&key=${apiKey}`;
  const acRes = await fetch(autocompleteUrl, { signal: opts?.signal });
  if (!acRes.ok) return [];
  const acData = (await acRes.json()) as { predictions?: Array<{ place_id: string; description: string }> };
  const predictions = acData.predictions ?? [];
  if (predictions.length === 0) return [];

  const results: PlaceResult[] = [];
  for (const p of predictions.slice(0, 10)) {
    const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(p.place_id)}&fields=geometry,name,formatted_address&key=${apiKey}`;
    const detRes = await fetch(detailsUrl, { signal: opts?.signal });
    if (!detRes.ok) continue;
    const detData = (await detRes.json()) as { result?: { geometry?: { location?: { lat: number; lng: number } }; formatted_address?: string; name?: string } };
    const loc = detData.result?.geometry?.location;
    if (!loc) continue;
    results.push({
      placeId: p.place_id,
      displayName: detData.result?.formatted_address ?? p.description ?? '',
      lat: loc.lat,
      lon: loc.lng,
    });
  }
  return results;
}

/**
 * Popular Indian cities for instant suggestions (prefix match when API returns nothing).
 * Approximate lat/lon for map/distance use.
 */
const POPULAR_PLACES: PlaceResult[] = [
  { placeId: 'popular-mumbai', displayName: 'Mumbai, Maharashtra', lat: 19.076, lon: 72.8777 },
  { placeId: 'popular-delhi', displayName: 'Delhi, NCR', lat: 28.6139, lon: 77.209 },
  { placeId: 'popular-bengaluru', displayName: 'Bengaluru, Karnataka', lat: 12.9716, lon: 77.5946 },
  { placeId: 'popular-hyderabad', displayName: 'Hyderabad, Telangana', lat: 17.385, lon: 78.4867 },
  { placeId: 'popular-chennai', displayName: 'Chennai, Tamil Nadu', lat: 13.0827, lon: 80.2707 },
  { placeId: 'popular-kolkata', displayName: 'Kolkata, West Bengal', lat: 22.5726, lon: 88.3639 },
  { placeId: 'popular-pune', displayName: 'Pune, Maharashtra', lat: 18.5204, lon: 73.8567 },
  { placeId: 'popular-ahmedabad', displayName: 'Ahmedabad, Gujarat', lat: 23.0225, lon: 72.5714 },
  { placeId: 'popular-jaipur', displayName: 'Jaipur, Rajasthan', lat: 26.9124, lon: 75.7873 },
  { placeId: 'popular-surat', displayName: 'Surat, Gujarat', lat: 21.1702, lon: 72.8311 },
  { placeId: 'popular-lucknow', displayName: 'Lucknow, Uttar Pradesh', lat: 26.8467, lon: 80.9462 },
  { placeId: 'popular-nagpur', displayName: 'Nagpur, Maharashtra', lat: 21.1458, lon: 79.0882 },
  { placeId: 'popular-indore', displayName: 'Indore, Madhya Pradesh', lat: 22.7196, lon: 75.8577 },
  { placeId: 'popular-kochi', displayName: 'Kochi, Kerala', lat: 9.9312, lon: 76.2673 },
  { placeId: 'popular-coimbatore', displayName: 'Coimbatore, Tamil Nadu', lat: 11.0168, lon: 76.9558 },
  { placeId: 'popular-manali', displayName: 'Manali, Himachal Pradesh', lat: 32.2396, lon: 77.1887 },
  { placeId: 'popular-shimla', displayName: 'Shimla, Himachal Pradesh', lat: 31.1048, lon: 77.1734 },
  { placeId: 'popular-goa', displayName: 'Panaji, Goa', lat: 15.4909, lon: 73.8278 },
  { placeId: 'popular-rishikesh', displayName: 'Rishikesh, Uttarakhand', lat: 30.0869, lon: 78.2676 },
  { placeId: 'popular-dehradun', displayName: 'Dehradun, Uttarakhand', lat: 30.3165, lon: 78.0322 },
  { placeId: 'popular-ooty', displayName: 'Ooty, Tamil Nadu', lat: 11.4102, lon: 76.6950 },
  { placeId: 'popular-darjeeling', displayName: 'Darjeeling, West Bengal', lat: 27.0410, lon: 88.2663 },
  { placeId: 'popular-udaipur', displayName: 'Udaipur, Rajasthan', lat: 24.5854, lon: 73.7125 },
  { placeId: 'popular-varanasi', displayName: 'Varanasi, Uttar Pradesh', lat: 25.3176, lon: 82.9739 },
  { placeId: 'popular-amritsar', displayName: 'Amritsar, Punjab', lat: 31.6340, lon: 74.8723 },
];

/** Return popular places, optionally filtered by prefix (case-insensitive). */
export function getPopularPlacesInIndia(prefix?: string): PlaceResult[] {
  const p = (prefix ?? '').trim().toLowerCase();
  if (!p) return POPULAR_PLACES;
  return POPULAR_PLACES.filter((place) =>
    place.displayName.toLowerCase().includes(p)
  );
}

/** Read cached places from AsyncStorage, optionally filtered by query. */
export async function getCachedPlaces(query?: string): Promise<PlaceResult[]> {
  try {
    const raw = await AsyncStorage.getItem(PLACES_CACHE_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as PlaceResult[];
    if (!Array.isArray(list)) return [];
    const q = (query ?? '').trim().toLowerCase();
    if (!q) return list.slice(0, 30);
    const filtered = list.filter((p) =>
      (p.displayName ?? '').toLowerCase().includes(q)
    );
    const prefixMatches = filtered.filter((p) =>
      (p.displayName ?? '').toLowerCase().startsWith(q)
    );
    const rest = filtered.filter((p) => !prefixMatches.includes(p));
    return [...prefixMatches, ...rest].slice(0, 25);
  } catch {
    return [];
  }
}

/** Add a place to the cache (e.g. when user selects it). Dedupes by displayName; keeps recent first; cap at PLACES_CACHE_MAX. */
export async function addToPlacesCache(place: PlaceResult): Promise<void> {
  if (!place?.displayName?.trim()) return;
  try {
    const raw = await AsyncStorage.getItem(PLACES_CACHE_KEY);
    const list: PlaceResult[] = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return;
    const key = normalizeKey(place.displayName);
    const without = list.filter((p) => normalizeKey(p.displayName) !== key);
    const next = [{ ...place, placeId: place.placeId || `cache-${key}` }, ...without].slice(0, PLACES_CACHE_MAX);
    await AsyncStorage.setItem(PLACES_CACHE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

/**
 * Search places in India: Mapbox (primary) → Google → Nominatim, then cache + popular fallback.
 */
export async function searchPlacesInIndia(query: string, opts?: SearchOpts): Promise<PlaceResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const cacheKey = normalizeKey(trimmed);
  const cachedMemory = cacheGet(cacheKey);
  if (cachedMemory) return cachedMemory;

  // Avoid spamming APIs for very short inputs; use cached/popular instead.
  if (trimmed.length < MIN_API_QUERY_LENGTH) {
    const popular = getPopularPlacesInIndia(trimmed);
    const cached = await getCachedPlaces(trimmed);
    const seen = new Set<string>();
    const merged: PlaceResult[] = [];
    for (const p of [...cached, ...popular]) {
      const k = normalizeKey(p.displayName);
      if (seen.has(k)) continue;
      seen.add(k);
      merged.push(p);
    }
    const q = trimmed.toLowerCase();
    const prefixFirst = merged.sort((a, b) => {
      const aLow = a.displayName.toLowerCase();
      const bLow = b.displayName.toLowerCase();
      const aStarts = aLow.startsWith(q) ? 1 : 0;
      const bStarts = bLow.startsWith(q) ? 1 : 0;
      if (aStarts !== bStarts) return bStarts - aStarts;
      return aLow.localeCompare(bLow);
    });
    const out = prefixFirst.slice(0, 25);
    cacheSet(cacheKey, out);
    return out;
  }

  // Deduplicate concurrent identical queries (e.g. multiple rerenders/fields).
  const inflightHit = inflight.get(cacheKey);
  if (inflightHit) return inflightHit;

  const hasMapbox = typeof process !== 'undefined' && !!process.env?.EXPO_PUBLIC_MAPBOX_TOKEN?.trim();
  const hasGoogle = typeof process !== 'undefined' && !!process.env?.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY?.trim();

  const p = (async () => {
    let apiResults: PlaceResult[] = [];
    try {
      if (hasMapbox) {
        apiResults = await searchMapbox(trimmed, opts);
      }
      if (apiResults.length === 0 && hasGoogle) {
        apiResults = await searchGooglePlaces(trimmed, opts);
      }
      if (apiResults.length === 0) {
        apiResults = await searchNominatim(trimmed, opts);
      }
    } catch (e: any) {
      // Abort is expected during typing; suppress noisy logs.
      if (e?.name !== 'AbortError') {
        console.warn('placesService search error', e);
      }
    }

    if (apiResults.length > 0) {
      cacheSet(cacheKey, apiResults);
      return apiResults;
    }

    const popular = getPopularPlacesInIndia(trimmed);
    const cached = await getCachedPlaces(trimmed);
    const seen = new Set<string>();
    const merged: PlaceResult[] = [];
    for (const p of [...cached, ...popular]) {
      const k = normalizeKey(p.displayName);
      if (seen.has(k)) continue;
      seen.add(k);
      merged.push(p);
    }
    const q = trimmed.toLowerCase();
    const prefixFirst = merged.sort((a, b) => {
      const aLow = a.displayName.toLowerCase();
      const bLow = b.displayName.toLowerCase();
      const aStarts = aLow.startsWith(q) ? 1 : 0;
      const bStarts = bLow.startsWith(q) ? 1 : 0;
      if (aStarts !== bStarts) return bStarts - aStarts;
      return aLow.localeCompare(bLow);
    });
    const out = prefixFirst.slice(0, 25);
    cacheSet(cacheKey, out);
    return out;
  })().finally(() => {
    inflight.delete(cacheKey);
  });

  inflight.set(cacheKey, p);
  return p;
}
