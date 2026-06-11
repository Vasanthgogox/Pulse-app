const TERMINAL_TRIP_STATUSES = new Set([
  "completed",
  "trip_completed",
  "delivered",
  "delivery_completed",
  "done",
  "closed",
  "archived",
  "cancelled",
  "canceled",
  "cancelled_by_dispatcher",
  "cancelled_by_driver",
  "cancelled_by_supplier",
  "cancelled_by_client",
]);

/** Trip finished successfully — show in-chat mission debrief (not cancelled). */
const FEEDBACK_ELIGIBLE_TRIP_STATUSES = new Set(["completed", "delivered", "done"]);

export function isTerminalTripStatus(status: string | null | undefined): boolean {
  const normalized = String(status ?? "").trim().toLowerCase();
  if (!normalized) return false;
  return TERMINAL_TRIP_STATUSES.has(normalized);
}

/**
 * Hub "Active" scope — aligned with bootstrap `p_hub_trip_bucket = 'active'`
 * (any non-terminal trip, including loading / transit / pending_acceptance).
 */
export function isHubActiveTripStatus(status: string | null | undefined): boolean {
  return !isTerminalTripStatus(status);
}

/**
 * Driver chat is meaningful: trip left draft/planning but is not finished.
 * Used for manual-trip driver lanes (requires assigned driver_id separately).
 */
export function isOperationalTripChatStatus(status: string | null | undefined): boolean {
  const normalized = String(status ?? "").trim().toLowerCase();
  if (!normalized) return false;
  if (isTerminalTripStatus(normalized)) return false;
  return normalized !== "draft";
}

export function isTripFeedbackEligibleStatus(status: string | null | undefined): boolean {
  const normalized = String(status ?? "").trim().toLowerCase();
  if (!normalized) return false;
  return FEEDBACK_ELIGIBLE_TRIP_STATUSES.has(normalized);
}

export function parseTripIdSortKey(label: string): number {
  const normalized = String(label ?? "").trim();
  if (!normalized) return 0;

  const trailingDigits = normalized.match(/(\d+)(?!.*\d)/);
  if (!trailingDigits) return 0;

  const value = Number.parseInt(trailingDigits[1], 10);
  return Number.isFinite(value) ? value : 0;
}
