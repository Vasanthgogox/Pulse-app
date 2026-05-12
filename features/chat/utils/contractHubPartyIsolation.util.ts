import type { ConversationPartyType, TripConversationRow } from "../types/chat.types";

type LaneOrgRow = Pick<TripConversationRow, "party_type" | "organization_id">;

/**
 * Contractual "give / get" hub & mission bar isolation (integrated trips).
 *
 * - Viewer org matches the **client** lane row → show only counterparty commercial
 *   lanes (supplier + driver), never an extra client icon for the same contract party.
 * - Viewer org matches the **supplier** lane row → show only client + driver.
 *
 * Fleet / dispatcher hosts that are neither lane org keep the full candidate set.
 * Linked sub-client / sub-supplier tabs are handled separately via linked-* suppress flags.
 */
export function applyContractualHubPartyIsolation(
  candidates: ConversationPartyType[],
  args: {
    viewerOrgId: string;
    /** Hub card rows or detail `sameTripConversations` for this trip */
    lanes: LaneOrgRow[];
    tripIntegrated: boolean;
  },
): ConversationPartyType[] {
  if (!args.tripIntegrated || !args.viewerOrgId.trim()) return candidates;
  const v = args.viewerOrgId.trim();
  const clientLane = args.lanes.find((r) => r.party_type === "client");
  const supplierLane = args.lanes.find((r) => r.party_type === "supplier");
  const clientOrg = String(clientLane?.organization_id ?? "").trim();
  const supplierOrg = String(supplierLane?.organization_id ?? "").trim();
  if (clientOrg && v === clientOrg) {
    return candidates.filter((p) => p !== "client");
  }
  if (supplierOrg && v === supplierOrg) {
    return candidates.filter((p) => p !== "supplier");
  }
  return candidates;
}
