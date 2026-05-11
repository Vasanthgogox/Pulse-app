import { supabase } from "@/lib/supabase";
import type { TripRow } from "@/features/trips/services/trips.service";
import { getOptimalRoute } from "@/services/routingService";

/** Standard long-haul budget before stretch mode (3h cadence). */
export const LONG_HAUL_STANDARD_PINGS = 12;

/** After 12 checkpoints, continue reporting every 3h until trip completes / geofence (handled client-side). */
export const STRETCH_PING_INTERVAL_MS = 3 * 60 * 60 * 1000;

const MIN_INTERVAL_MS = 2 * 60 * 1000;
const MAX_INTERVAL_MS = 6 * 60 * 60 * 1000;

const DEFAULT_ETA_MS = 48 * 60 * 60 * 1000;

/** Trip fields needed to plan pings from `getOptimalRoute` (pickup → drop). */
export type TripRoutePlanInput = Pick<
  TripRow,
  "id" | "distance" | "pickup_lat" | "pickup_lon" | "drop_lat" | "drop_lon"
>;

function parseTripCoord(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const n = parseFloat(String(value).trim());
  return Number.isFinite(n) ? n : null;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export type LongHaulHealthStatus = "ON_TRACK" | "LATE_RISK" | "CRITICAL_DELAY" | string;

function parseTripDistanceKm(distance: unknown): number | null {
  if (distance == null) return null;
  if (typeof distance === "number" && Number.isFinite(distance)) return distance;
  const raw = String(distance).trim();
  if (!raw) return null;
  const n = parseFloat(raw.replace(/,/g, "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/**
 * ETA window for adaptive ping math: prefer route km at 350 km/day floor, else fixed default.
 */
export function estimateTripEtaMsFromRow(
  trip: Partial<Pick<TripRow, "distance" | "estimated_duration">> | null | undefined,
): number {
  const km = trip ? parseTripDistanceKm(trip.distance) : null;
  if (km != null && km > 0) {
    const days = Math.max(km / 350, 0.25);
    return Math.round(days * 86400000);
  }
  return DEFAULT_ETA_MS;
}

/**
 * Uses {@link getOptimalRoute} when pickup/drop coordinates exist so ping cadence matches the road plan.
 * Blends driving-time ETA with a 350 km/day floor (same pacing as long-haul health). Falls back to
 * straight-line km or stored `distance`, then {@link DEFAULT_ETA_MS}.
 */
export async function resolveTotalEtaMsForAdaptivePing(trip: TripRoutePlanInput | null | undefined): Promise<number> {
  if (!trip?.id) return DEFAULT_ETA_MS;

  const fromLat = parseTripCoord(trip.pickup_lat);
  const fromLon = parseTripCoord(trip.pickup_lon);
  const toLat = parseTripCoord(trip.drop_lat);
  const toLon = parseTripCoord(trip.drop_lon);

  if (
    fromLat != null &&
    fromLon != null &&
    toLat != null &&
    toLon != null &&
    [fromLat, toLat].every((n) => Math.abs(n) <= 90) &&
    [fromLon, toLon].every((n) => Math.abs(n) <= 180)
  ) {
    try {
      const route = await getOptimalRoute(
        { latitude: fromLat, longitude: fromLon },
        { latitude: toLat, longitude: toLon },
      );
      if (route && Number.isFinite(route.distance) && route.distance > 0 && Number.isFinite(route.duration)) {
        const km = route.distance / 1000;
        const driveMs = Math.max(0, route.duration) * 1000;
        const longHaulFloorMs = Math.max(km / 350, 0.25) * 86400000;
        return Math.round(Math.max(driveMs, longHaulFloorMs));
      }
    } catch {
      // fall through
    }

    const straightKm = haversineKm(fromLat, fromLon, toLat, toLon);
    if (Number.isFinite(straightKm) && straightKm > 0) {
      return estimateTripEtaMsFromRow({
        ...trip,
        distance: Math.max(1, Math.round(straightKm)),
      });
    }
  }

  return estimateTripEtaMsFromRow(trip);
}

/** Stable key for when to re-resolve route-based ETA (coords or stored distance changed). */
export function adaptivePingRoutePlanKey(trip: TripRoutePlanInput | null | undefined): string {
  if (!trip?.id) return "";
  return [
    trip.id,
    trip.pickup_lat ?? "",
    trip.pickup_lon ?? "",
    trip.drop_lat ?? "",
    trip.drop_lon ?? "",
    trip.distance ?? "",
  ].join(":");
}

export interface CalculateNextPingIntervalArgs {
  /** Planned trip duration (ms), e.g. from distance / 350km per day. */
  totalEtaMs: number;
  /** Pings left in the standard 12-ping budget (minimum 1 for division). */
  remainingPings: number;
  /** From `v_long_haul_health.health_status` (bootstrap or lightweight SELECT). */
  healthStatus: LongHaulHealthStatus | null | undefined;
  /** After 12 successful in-transit checkpoints, use {@link STRETCH_PING_INTERVAL_MS}. */
  stretchMode: boolean;
}

/**
 * Interval = total ETA / remaining pings; halve when health is `LATE_RISK` (ping more often).
 * Stretch mode fixes cadence at 3 hours.
 */
export function calculateNextPingInterval(args: CalculateNextPingIntervalArgs): number {
  if (args.stretchMode) return STRETCH_PING_INTERVAL_MS;
  const total = Number.isFinite(args.totalEtaMs) && args.totalEtaMs > 0 ? args.totalEtaMs : DEFAULT_ETA_MS;
  const remaining = Math.max(1, Math.floor(args.remainingPings));
  let interval = total / remaining;
  const h = String(args.healthStatus ?? "").trim().toUpperCase();
  if (h === "LATE_RISK") interval *= 0.5;
  if (!Number.isFinite(interval) || interval < MIN_INTERVAL_MS) return MIN_INTERVAL_MS;
  if (interval > MAX_INTERVAL_MS) return MAX_INTERVAL_MS;
  return Math.round(interval);
}

export async function fetchLongHaulHealthStatus(tripId: string): Promise<LongHaulHealthStatus | null> {
  const { data, error } = await supabase()
    .from("v_long_haul_health")
    .select("health_status")
    .eq("trip_id", tripId)
    .maybeSingle();
  if (error || !data || typeof (data as { health_status?: unknown }).health_status !== "string") {
    return null;
  }
  return (data as { health_status: string }).health_status;
}
