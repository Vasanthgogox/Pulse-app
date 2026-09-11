/** Local copies of POD/completion predicates — no service/supabase import. */

export function financeProTripPodReceived(trip: {
  pod_received_at?: string | null;
  pod_status?: unknown;
}): boolean {
  if (trip.pod_received_at) return true;
  return String(trip.pod_status ?? "").toLowerCase() === "received";
}

export function financeProTripCompleted(trip: {
  status?: string | null;
  completed_at?: string | null;
}): boolean {
  if (trip.completed_at) return true;
  const s = String(trip.status ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  return s === "completed" || s === "delivered" || s === "done";
}
