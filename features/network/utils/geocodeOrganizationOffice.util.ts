import type { OrganizationLocation } from "@/features/organization/services/organization.service";
import type { OfficeMapCoordinate } from "@/features/network/hooks/useOrganizationOfficeMap";
import { buildOrganizationOfficeGeocodeQuery } from "@/features/network/utils/organizationOfficeLocation.util";

const MAPBOX_GEOCODING_BASE =
  "https://api.mapbox.com/geocoding/v5/mapbox.places";
const NOMINATIM_BASE = "https://nominatim.openstreetmap.org/search";
const NOMINATIM_USER_AGENT = "Pulse-Logistics/1.0 (office HQ geocode)";

function readMapboxToken(): string {
  if (typeof process === "undefined") return "";
  return process.env?.EXPO_PUBLIC_MAPBOX_TOKEN?.trim() ?? "";
}

function officeGeocodeQueries(
  location?: OrganizationLocation | null,
): string[] {
  if (!location) return [];
  const seen = new Set<string>();
  const queries: string[] = [];
  const push = (q: string) => {
    const trimmed = q.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    queries.push(trimmed);
  };

  const full = buildOrganizationOfficeGeocodeQuery(location);
  if (full) push(full);

  const address = location.address_line?.trim();
  const city = location.city?.trim();
  const state = location.state?.trim();

  if (address && city && state) {
    push(`${address}, ${city}, ${state}, India`);
  }
  if (address && city) {
    push(`${address}, ${city}, India`);
  }
  if (city && state) {
    push(`${city}, ${state}, India`);
  }
  if (city) {
    push(`${city}, India`);
  }

  return queries;
}

async function forwardMapbox(
  query: string,
): Promise<{ coordinate: OfficeMapCoordinate; name: string } | null> {
  const token = readMapboxToken();
  if (!token) return null;

  const params = new URLSearchParams({
    access_token: token,
    country: "IN",
    limit: "1",
    types: "address,place,locality,neighborhood,poi",
  });
  const url = `${MAPBOX_GEOCODING_BASE}/${encodeURIComponent(query)}.json?${params}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      features?: Array<{
        place_name?: string;
        center?: [number, number];
      }>;
    };
    const feature = data.features?.[0];
    const lng = feature?.center?.[0];
    const lat = feature?.center?.[1];
    if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return null;
    }
    return {
      coordinate: { latitude: lat, longitude: lng },
      name: feature?.place_name?.trim() || query,
    };
  } catch {
    return null;
  }
}

async function forwardNominatim(
  query: string,
): Promise<{ coordinate: OfficeMapCoordinate; name: string } | null> {
  const params = new URLSearchParams({
    q: query,
    countrycodes: "in",
    format: "json",
    limit: "1",
    addressdetails: "0",
  });

  try {
    const res = await fetch(`${NOMINATIM_BASE}?${params}`, {
      headers: {
        Accept: "application/json",
        "User-Agent": NOMINATIM_USER_AGENT,
      },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{
      display_name?: string;
      lat?: string;
      lon?: string;
    }>;
    const hit = data?.[0];
    const lat = hit?.lat ? parseFloat(hit.lat) : NaN;
    const lng = hit?.lon ? parseFloat(hit.lon) : NaN;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return {
      coordinate: { latitude: lat, longitude: lng },
      name: hit?.display_name?.trim() || query,
    };
  } catch {
    return null;
  }
}

/** Forward-geocode org HQ — Mapbox then Nominatim, multiple query variants. */
export async function geocodeOrganizationOffice(
  location?: OrganizationLocation | null,
): Promise<{ coordinate: OfficeMapCoordinate | null; geocodedName: string | null }> {
  const queries = officeGeocodeQueries(location);
  for (const query of queries) {
    const mapbox = await forwardMapbox(query);
    if (mapbox) {
      return {
        coordinate: mapbox.coordinate,
        geocodedName: mapbox.name,
      };
    }
    const nominatim = await forwardNominatim(query);
    if (nominatim) {
      return {
        coordinate: nominatim.coordinate,
        geocodedName: nominatim.name,
      };
    }
  }
  return { coordinate: null, geocodedName: null };
}
