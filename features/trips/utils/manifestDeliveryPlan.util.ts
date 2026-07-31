import { formatEstimatedDuration } from "@/lib/formatEstimatedDuration";
import { formatManifestEteFromRouteSeconds } from "@/features/trips/utils/manifestEta.util";

/**
 * Scope note: this used to also back the customer/business Live Tracking
 * views (LiveTrackingModal / TripDetailTrackingHub) as a "current ETA"
 * source -- that was the bug (a static distance/350-km-per-day plan shown
 * as if it were live, with no check that the result was still in the
 * future). Live tracking now consumes computeJourneyMetrics() +
 * liveTrackingEta.util.ts instead; see docs/TRIP_OPERATIONS_PLATFORM.md.
 *
 * This module's one remaining legitimate consumer is
 * features/chat/utils/longHaulLateDisplay.util.ts, which needs exactly this
 * static "originally scheduled" baseline -- a delay comparison ("3 days
 * late") is inherently a comparison against a fixed original promise, not a
 * moving live prediction. Don't reach for this file for anything that
 * displays as "current" status; that's the distinction that broke last time.
 */

/** Long-haul planning pace (aligned with adaptive ping / TAT rules). */
export const MANIFEST_PLAN_KM_PER_DAY = 350;

const MIN_TAT_DAYS = 0.25;

export type ManifestDeliveryPlan = {
  distanceKm: number | null;
  driverEtaSeconds: number | null;
  /** Human driver ETA from routing or trip estimate (e.g. `4h 20m`). */
  driverEtaLabel: string;
  /** Swiggy-style badge: large value + small unit (driver hours). */
  etaBadgeValue: string;
  etaBadgeUnit: string;
  /** Estimated delivery date badge (day + month). */
  deliveryDateBadgeValue: string;
  deliveryDateBadgeUnit: string;
  tatDays: number | null;
  estimatedDeliveryAt: Date | null;
  estimatedDeliveryDateLabel: string;
  /** `Driver ETA · 4h 20m` */
  planSummaryLine: string;
  /** `Est. delivery 18 May · 742 km · ~2.1 days @ 350 km/day` */
  planDetailLine: string;
};

