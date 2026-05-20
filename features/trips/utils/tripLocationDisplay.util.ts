/**
 * Trip route labels: bold city + tiny address/region line (Mapbox / manual "City, State").
 */

const INDIAN_REGIONS = new Set(
  [
    "andaman and nicobar islands",
    "andhra pradesh",
    "arunachal pradesh",
    "assam",
    "bihar",
    "chandigarh",
    "chhattisgarh",
    "dadra and nagar haveli and daman and diu",
    "delhi",
    "goa",
    "gujarat",
    "haryana",
    "himachal pradesh",
    "jammu and kashmir",
    "jharkhand",
    "karnataka",
    "kerala",
    "ladakh",
    "lakshadweep",
    "madhya pradesh",
    "maharashtra",
    "manipur",
    "meghalaya",
    "mizoram",
    "nagaland",
    "ncr",
    "odisha",
    "puducherry",
    "punjab",
    "rajasthan",
    "sikkim",
    "tamil nadu",
    "telangana",
    "tripura",
    "uttar pradesh",
    "uttarakhand",
    "west bengal",
  ].map((s) => s.toLowerCase()),
);

/** Major localities — longest names first for embedded matching. */
const KNOWN_LOCALITIES = [
  "bengaluru",
  "bangalore",
  "mumbai",
  "bombay",
  "delhi",
  "new delhi",
  "chennai",
  "madras",
  "kolkata",
  "calcutta",
  "hyderabad",
  "pune",
  "ahmedabad",
  "jaipur",
  "lucknow",
  "kanpur",
  "nagpur",
  "indore",
  "bhopal",
  "visakhapatnam",
  "vizag",
  "coimbatore",
  "kochi",
  "cochin",
  "thiruvananthapuram",
  "trivandrum",
  "guwahati",
  "chandigarh",
  "noida",
  "gurugram",
  "gurgaon",
  "faridabad",
  "ghaziabad",
  "surat",
  "vadodara",
  "baroda",
  "rajkot",
  "nashik",
  "aurangabad",
  "mysuru",
  "mysore",
  "mangalore",
  "mangaluru",
  "hubli",
  "tiruchirappalli",
  "trichy",
  "madurai",
  "salem",
  "tiruppur",
  "erode",
  "vellore",
  "tiruvannamalai",
  "vanapuram",
].sort((a, b) => b.length - a.length);

const ADDRESS_HINT =
  /\b(center|centre|tower|gateway|road|rd\.?|street|st\.?|market|complex|building|plaza|mall|highway|nh[\s-]?\d|sector|block|phase|ward|enclave|colony|nagar|layout|trade|world|brigade|metro|station|airport|hospital|hotel|park|estate|industrial|warehouse|depot|port|junction|circle|square|cross)\b/i;

function normalizeToken(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function isIndianRegionPart(value: string): boolean {
  const key = normalizeToken(value);
  if (!key) return false;
  if (INDIAN_REGIONS.has(key)) return true;
  if (key.length < 4) return false;
  for (const region of INDIAN_REGIONS) {
    if (key.includes(region) || region.includes(key)) return true;
  }
  return false;
}

function isPostalCodePart(value: string): boolean {
  return /^\d{6}$/.test(value.trim());
}

function looksLikeAddress(value: string): boolean {
  const t = value.trim();
  if (!t) return false;
  if (t.length > 32) return true;
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length >= 5) return true;
  return ADDRESS_HINT.test(t);
}

function isKnownLocality(value: string): boolean {
  const key = normalizeToken(value);
  if (!key) return false;
  return KNOWN_LOCALITIES.some(
    (loc) => key === loc || key.includes(loc) || loc.includes(key),
  );
}

function stripTrailingCountryAndPostal(parts: string[]): string[] {
  const out = [...parts];
  while (out.length > 0) {
    const last = out[out.length - 1].trim();
    const lower = last.toLowerCase();
    if (lower === "india" || lower === "in") {
      out.pop();
      continue;
    }
    if (isPostalCodePart(last)) {
      out.pop();
      continue;
    }
    break;
  }
  return out;
}

function findEmbeddedLocality(raw: string): { city: string; detail: string } | null {
  const lower = raw.toLowerCase();
  for (const loc of KNOWN_LOCALITIES) {
    const idx = lower.indexOf(loc);
    if (idx < 0) continue;
    const before = raw.slice(0, idx).replace(/[,\s]+$/, "").trim();
    const after = raw.slice(idx + loc.length).replace(/^[,\s]+/, "").trim();
    const citySlice = raw.slice(idx, idx + loc.length).trim();
    const detailParts = [before, after].filter(Boolean);
    if (detailParts.length > 0) {
      return { city: citySlice, detail: detailParts.join(", ") };
    }
    if (before) return { city: citySlice, detail: before };
  }
  return null;
}

function pickCityFromParts(parts: string[]): { cityIndex: number } | null {
  for (let i = parts.length - 1; i >= 0; i--) {
    if (isIndianRegionPart(parts[i])) continue;
    if (isKnownLocality(parts[i]) && !looksLikeAddress(parts[i])) {
      return { cityIndex: i };
    }
  }
  for (let i = parts.length - 1; i >= 0; i--) {
    if (isIndianRegionPart(parts[i])) continue;
    if (!looksLikeAddress(parts[i]) && parts[i].length <= 28) {
      return { cityIndex: i };
    }
  }
  return null;
}

