/**
 * Human-readable place line from expo reverse geocode (driver trip strip / map callouts).
 */
import * as Location from 'expo-location';
import { Platform } from 'react-native';

export function formatGeocodedPlaceLine(place: Location.LocationGeocodedAddress): string {
  const parts = [
    place.name || place.street || null,
    place.city || place.subregion || place.region || null,
  ].filter(Boolean) as string[];
  return parts.length ? parts.join(', ') : '';
}

/** City + state/region only (e.g. "Chennai, Tamil Nadu") — driver location pills / HUD. */
export function formatGeocodedCityState(place: Location.LocationGeocodedAddress): string {
  const cityRaw =
    place.city?.trim() ||
    place.subregion?.trim() ||
    place.district?.trim() ||
    '';
  const stateRaw = place.region?.trim() || '';
  const parts = [cityRaw, stateRaw].filter(Boolean);
  return parts.join(', ');
}

export async function reverseGeocodePlaceLabel(
  latitude: number,
  longitude: number,
): Promise<string | null> {
  // expo-location web warns: Geocoding API removed in SDK 49; skip on web.
  if (Platform.OS === 'web') return null;

  try {
    const results = (await Promise.race([
      Location.reverseGeocodeAsync({ latitude, longitude }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 6500),
      ),
    ])) as Location.LocationGeocodedAddress[];

    if (!results?.length) return null;
    const line = formatGeocodedPlaceLine(results[0]).trim();
    return line || null;
  } catch {
    return null;
  }
}

/** Reverse geocode to **city, state** only (readable HUD without street noise). */
export async function reverseGeocodeCityStateLabel(
  latitude: number,
  longitude: number,
): Promise<string | null> {
  if (Platform.OS === 'web') return null;

  try {
    const results = (await Promise.race([
      Location.reverseGeocodeAsync({ latitude, longitude }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 6500),
      ),
    ])) as Location.LocationGeocodedAddress[];

    if (!results?.length) return null;
    const line = formatGeocodedCityState(results[0]).trim();
    return line || null;
  } catch {
    return null;
  }
}
