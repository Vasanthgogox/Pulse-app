/**
 * Live-bid card alerts: when a quote was awarded and pickup/deploy deadline.
 */

import { formatEstimatedDuration } from "@/lib/formatEstimatedDuration";

export type IndentBidAlertTone = "neutral" | "soon" | "urgent" | "overdue";

export type IndentBidAlertInfo = {
  /** e.g. "Awarded 2 hours ago" */
  awardedAgoLabel: string | null;
  /** e.g. "Pickup due in 2 days" */
  dueByLabel: string | null;
  /** Single line for compact card strip */
  summaryLine: string;
  tone: IndentBidAlertTone;
};

const MS_MINUTE = 60 * 1000;
const MS_HOUR = 60 * MS_MINUTE;
const MS_DAY = 24 * MS_HOUR;

function parsePickupDeadline(iso: string | null | undefined): Date | null {
  const raw = (iso ?? "").trim();
  if (!raw) return null;
  try {
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      const [y, m, d] = raw.split("-").map(Number);
      const local = new Date(y, m - 1, d, 5, 30, 0, 0);
      return Number.isNaN(local.getTime()) ? null : local;
    }
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  } catch {
    return null;
  }
}

function formatRelativeBucket(ms: number, future: boolean): string {
  const abs = Math.abs(ms);
  if (abs < MS_HOUR) {
    const minutes = Math.max(1, Math.round(abs / MS_MINUTE));
    return future
      ? `in ${minutes} min`
      : `${minutes} min ago`;
  }
  if (abs < MS_DAY) {
    const hours = Math.max(1, Math.round(abs / MS_HOUR));
    const unit = hours === 1 ? "hour" : "hours";
    return future ? `in ${hours} ${unit}` : `${hours} ${unit} ago`;
  }
  const days = Math.max(1, Math.round(abs / MS_DAY));
  const unit = days === 1 ? "day" : "days";
  return future ? `in ${days} ${unit}` : `${days} ${unit} ago`;
}

function formatAwardedAgo(
  updatedAt: string | null | undefined,
  createdAt: string | null | undefined,
  now: Date,
): string | null {
  const iso = (updatedAt ?? createdAt ?? "").trim();
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  const ms = now.getTime() - at.getTime();
  if (ms < MS_MINUTE) return "Awarded just now";
  return `Awarded ${formatRelativeBucket(ms, false)}`;
}

function formatDueByLabel(deadline: Date, now: Date): {
  label: string;
  tone: IndentBidAlertTone;
} {
  const ms = deadline.getTime() - now.getTime();
  if (ms < 0) {
    return {
      label: `Pickup overdue ${formatRelativeBucket(ms, false)}`,
      tone: "overdue",
    };
  }
  if (ms < MS_HOUR) {
    return {
      label: `Pickup due ${formatRelativeBucket(ms, true)}`,
      tone: "urgent",
    };
  }
  if (ms < MS_DAY * 2) {
    return {
      label: `Pickup due ${formatRelativeBucket(ms, true)}`,
      tone: "soon",
    };
  }
  return {
    label: `Pickup due ${formatRelativeBucket(ms, true)}`,
    tone: "neutral",
  };
}

/** Build alert copy for an accepted (awarded) direct quote on the owner indent hub. */
export function buildIndentAwardedBidAlert(
  quote: {
    status?: string | null;
    updated_at?: string | null;
    created_at?: string | null;
  },
  pickupDateIso: string | null | undefined,
  now: Date = new Date(),
): IndentBidAlertInfo | null {
  const status = (quote.status ?? "").trim().toLowerCase();
  if (status !== "accepted") return null;

  const awardedAgoLabel = formatAwardedAgo(
    quote.updated_at,
    quote.created_at,
    now,
  );
  const deadline = parsePickupDeadline(pickupDateIso);
  const due = deadline ? formatDueByLabel(deadline, now) : null;

  const parts = [awardedAgoLabel, due?.label].filter(Boolean) as string[];
  if (parts.length === 0) return null;

  return {
    awardedAgoLabel,
    dueByLabel: due?.label ?? null,
    summaryLine: parts.join(" · "),
    tone: due?.tone ?? "neutral",
  };
}

export type IndentDeployTimingInfo = {
  dueByLabel: string | null;
  /** e.g. "Awarded 2 hours ago" */
  awardedDurationLabel: string | null;
  /** e.g. "Est. 14H 22M" or "450 km" when stored on indent */
  transitDurationLabel: string | null;
  tone: IndentBidAlertTone;
};

/** Route / ETA hint from indent row when present (trips copy these fields on create). */
export function formatIndentTransitDurationLabel(indent: {
  distance?: unknown;
  estimated_duration?: unknown;
}): string | null {
  const est =
    typeof indent.estimated_duration === "string"
      ? indent.estimated_duration.trim()
      : "";
  if (est) {
    const formatted = formatEstimatedDuration(est);
    if (formatted !== "—") return `Est. ${formatted}`;
  }
  const rawDist = indent.distance;
  if (rawDist != null && rawDist !== "") {
    const n =
      typeof rawDist === "number"
        ? rawDist
        : parseFloat(String(rawDist).replace(/[^0-9.]/g, ""));
    if (Number.isFinite(n) && n > 0) {
      return `${Math.round(n).toLocaleString("en-IN")} km`;
    }
  }
  return null;
}

/** Pickup due + time since award (+ optional transit estimate) for deploy modal. */
export function buildIndentDeployTiming(
  quote: {
    status?: string | null;
    updated_at?: string | null;
    created_at?: string | null;
  },
  indent: {
    pickup_date?: string | null;
    distance?: unknown;
    estimated_duration?: unknown;
  },
  now: Date = new Date(),
): IndentDeployTimingInfo {
  const alert = buildIndentAwardedBidAlert(quote, indent.pickup_date, now);
  const transitDurationLabel = formatIndentTransitDurationLabel(indent);

  return {
    dueByLabel: alert?.dueByLabel ?? null,
    awardedDurationLabel: alert?.awardedAgoLabel ?? null,
    transitDurationLabel,
    tone: alert?.tone ?? "neutral",
  };
}