function joinLocationParts(parts: string[]): string {
  return parts.filter(Boolean).join(", ").trim();
}

function peelRegionAndPostal(parts: string[]): { body: string[]; tail: string[] } {
  const body = [...parts];
  const tail: string[] = [];
  while (body.length > 0) {
    const last = body[body.length - 1];
    if (isPostalCodePart(last) || isIndianRegionPart(last)) {
      tail.unshift(body.pop()!);
      continue;
    }
    break;
  }
  return { body, tail };
}

function splitFromBodyAndTail(
  bodyParts: string[],
  tailParts: string[],
): TripLocationDisplayParts {
  if (bodyParts.length === 0) {
    if (tailParts.length === 0) return { city: "—", detail: "" };
    if (tailParts.length === 1) return { city: tailParts[0], detail: "" };
    return splitTwoParts(tailParts[0], joinLocationParts(tailParts.slice(1)));
  }
  if (bodyParts.length === 1) {
    const merged = joinLocationParts([...bodyParts, ...tailParts]);
    if (looksLikeAddress(bodyParts[0])) {
      const embedded = findEmbeddedLocality(merged);
      if (embedded) return embedded;
    }
    return splitTwoParts(bodyParts[0], joinLocationParts(tailParts));
  }

  const cityPick = pickCityFromParts(bodyParts);
  if (cityPick) {
    const city = bodyParts[cityPick.cityIndex];
    const detail = joinLocationParts([
      ...bodyParts.filter((_, i) => i !== cityPick.cityIndex),
      ...tailParts,
    ]);
    return { city, detail };
  }

  for (let i = bodyParts.length - 1; i >= 0; i--) {
    if (looksLikeAddress(bodyParts[i]) || isIndianRegionPart(bodyParts[i])) continue;
    const city = bodyParts[i];
    const detail = joinLocationParts([
      ...bodyParts.filter((_, j) => j !== i),
      ...tailParts,
    ]);
    return { city, detail };
  }

  const city = bodyParts[bodyParts.length - 1];
  const detail = joinLocationParts([...bodyParts.slice(0, -1), ...tailParts]);
  return { city, detail };
}

function splitTwoParts(a: string, b: string): TripLocationDisplayParts {
  if (isIndianRegionPart(b)) {
    if (looksLikeAddress(a)) {
      const embedded = findEmbeddedLocality(a);
      if (embedded) {
        return {
          city: embedded.city,
          detail: joinLocationParts([embedded.detail, b]),
        };
      }
    }
    if (isKnownLocality(a) && !looksLikeAddress(a)) return { city: a, detail: b };
    if (!looksLikeAddress(a)) return { city: a, detail: b };
    return { city: a, detail: b };
  }
  if (looksLikeAddress(a) && !looksLikeAddress(b)) return { city: b, detail: a };
  if (looksLikeAddress(a) && isKnownLocality(b)) return { city: b, detail: a };
  if (!looksLikeAddress(a) && looksLikeAddress(b)) return { city: a, detail: b };
  return { city: a, detail: b };
}

export type TripLocationDisplayParts = {
  /** Primary line (city / locality). */
  city: string;
  /** Secondary line (street, area, taluk, or state). */
  detail: string;
};

/** @deprecated Use `splitTripLocationDisplay` — kept for older imports. */
export function splitTripLocationParts(
  location: string | null | undefined,
): { city: string; state: string } {
  const { city, detail } = splitTripLocationDisplay(location);
  return { city, state: detail };
}

/**
 * "Venue, Bengaluru, Karnataka, India" → city Bengaluru, detail venue + Karnataka.
 * "Noida, World Trade Center, Uttar Pradesh" → city Noida, detail World Trade Center + UP.
 * "Vanapuram, Thandrampet, Tiruvannamalai" → city Tiruvannamalai, detail Vanapuram, Thandrampet.
 * "Chennai, Tamil Nadu" → city Chennai, detail Tamil Nadu.
 */
export function splitTripLocationDisplay(
  location: string | null | undefined,
): TripLocationDisplayParts {
  try {
    return splitTripLocationDisplayInner(location);
  } catch {
    const raw = (location ?? "").trim();
    return { city: raw || "—", detail: "" };
  }
}

function splitTripLocationDisplayInner(
  location: string | null | undefined,
): TripLocationDisplayParts {
  const raw = (location ?? "").trim();
  if (!raw) return { city: "—", detail: "" };

  let parts = raw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  parts = stripTrailingCountryAndPostal(parts);

  if (parts.length === 0) return { city: "—", detail: "" };
  if (parts.length === 1) {
    if (looksLikeAddress(parts[0])) {
      const embedded = findEmbeddedLocality(parts[0]);
      if (embedded) return embedded;
    }
    return { city: parts[0], detail: "" };
  }
  const { body, tail } = peelRegionAndPostal(parts);
  if (tail.length > 0) {
    return splitFromBodyAndTail(body, tail);
  }

  if (body.length === 2) {
    return splitTwoParts(body[0], body[1]);
  }

  const cityPick = pickCityFromParts(body);
  if (cityPick) {
    const city = body[cityPick.cityIndex];
    const detail = body
      .filter((_, i) => i !== cityPick.cityIndex)
      .join(", ")
      .trim();
    return { city, detail };
  }

  return {
    city: body[0],
    detail: body.slice(1).join(", ").trim(),
  };
}

