import type { Router } from "expo-router";

import { ROUTES } from "@/lib/routes";
import type { GlobalOperationAlert } from "@/lib/globalSync/priorityEngine.util";

/**
 * Route ops alerts straight to the relevant detail page — no extra DB reads.
 * Trip-linked alerts hook directly into the trip detail page (never the
 * intermediate trip-ledger view).
 */
export function navigateToOpsAlert(router: Router, ops: GlobalOperationAlert): void {
  const tripId = ops.trip_id?.trim() || null;

  if (ops.category === "unassigned_trip" && tripId) {
    router.push(`/trip/${tripId}/assignment` as const);
    return;
  }

  // Any trip-linked alert opens the actionable trip detail page directly.
  if (tripId) {
    router.push(`/trip/${tripId}` as const);
    return;
  }

  if (ops.category === "payment_received") {
    router.push(ROUTES.TABS.FINANCE as Parameters<typeof router.push>[0]);
    return;
  }

  router.push(ROUTES.TABS.TRIPS as Parameters<typeof router.push>[0]);
}
