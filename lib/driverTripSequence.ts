import type { TripRow } from "@/services/tripsService";

function toTime(value: string | null | undefined): number {
  if (!value) return 0;
  const ts = new Date(value).getTime();
  return Number.isFinite(ts) ? ts : 0;
}

export function formatDriverTripSequence(n: number): string {
  return `DRV${String(Math.max(1, n)).padStart(3, "0")}`;
}

/**
 * Driver-scoped sequencing:
 * - Deduplicate by trip id
 * - Stable order by created_at asc (then pickup_date, then id)
 * - Sequence starts at 1 for the driver's own trip pool
 */
export function buildDriverTripNumberMap(
  trips: Array<TripRow | null | undefined>,
): Record<string, string> {
  const dedup = new Map<string, TripRow>();
  for (const trip of trips) {
    if (!trip?.id) continue;
    const existing = dedup.get(trip.id);
    if (!existing) {
      dedup.set(trip.id, trip);
      continue;
    }
    const existingTime = toTime(existing.created_at);
    const nextTime = toTime(trip.created_at);
    if (nextTime > 0 && (existingTime === 0 || nextTime < existingTime)) {
      dedup.set(trip.id, trip);
    }
  }

  const ordered = Array.from(dedup.values()).sort((a, b) => {
    const ac = toTime(a.created_at);
    const bc = toTime(b.created_at);
    if (ac !== bc) return ac - bc;
    const ap = toTime(a.pickup_date);
    const bp = toTime(b.pickup_date);
    if (ap !== bp) return ap - bp;
    return String(a.id).localeCompare(String(b.id));
  });

  const out: Record<string, string> = {};
  for (let i = 0; i < ordered.length; i++) {
    out[ordered[i].id] = formatDriverTripSequence(i + 1);
  }
  return out;
}

export function getDriverTripDisplayNumber(
  trip: TripRow,
  byTripId: Record<string, string>,
): string {
  const fromDb = trip.driver_display_trip_id?.trim();
  if (fromDb) return fromDb;
  return byTripId[String(trip.id)] ?? "—";
}

