import {
  buildManifestDeliveryPlan,
  MANIFEST_PLAN_KM_PER_DAY,
} from "@/features/trips/utils/manifestDeliveryPlan.util";

export type LongHaulLateTripPlanInput = {
  distance?: string | number | null;
  startedAt?: string | null;
  pickupAt?: string | null;
  createdAt?: string | null;
};

export type LongHaulLateDisplay = {
  scheduledEtaLabel: string | null;
  revisedEtaLabel: string | null;
  delayLabel: string | null;
  paceLabel: string;
};

/** Normalize `YYYY-MM-DD` or ISO timestamps to a display label. */
export function formatLongHaulEtaLabel(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    try {
      const d = new Date(`${s}T12:00:00`);
      if (!Number.isFinite(d.getTime())) return s;
      return d.toLocaleDateString("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    } catch {
      return s;
    }
  }
  try {
    const d = new Date(s);
    if (!Number.isFinite(d.getTime())) return s;
    return d.toLocaleDateString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return s;
  }
}

function parseEtaToDayMs(raw: string | null | undefined): number | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  const isoDay = /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T00:00:00+05:30` : s;
  const ms = new Date(isoDay).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Delay between scheduled and revised ETAs.
 * Uses date-level comparison (aligned with DB `to_char(..., 'YYYY-MM-DD')` pings).
 */
export function formatLongHaulDelayLabel(
  scheduledEta: string | Date | null | undefined,
  revisedEta: string | null | undefined,
): string | null {
  const scheduledMs =
    scheduledEta instanceof Date
      ? scheduledEta.getTime()
      : parseEtaToDayMs(
          typeof scheduledEta === "string" ? scheduledEta : null,
        );
  const revisedMs = parseEtaToDayMs(revisedEta);
  if (scheduledMs == null || revisedMs == null) return null;

  const diffMs = revisedMs - scheduledMs;
  if (diffMs <= 0) return null;

  const diffHours = diffMs / 3_600_000;
  if (diffHours < 24) {
    const h = Math.max(1, Math.round(diffHours));
    return `${h} hour${h === 1 ? "" : "s"} late`;
  }

  const diffDays = diffMs / 86_400_000;
  const d = Math.max(1, Math.round(diffDays));
  return `${d} day${d === 1 ? "" : "s"} late`;
}

/** Scheduled ETA from trip distance ÷ 350 km/day (manifest delivery plan). */
export function resolveScheduledEtaIso(
  trip: LongHaulLateTripPlanInput | null | undefined,
): string | null {
  if (!trip) return null;
  const plan = buildManifestDeliveryPlan({
    tripDistance: trip.distance,
    startedAt: trip.startedAt,
    pickupAt: trip.pickupAt,
    createdAt: trip.createdAt,
  });
  if (!plan.estimatedDeliveryAt) return null;
  return plan.estimatedDeliveryAt.toISOString().slice(0, 10);
}

export function buildLongHaulLateDisplay(params: {
  revisedEta?: string | null;
  originalEta?: string | null;
  tripPlan?: LongHaulLateTripPlanInput | null;
}): LongHaulLateDisplay {
  const revisedRaw = (params.revisedEta ?? "").trim() || null;
  const originalRaw =
    (params.originalEta ?? "").trim() ||
    resolveScheduledEtaIso(params.tripPlan) ||
    null;

  const scheduledEtaLabel = formatLongHaulEtaLabel(originalRaw);
  const revisedEtaLabel = formatLongHaulEtaLabel(revisedRaw);
  const delayLabel = formatLongHaulDelayLabel(originalRaw, revisedRaw);

  return {
    scheduledEtaLabel,
    revisedEtaLabel,
    delayLabel,
    paceLabel: `${MANIFEST_PLAN_KM_PER_DAY} km/day`,
  };
}
