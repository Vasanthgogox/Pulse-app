/**
 * Single source of truth for "when will this arrive", replacing
 * manifestDeliveryPlan.util.ts's estimatedDeliveryAt (a static
 * distance/350-km-per-day plan anchored at trip start, with no check that
 * the result was still in the future -- the root cause of stale past-date
 * ETAs surviving in the UI forever).
 *
 * Priority, each tier only accepted if it resolves to a moment still in the
 * future relative to `nowMs`:
 *   1. computeJourneyMetrics().predictedArrival -- real progress (actual
 *      GPS-covered distance vs. planned pace), the only tier that reflects
 *      whether the trip is actually running ahead or behind.
 *   2. A future estimated arrival from live routing (routeEtaSeconds, from
 *      the current position) or trip.estimated_duration anchored to when
 *      transit actually started.
 *   3. trip.estimated_duration read as a plain remaining-duration, with no
 *      absolute clock time claimed (safe when we don't trust an anchor).
 *   4. "Estimating arrival…" while journey metrics aren't ready yet (trip
 *      hasn't departed pickup -- a real transient state, not an error) or
 *      "ETA unavailable" when there's truly no usable signal.
 *
 * Never returns a past date, a negative duration, or a fabricated clock time.
 */
import type { TripRow } from "@/features/trips/services/trips.service";
import type { JourneyMetrics } from "@/features/trips/domain/tripJourneyMetrics";
import { parseIntervalMs } from "@/features/trips/domain/tripJourneyMetrics";
import type { TripStageMetrics } from "@/features/trips/domain/tripStageMetrics";

export interface LiveTrackingEta {
  label: string;
  /** Journey metrics aren't ready yet (trip hasn't departed pickup) -- transient, not an error. */
  isEstimating: boolean;
  /** No usable signal at all -- hide the ETA row rather than show a guess. */
  isUnavailable: boolean;
}

function isoDayKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** "Today 6:45 PM" / "Tomorrow 6:45 PM" / "Wed, 22 Jul · 6:45 PM" -- never a bare ISO string. */
export function formatArrivalLabel(date: Date, nowMs: number): string {
  const timeLabel = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);

  const now = new Date(nowMs);
  if (isoDayKey(date) === isoDayKey(now)) return `Today ${timeLabel}`;

  const tomorrow = new Date(nowMs + 86_400_000);
  if (isoDayKey(date) === isoDayKey(tomorrow)) return `Tomorrow ${timeLabel}`;

  const dayLabel = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(date);
  return `${dayLabel} · ${timeLabel}`;
}

function formatRemainingDuration(ms: number): string {
  const totalMin = Math.max(1, Math.round(ms / 60_000));
  if (totalMin < 60) return `~${totalMin} min remaining`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m > 0 ? `~${h}h ${m}m remaining` : `~${h}h remaining`;
}

export function resolveLiveTrackingEta(params: {
  trip: TripRow;
  stageMetrics: TripStageMetrics;
  journeyMetrics: JourneyMetrics | null;
  routeEtaSeconds?: number | null;
  nowMs?: number;
}): LiveTrackingEta {
  const nowMs = params.nowMs ?? Date.now();

  // Tier 1: real predicted arrival from actual progress.
  const predicted = params.journeyMetrics?.predictedArrival;
  if (predicted) {
    const predictedMs = new Date(predicted).getTime();
    if (Number.isFinite(predictedMs) && predictedMs > nowMs) {
      return { label: formatArrivalLabel(new Date(predictedMs), nowMs), isEstimating: false, isUnavailable: false };
    }
  }

  // Tier 2: a future estimated arrival, preferring live routing (from the
  // current position) over the static trip estimate anchored to transit start.
  if (
    params.routeEtaSeconds != null &&
    Number.isFinite(params.routeEtaSeconds) &&
    params.routeEtaSeconds > 0
  ) {
    const candidateMs = nowMs + params.routeEtaSeconds * 1000;
    return { label: formatArrivalLabel(new Date(candidateMs), nowMs), isEstimating: false, isUnavailable: false };
  }
  const estimateMs = parseIntervalMs(params.trip.estimated_duration);
  if (estimateMs != null) {
    const anchorIso =
      params.stageMetrics.pickupDepartureAt ??
      params.trip.started_at ??
      params.stageMetrics.acceptedAt ??
      params.trip.created_at ??
      null;
    const anchorMs = anchorIso ? new Date(anchorIso).getTime() : NaN;
    if (Number.isFinite(anchorMs)) {
      const candidateMs = anchorMs + estimateMs;
      if (candidateMs > nowMs) {
        return { label: formatArrivalLabel(new Date(candidateMs), nowMs), isEstimating: false, isUnavailable: false };
      }
    }
    // Tier 3: the estimate itself is real, but anchoring it produced a past
    // moment (trip is running long) -- show a plain duration, not a date we
    // don't trust, and never a negative one.
    return { label: formatRemainingDuration(estimateMs), isEstimating: false, isUnavailable: false };
  }

  // Tier 4: no usable signal. Distinguish "not ready yet" (still at/before
  // pickup, journey metrics require a departure) from truly unavailable.
  const stage = params.stageMetrics;
  const notYetDeparted = !stage.pickupDepartureAt && !stage.completedAt;
  if (notYetDeparted) {
    return { label: "Estimating arrival…", isEstimating: true, isUnavailable: false };
  }
  return { label: "ETA unavailable", isEstimating: false, isUnavailable: true };
}
