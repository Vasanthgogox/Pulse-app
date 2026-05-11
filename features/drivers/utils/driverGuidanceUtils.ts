import { getPopularPlacesInIndia, type PlaceResult } from "@/lib/placesService";
import type { TripRow } from "@/features/trips/services/trips.service";

/**
 * Resolve pickup/drop coordinates for routing — mirrors driver dashboard logic.
 */
export function getTripStopCoordinate(
  trip: TripRow,
  target: "pickup" | "drop",
): { latitude: number; longitude: number } | null {
  const latitude = Number(
    target === "pickup" ? trip.pickup_lat : trip.drop_lat,
  );
  const longitude = Number(
    target === "pickup" ? trip.pickup_lon : trip.drop_lon,
  );
  if (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    (latitude !== 0 || longitude !== 0)
  ) {
    return { latitude, longitude };
  }

  const areaStr = (
    target === "pickup"
      ? trip.pickup_area
      : trip.drop_location || trip.drop_area
  )?.trim();
  if (areaStr) {
    const popular = getPopularPlacesInIndia(areaStr);
    if (popular.length > 0) {
      const exact = popular.find(
        (p: PlaceResult) => p.displayName.toLowerCase() === areaStr.toLowerCase(),
      );
      const match = exact || popular[0];
      return { latitude: match.lat, longitude: match.lon };
    }

    const parts = areaStr
      .split(/[,|\s]+/)
      .map((p: string) => p.trim())
      .filter((p: string) => p.length > 2);
    for (const part of parts) {
      const matches = getPopularPlacesInIndia(part);
      if (matches.length > 0) {
        return { latitude: matches[0].lat, longitude: matches[0].lon };
      }
    }
  }

  return null;
}
