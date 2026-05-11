import type { TripEntry } from "@/features/chat/store/useChatStore";

/** True when this org may submit debrief and a lane still shows pending (bootstrap flag). */
export function tripHasPendingOrgFeedback(
  trips: Record<string, TripEntry>,
  tripId: string,
  orgId: string | null | undefined,
): boolean {
  if (!orgId || !tripId) return false;
  const entry = trips[tripId];
  if (!entry) return false;
  const ownerOrg = entry.tripOrganizationId?.trim() ?? "";
  const isTripOwnerViewer = ownerOrg !== "" && ownerOrg === orgId;
  for (const p of Object.values(entry.parties)) {
    if (!p) continue;
    if (p.feedbackStatus !== "pending") continue;
    if (isTripOwnerViewer) return true;
    if (p.organizationId === orgId) return true;
  }
  return false;
}
