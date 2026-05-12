import type { ActiveTripSummary } from "./types";

function parseTs(iso: string | undefined | null): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

function lastLocationLogTs(trip: ActiveTripSummary): number {
  const ev = trip.recent_events ?? [];
  let best = 0;
  for (const e of ev) {
    if (e.message_type !== "location_log") continue;
    const ts = parseTs(e.created_at);
    if (ts > best) best = ts;
  }
  return best;
}

/** Newest `system_log` timestamp in bootstrap `recent_events` (ASC order). */
function lastSystemLogTs(trip: ActiveTripSummary): number {
  const ev = trip.recent_events ?? [];
  let best = 0;
  for (const e of ev) {
    if (e.message_type !== "system_log") continue;
    const ts = parseTs(e.created_at);
    if (ts > best) best = ts;
  }
  return best;
}

/** Newest unread row in `recent_events` (when `is_read === false`). */
function lastUnreadEventTs(trip: ActiveTripSummary): number {
  const ev = trip.recent_events ?? [];
  let best = 0;
  for (const e of ev) {
    if (e.is_read !== false) continue;
    const ts = parseTs(e.created_at);
    if (ts > best) best = ts;
  }
  return best;
}

function lastEventTs(trip: ActiveTripSummary): number {
  const ev = trip.recent_events ?? [];
  if (!ev.length) return 0;
  return parseTs(ev[ev.length - 1]?.created_at);
}

/**
 * Score used to pick the "hottest" trip for the floating trip island.
 * Reads only `ActiveTripSummary` fields — no network.
 */
export function activeTripIslandSignalTs(trip: ActiveTripSummary): number {
  const loc = parseTs(trip.last_known_location?.recorded_at);
  const sys = lastSystemLogTs(trip);
  const locLog = lastLocationLogTs(trip);
  const unreadTs = trip.total_unread > 0 ? Math.max(lastUnreadEventTs(trip), lastEventTs(trip)) : 0;
  const clientBump = parseTs(trip.client_activity_at);
  return Math.max(loc, sys, locLog, unreadTs, clientBump);
}

/** Non-terminal trips first (callers pass pre-filtered list), then strongest signal. */
export function rankActiveTripsForIsland(trips: ActiveTripSummary[]): ActiveTripSummary[] {
  return [...trips].sort((a, b) => {
    const ua = a.total_unread > 0 ? 1 : 0;
    const ub = b.total_unread > 0 ? 1 : 0;
    if (ub !== ua) return ub - ua;
    const sa = activeTripIslandSignalTs(a);
    const sb = activeTripIslandSignalTs(b);
    if (sb !== sa) return sb - sa;
    return parseTs(b.created_at) - parseTs(a.created_at);
  });
}
