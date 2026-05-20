import type { ActiveTripRecentEvent, ActiveTripSummary } from "./types";

/** True when recent chat events indicate long-haul / schedule slip (12-ping lane). */
export function tripRecentEventsShowLateSignal(events: ActiveTripRecentEvent[] | undefined): boolean {
  if (!events?.length) return false;
  for (const e of events) {
    const mt = String(e.message_type ?? "").toLowerCase();
    if (mt !== "system_log" && mt !== "system") continue;
    const meta = e.metadata as Record<string, unknown> | undefined;
    if (meta?.long_haul_late === true) return true;
    const ep =
      meta?.event_payload && typeof meta.event_payload === "object" && !Array.isArray(meta.event_payload)
        ? (meta.event_payload as Record<string, unknown>)
        : null;
    if (String(ep?.event_tag ?? "").toUpperCase() === "LATE") return true;
    const c = String(e.content ?? "").toUpperCase();
    if (c.includes("LATE") || c.includes("BEHIND SCHEDULE") || c.includes("RUNNING_LATE")) return true;
  }
  return false;
}

export function lateMonitoringTripsFromActive(
  trips: ActiveTripSummary[],
  excludeTripIds: Set<string>,
): ActiveTripSummary[] {
  const out: ActiveTripSummary[] = [];
  for (const t of trips) {
    if (excludeTripIds.has(t.trip_id)) continue;
    if (tripRecentEventsShowLateSignal(t.recent_events)) out.push(t);
  }
  return out.sort((a, b) => {
    const ta = a.recent_events?.length ? Date.parse(a.recent_events[a.recent_events.length - 1]!.created_at) : 0;
    const tb = b.recent_events?.length ? Date.parse(b.recent_events[b.recent_events.length - 1]!.created_at) : 0;
    return tb - ta;
  });
}
