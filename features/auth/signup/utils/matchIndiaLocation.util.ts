import INDIA_LOCATIONS from '@/lib/data/indiaLocations.json';

import type { IndiaLocation } from '../components/CityPicker';

const ALL_LOCATIONS = INDIA_LOCATIONS as IndiaLocation[];

const CITY_ALIAS_TO_CANONICAL: Record<string, string> = {
  bengaluru: 'Bangalore',
  bangalore: 'Bangalore',
  'new delhi': 'Delhi',
  delhi: 'Delhi',
  mysuru: 'Mysore',
  mysore: 'Mysore',
  mangaluru: 'Mangalore',
  mangalore: 'Mangalore',
  madras: 'Chennai',
  calcutta: 'Kolkata',
  bombay: 'Mumbai',
  gurgaon: 'Gurugram',
  gurugram: 'Gurugram',
};

function stripDiacritics(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '');
}

function norm(value: string): string {
  return stripDiacritics(value).trim().toLowerCase().replace(/\s+/g, ' ');
}

function canonicalCity(city: string): string {
  const key = norm(city);
  return CITY_ALIAS_TO_CANONICAL[key] ?? city.trim();
}

/** Parse "street, city, state, India" style place labels from search results. */
export function parsePlaceDisplayName(displayName: string): {
  city?: string;
  state?: string;
  locality?: string;
  street?: string;
} {
  const parts = displayName.split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) {
    return { street: displayName.trim() || undefined };
  }

  const withoutCountry =
    parts[parts.length - 1].toLowerCase() === 'india' ? parts.slice(0, -1) : parts;

  if (withoutCountry.length < 2) return {};

  const state = withoutCountry[withoutCountry.length - 1];
  const city = withoutCountry[withoutCountry.length - 2];
  const street = withoutCountry.length > 2 ? withoutCountry[0] : undefined;
  const locality =
    withoutCountry.length > 3 ? withoutCountry[withoutCountry.length - 3] : undefined;

  return { street, locality, city, state };
}

/** Match reverse-geocoded or parsed city/state to the signup India locations list. */
export function matchIndiaLocation(
  city?: string | null,
  state?: string | null,
): IndiaLocation | null {
  const cityCanon = city ? canonicalCity(city) : '';
  const stateNorm = state ? norm(state) : '';
  if (!cityCanon && !stateNorm) return null;

  const cityNorm = norm(cityCanon);

  if (cityNorm && stateNorm) {
    const exact = ALL_LOCATIONS.find(
      (loc) => norm(loc.city) === cityNorm && norm(loc.state) === stateNorm,
    );
    if (exact) return exact;
  }

  if (cityNorm) {
    const byCity = ALL_LOCATIONS.filter((loc) => norm(loc.city) === cityNorm);
    if (byCity.length === 1) return byCity[0];
    if (stateNorm) {
      const withState = byCity.find((loc) => norm(loc.state) === stateNorm);
      if (withState) return withState;
    }

    const partial = ALL_LOCATIONS.find(
      (loc) => norm(loc.city).includes(cityNorm) || cityNorm.includes(norm(loc.city)),
    );
    if (partial) return partial;
  }

  return null;
}
