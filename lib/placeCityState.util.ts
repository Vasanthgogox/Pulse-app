/**
 * Canonical city + state labels for lanes / routes / place pickers.
 * Prefer structured city/state from the places API; otherwise parse noisy
 * display strings (warehouse names, pincodes, Mapbox place_name).
 */

const PINCODE_RE = /^\d{6}$/;
const NOISE_RE =
  /\b(warehouse|ware\s*house|godown|depot|hub|yard|plant|factory|office|unit|shed|wh)\b/i;
const INDIA_RE = /^(india|bharat)$/i;

function stripDiacritics(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "");
}

function collapseWs(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** Title-case words while keeping short connectors lowercase mid-phrase. */
export function titleCasePlacePart(value: string): string {
  const cleaned = collapseWs(value);
  if (!cleaned) return "";
  const ACRONYMS = new Set([
    "ncr",
    "nh",
    "sh",
    "uk",
    "up",
    "mp",
    "hp",
    "ap",
    "tn",
    "wb",
    "gj",
    "rj",
    "mh",
    "ka",
    "kl",
    "ts",
    "tg",
  ]);
  return cleaned
    .split(" ")
    .map((word, idx) => {
      const lower = word.toLowerCase();
      if (idx > 0 && (lower === "and" || lower === "of" || lower === "the")) {
        return lower;
      }
      if (ACRONYMS.has(lower)) return lower.toUpperCase();
      // Preserve existing all-caps short tokens (e.g. NCR).
      if (/^[A-Z]{2,5}$/.test(word)) return word;
      if (/^[A-Za-z]+$/.test(word)) {
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      }
      return word;
    })
    .join(" ");
}

function isPincodeToken(value: string): boolean {
  return PINCODE_RE.test(value.replace(/\s/g, ""));
}

function isNoiseSegment(value: string): boolean {
  const t = collapseWs(value);
  if (!t) return true;
  if (isPincodeToken(t)) return true;
  if (INDIA_RE.test(t)) return true;
  if (NOISE_RE.test(t) && !stripNoiseWords(t)) return true;
  return false;
}

/** Drop warehouse/hub noise tokens so "Chennai Warehouse" → "Chennai". */
function stripNoiseWords(value: string): string {
  return collapseWs(value.replace(NOISE_RE, " "));
}

/**
 * Build "City, State" from structured fields when available.
 */
export function formatCityStateFromParts(
  city?: string | null,
  state?: string | null,
): string {
  const c = titleCasePlacePart(city ?? "");
  const s = titleCasePlacePart(state ?? "");
  if (c && s) {
    if (stripDiacritics(c).toLowerCase() === stripDiacritics(s).toLowerCase()) {
      return c;
    }
    return `${c}, ${s}`;
  }
  return c || s || "";
}

/**
 * Parse a free-text place / lane endpoint into city + state.
 * Handles:
 * - "Jaipur, Rajasthan"
 * - "Street, Chennai, Tamil Nadu, India"
 * - "Chennai warehouse · Chennai warehouse · CHennai, Tamil nadu · 600093"
 */
export function parseCityStateFromPlaceText(
  raw: string | null | undefined,
): { city?: string; state?: string } {
  const input = collapseWs(raw ?? "");
  if (!input) return {};

  // Prefer middle-dot / pipe segments from warehouse composite labels.
  const segments = input
    .split(/\s*[·|•]\s*/)
    .map((s) => collapseWs(s))
    .filter(Boolean);

  const candidates =
    segments.length > 1
      ? [...segments].reverse().filter((s) => !isNoiseSegment(s))
      : [input];

  for (const candidate of candidates) {
    const commaParts = candidate
      .split(",")
      .map((p) => collapseWs(p))
      .filter(Boolean)
      .filter((p) => !isPincodeToken(p) && !INDIA_RE.test(p));

    if (commaParts.length >= 2) {
      // Mapbox-style: …, city, state[, India]
      const state = commaParts[commaParts.length - 1]!;
      const city = commaParts[commaParts.length - 2]!;
      if (city && state && !isNoiseSegment(city)) {
        return { city, state };
      }
    }

    // Single token that isn't warehouse noise — treat as city-only.
    if (commaParts.length === 1) {
      const cleaned = stripNoiseWords(commaParts[0]!);
      if (cleaned && !isPincodeToken(cleaned) && !INDIA_RE.test(cleaned)) {
        return { city: cleaned };
      }
    }
  }

  // Last resort: drop trailing pincode tokens from the full string.
  const fallbackParts = input
    .split(",")
    .map((p) => collapseWs(p))
    .filter((p) => p && !isPincodeToken(p) && !INDIA_RE.test(p));
  if (fallbackParts.length >= 2) {
    return {
      city: fallbackParts[fallbackParts.length - 2],
      state: fallbackParts[fallbackParts.length - 1],
    };
  }
  if (fallbackParts.length === 1) {
    const cleaned = stripNoiseWords(fallbackParts[0]!);
    if (cleaned && !isPincodeToken(cleaned)) {
      return { city: cleaned };
    }
  }

  return {};
}

export type PlaceCityStateInput = {
  city?: string | null;
  state?: string | null;
  displayName?: string | null;
  /** Alias for displayName / raw field value */
  raw?: string | null;
};

/**
 * Canonical display label for a place endpoint: **"City, State"** only.
 */
export function formatCityStateLabel(input: PlaceCityStateInput | string | null | undefined): string {
  if (input == null) return "";
  if (typeof input === "string") {
    const parsed = parseCityStateFromPlaceText(input);
    return formatCityStateFromParts(parsed.city, parsed.state) || titleCasePlacePart(input);
  }

  const fromParts = formatCityStateFromParts(input.city, input.state);
  if (fromParts) return fromParts;

  const raw = input.displayName ?? input.raw ?? "";
  const parsed = parseCityStateFromPlaceText(raw);
  const fromParsed = formatCityStateFromParts(parsed.city, parsed.state);
  if (fromParsed) return fromParsed;

  return titleCasePlacePart(raw);
}

/** Lane / route line: `Origin → Destination` with city+state endpoints. */
export function formatLaneRouteLabel(
  origin: PlaceCityStateInput | string | null | undefined,
  destination: PlaceCityStateInput | string | null | undefined,
): string {
  const from = formatCityStateLabel(origin);
  const to = formatCityStateLabel(destination);
  if (from && to) return `${from} → ${to}`;
  return from || to || "";
}

export type EnrichedPlaceSelection = {
  label: string;
  lat: number;
  lon: number;
  city: string | null;
  state: string | null;
  pincode: string | null;
};

function normalizePlacePincode(value?: string | null): string | null {
  const digits = (value ?? "").replace(/\D/g, "").slice(0, 6);
  if (digits.length !== 6 || digits[0] === "0") return null;
  return digits;
}

/**
 * Sync enrich a places-API result into city / state / pincode + "City, State" label.
 * Used by LocationSearchField (and any hub / lane pickers) so structured fields
 * fill even when the provider only returns a noisy displayName.
 */
export function enrichPlaceSelectionSync(place: {
  displayName: string;
  lat: number;
  lon: number;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
}): EnrichedPlaceSelection {
  const parsed = parseCityStateFromPlaceText(place.displayName);
  const cityRaw = place.city?.trim() || parsed.city || "";
  const stateRaw = place.state?.trim() || parsed.state || "";
  const city = titleCasePlacePart(cityRaw) || null;
  const state = titleCasePlacePart(stateRaw) || null;
  const pincode =
    normalizePlacePincode(place.pincode) ||
    normalizePlacePincode(place.displayName.match(/\b([1-9]\d{5})\b/)?.[1] ?? null);
  const label =
    formatCityStateFromParts(city, state) ||
    formatCityStateLabel(place.displayName) ||
    titleCasePlacePart(place.displayName);
  return {
    label,
    lat: place.lat,
    lon: place.lon,
    city,
    state,
    pincode,
  };
}
