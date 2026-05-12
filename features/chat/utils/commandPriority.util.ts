import type { ActiveTripSummary } from "@/lib/globalSync/types";

export type TripHubRowLike = {
  tripId: string;
  totalUnread: number;
  tripStatus: string | null;
  /** Optional indent for commercial / unpaid heuristics */
  indentId?: string | null;
};

function isLateRiskTrip(tripId: string, activeTrips: ActiveTripSummary[]): boolean {
  const hit = activeTrips.find((t) => t.trip_id === tripId);
  if (!hit?.recent_events?.length) return false;
  for (const e of hit.recent_events) {
    const mt = String(e.message_type ?? "");
    const body = String(e.content ?? "").toLowerCase();
    if (mt === "system_log" && body.includes("behind schedule")) return true;
    const meta = e.metadata as Record<string, unknown> | undefined;
    const tag = String(meta?.event_payload && typeof meta.event_payload === "object"
      ? (meta.event_payload as { event_tag?: unknown }).event_tag
      : meta?.event_tag ?? "");
    if (tag === "LATE") return true;
  }
  return false;
}

/**
 * Web command sidebar: higher score sorts earlier (after unread bucketing).
 * Boosts LATE_RISK-style trips and rows linked to an indent (commercial / unpaid follow-up).
 */
export function commandPriorityScore(
  row: TripHubRowLike,
  activeTrips: ActiveTripSummary[],
): number {
  let score = 0;
  if (isLateRiskTrip(row.tripId, activeTrips)) score += 10_000;
  if (row.indentId && String(row.indentId).trim() !== "") score += 1_000;
  const ps = String(row.tripStatus ?? "").toLowerCase();
  if (ps && ps !== "completed" && ps !== "cancelled" && (ps.includes("unpaid") || ps.includes("pending"))) {
    score += 500;
  }
  return score;
}