export function parseTripDistanceKm(
  tripDistance: string | number | null | undefined,
  mapRouteDistanceKm?: string | null,
): number | null {
  if (tripDistance != null && tripDistance !== "") {
    const n =
      typeof tripDistance === "number"
        ? tripDistance
        : parseFloat(String(tripDistance));
    if (Number.isFinite(n) && n > 0) return n;
  }
  const mapRaw = (mapRouteDistanceKm ?? "").replace(/^≈\s*/i, "").trim();
  const mapMatch = mapRaw.match(/^([\d.]+)/);
  if (mapMatch) {
    const n = parseFloat(mapMatch[1]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function parseEstimatedDurationToSeconds(
  estimatedDuration: string | null | undefined,
): number | null {
  const formatted = formatEstimatedDuration(estimatedDuration);
  if (formatted === "—") return null;
  const h = formatted.match(/(\d+)\s*H/i);
  const m = formatted.match(/(\d+)\s*M/i);
  const hours = h ? Number(h[1]) : 0;
  const minutes = m ? Number(m[1]) : 0;
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  const total = hours * 3600 + minutes * 60;
  return total > 0 ? total : null;
}

/** Badge like reference: `45` / `mins` or `2` / `h 30m`. */
export function driverEtaBadgeFromSeconds(
  seconds: number | null | undefined,
): { value: string; unit: string } {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) {
    return { value: "—", unit: "ETA" };
  }
  const totalMin = Math.max(1, Math.round(seconds / 60));
  if (totalMin < 60) {
    return {
      value: String(totalMin),
      unit: totalMin === 1 ? "min" : "mins",
    };
  }
  const h = Math.floor(totalMin / 60);
  const rem = totalMin % 60;
  if (rem === 0) {
    return { value: String(h), unit: h === 1 ? "hr" : "hrs" };
  }
  return { value: String(h), unit: `${rem}m` };
}

/** Purple card for planned delivery date (350 km/day). */
export function deliveryDateBadgeFromPlan(
  estimatedDeliveryAt: Date | null,
  tatDays: number | null,
): { value: string; unit: string } {
  if (estimatedDeliveryAt) {
    try {
      const day = estimatedDeliveryAt.toLocaleDateString("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "numeric",
      });
      const month = estimatedDeliveryAt.toLocaleDateString("en-IN", {
        timeZone: "Asia/Kolkata",
        month: "short",
      });
      return { value: day, unit: month };
    } catch {
      return { value: "—", unit: "date" };
    }
  }
  if (tatDays != null && tatDays > 0) {
    const rounded =
      tatDays < 1 ? "<1" : String(Math.max(1, Math.round(tatDays)));
    return {
      value: rounded,
      unit: tatDays < 1.05 ? "day" : "days",
    };
  }
  return { value: "—", unit: "date" };
}

function formatPlanDate(d: Date): string {
  try {
    return d.toLocaleDateString("en-IN", {
      timeZone: "Asia/Kolkata",
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

function resolvePlanAnchorIso(params: {
  startedAt?: string | null;
  pickupAt?: string | null;
  createdAt?: string | null;
}): string {
  const candidates = [params.startedAt, params.pickupAt, params.createdAt];
  for (const raw of candidates) {
    const t = (raw ?? "").trim();
    if (!t) continue;
    const ms = new Date(t).getTime();
    if (Number.isFinite(ms)) return t;
  }
  return new Date().toISOString();
}

/**
 * Delivery plan for live-tracking ETA card:
 * - Driver hour ETA from route seconds (or trip estimated_duration)
 * - Estimated delivery date from distance ÷ 350 km/day
 */
export function buildManifestDeliveryPlan(params: {
  tripDistance?: string | number | null;
  mapRouteDistanceKm?: string | null;
  routeEtaSeconds?: number | null;
  estimatedDuration?: string | null;
  startedAt?: string | null;
  pickupAt?: string | null;
  createdAt?: string | null;
}): ManifestDeliveryPlan {
  const distanceKm = parseTripDistanceKm(
    params.tripDistance,
    params.mapRouteDistanceKm,
  );

  const routeSeconds =
    params.routeEtaSeconds != null &&
    Number.isFinite(params.routeEtaSeconds) &&
    params.routeEtaSeconds > 0
      ? params.routeEtaSeconds
      : null;
  const durationSeconds = parseEstimatedDurationToSeconds(
    params.estimatedDuration,
  );
  const driverEtaSeconds = routeSeconds ?? durationSeconds;

  const driverEtaLabel =
    routeSeconds != null
      ? formatManifestEteFromRouteSeconds(routeSeconds)
      : durationSeconds != null
        ? formatManifestEteFromRouteSeconds(durationSeconds)
        : "—";

  const { value: etaBadgeValue, unit: etaBadgeUnit } =
    driverEtaBadgeFromSeconds(driverEtaSeconds);

  const tatDays =
    distanceKm != null && distanceKm > 0
      ? Math.max(MIN_TAT_DAYS, distanceKm / MANIFEST_PLAN_KM_PER_DAY)
      : null;

  const anchorIso = resolvePlanAnchorIso(params);
  const anchorMs = new Date(anchorIso).getTime();
  const estimatedDeliveryAt =
    tatDays != null && Number.isFinite(anchorMs)
      ? new Date(anchorMs + tatDays * 86_400_000)
      : null;

  const { value: deliveryDateBadgeValue, unit: deliveryDateBadgeUnit } =
    deliveryDateBadgeFromPlan(estimatedDeliveryAt, tatDays);

  const estimatedDeliveryDateLabel = estimatedDeliveryAt
    ? formatPlanDate(estimatedDeliveryAt)
    : "—";

  const distanceLabel =
    distanceKm != null
      ? `${Math.round(distanceKm) === distanceKm ? Math.round(distanceKm) : distanceKm.toFixed(1)} km`
      : null;

  const tatLabel =
    tatDays != null
      ? tatDays < 1
        ? "under 1 day"
        : `~${tatDays.toFixed(1)} day${tatDays >= 1.95 ? "s" : ""}`
      : null;

  const planSummaryLine =
    driverEtaLabel !== "—"
      ? `Driver ETA · ${driverEtaLabel}`
      : "Driver ETA · calculating";

  const planParts: string[] = [];
  if (distanceLabel) planParts.push(distanceLabel);
  if (tatLabel) {
    planParts.push(`${tatLabel} @ ${MANIFEST_PLAN_KM_PER_DAY} km/day`);
  }
  if (estimatedDeliveryDateLabel !== "—") {
    planParts.push(estimatedDeliveryDateLabel);
  }
  const planDetailLine =
    planParts.length > 0 ? planParts.join(" · ") : "Distance plan unavailable";

  return {
    distanceKm,
    driverEtaSeconds,
    driverEtaLabel,
    etaBadgeValue,
    etaBadgeUnit,
    deliveryDateBadgeValue,
    deliveryDateBadgeUnit,
    tatDays,
    estimatedDeliveryAt,
    estimatedDeliveryDateLabel,
    planSummaryLine,
    planDetailLine,
  };
}
