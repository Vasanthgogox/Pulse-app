import type { TripEntry } from "@/features/chat/store/useChatStore";

/** True when this org owns a party lane on the trip that still needs a debrief (bootstrap lane flag). */
export function tripHasPendingOrgFeedback(
  trips: Record<string, TripEntry>,
  tripId: string,
  orgId: string | null | undefined,
): boolean {
  if (!orgId || !tripId) return false;
  const entry = trips[tripId];
  if (!entry) return false;
  for (const p of Object.values(entry.parties)) {
    if (!p) continue;
    if (p.organizationId !== orgId) continue;
    if (p.feedbackStatus === "pending") return true;
  }
  return false;
}
