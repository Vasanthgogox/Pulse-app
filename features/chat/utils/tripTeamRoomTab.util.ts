import type { ConversationPartyType } from "../types/chat.types";

/** Detail tab id for the unified platform trip room (not a legacy party lane). */
export const TRIP_DETAIL_TEAM_TAB_ID = "team" as const;

export type TripDetailTabId = ConversationPartyType | typeof TRIP_DETAIL_TEAM_TAB_ID;

/** Team room tab only when 2+ party lanes — solo-lane trips stay party-only. */
export function isTripTeamRoomTabEligible(
  visiblePartyTypes: ConversationPartyType[],
): boolean {
  return visiblePartyTypes.length >= 2;
}

export function isTripDetailTeamTab(tabId: string): tabId is typeof TRIP_DETAIL_TEAM_TAB_ID {
  return tabId === TRIP_DETAIL_TEAM_TAB_ID;
}
