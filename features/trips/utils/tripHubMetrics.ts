import type { TripRow } from "@/features/trips/services/trips.service";

/**
 * Active Trips Control buckets (disjoint). Completed trips belong on the History tab only.
 * - `pod_pending` vs `unloading`: both use `at_drop` / arrived-at-destination; trips with any
 *   `trip_documents` row count as unloading (paperwork started), others as POD pending.
 */
export type TripMetricId =
  | "unassigned"
  | "loading"
  | "in_transit"
  | "unloading"
  | "pod_pending";

export const TRIP_METRIC_ORDER: TripMetricId[] = [
  "unassigned",
  "loading",
  "in_transit",
  "unloading",
  "pod_pending",
];

function normStatus(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

export function isTripCancelledForHub(status: string | null | undefined): boolean {
  return normStatus(status) === "cancelled";
}

export function classifyTripMetric(
  trip: TripRow,
  tripIdsWithAnyDocument: Set<string>,
): TripMetricId {
  const s = normStatus(trip.status);
  const hasDriver = trip.driver_id != null && String(trip.driver_id).trim() !== "";
  const hasStarted = !!(trip.started_at && String(trip.started_at).trim());

  if (!hasDriver || s === "cancelled") return "unassigned";

  const atDestination =
    s === "at_drop" || s === "arrived" || s === "at_destination";
  if (atDestination) {
    return tripIdsWithAnyDocument.has(trip.id) ? "unloading" : "pod_pending";
  }

  if (
    s === "in_transit" ||
    s === "dispatched" ||
    s === "transit"
  ) {
    return "in_transit";
  }

  if (
    s === "picked_up" ||
    s === "pickup" ||
    s === "assigned" ||
    (s === "in_progress" && !hasStarted)
  ) {
    return "loading";
  }

  if (s === "in_progress" && hasStarted) {
    return "in_transit";
  }

  if (s === "draft") return "unassigned";

  return "loading";
}

export function countTripsByMetric(
  trips: TripRow[],
  tripIdsWithAnyDocument: Set<string>,
): Record<TripMetricId, number> {
  const counts: Record<TripMetricId, number> = {
    unassigned: 0,
    loading: 0,
    in_transit: 0,
    unloading: 0,
    pod_pending: 0,
  };
  for (const t of trips) {
    const m = classifyTripMetric(t, tripIdsWithAnyDocument);
    counts[m] += 1;
  }
  return counts;
}
