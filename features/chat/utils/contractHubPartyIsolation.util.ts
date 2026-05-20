import type { ConversationPartyType, TripConversationRow } from "../types/chat.types";

type LaneOrgRow = Pick<TripConversationRow, "party_type" | "organization_id">;

/**
 * Contractual "give / get" hub & mission bar isolation (integrated trips).
 *
 * Tab visibility rules per viewer role:
 *
 * | Viewer              | Visible tabs              |
 * |---------------------|---------------------------|
 * | Trip owner          | client? + supplier + driver (client shown only when linked org exists) |
 * | Linked supplier org | supplier (relabeled CLIENT) + driver — client lane hidden |
 * | Linked client org   | supplier + driver — own client lane hidden |
 *
 * The supplier viewer case (hide client tab) is handled here so it applies to both
 * the hub card and the detail mission bar via a single call-site.
 * The `supplier → CLIENT` relabel lives in ChatScreen (`linkedSupplierSuppressSupplierTab`).
 */
export function applyContractualHubPartyIsolation(
  candidates: ConversationPartyType[],
  args: {
    viewerOrgId: string;
    /** Hub card rows or detail `sameTripConversations` for this trip */
    lanes: LaneOrgRow[];
    tripIntegrated: boolean;
    /** Pass true when the viewer is the linked supplier org. */
    viewerIsLinkedSupplier?: boolean;
  },
): ConversationPartyType[] {
  if (!args.tripIntegrated || !args.viewerOrgId.trim()) return candidates;
  const v = args.viewerOrgId.trim();

  // Linked supplier: hide the trip-owner's end-client tab — they only chat with the
  // trip owner (via the supplier lane, relabeled CLIENT) and the driver.
  if (args.viewerIsLinkedSupplier) {
    return candidates.filter((p) => p !== "client");
  }

  // Linked client (trip-owner's org matches client lane org): hide their own lane.
  const clientLane = args.lanes.find((r) => r.party_type === "client");
  const clientOrg = String(clientLane?.organization_id ?? "").trim();
  if (clientOrg && v === clientOrg) {
    return candidates.filter((p) => p !== "client");
  }

  return candidates;
}
