import type { Router } from "expo-router";

import { ROUTES } from "@/lib/routes";
import type { GlobalOperationAlert } from "@/lib/globalSync/priorityEngine.util";

/** Route ops alerts to the most relevant screen — no extra DB reads. */
export function navigateToOpsAlert(router: Router, ops: GlobalOperationAlert): void {
  const tripId = ops.trip_id?.trim() || null;

  if (ops.category === "unassigned_trip" && tripId) {
    router.push(`/trip/${tripId}/assignment` as const);
    return;
  }

  if (ops.category === "payment_received" || ops.category === "dispute") {
    if (tripId) {
      router.push(`/trip-ledger/${tripId}` as const);
      return;
    }
    router.push(ROUTES.TABS.FINANCE as Parameters<typeof router.push>[0]);
    return;
  }

  if (tripId) {
    router.push(`/trip-ledger/${tripId}` as const);
    return;
  }

  router.push(ROUTES.TABS.TRIPS as Parameters<typeof router.push>[0]);
}
