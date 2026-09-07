/**
 * Team room message hygiene — mission debrief stays on client/supplier party lanes.
 */
import type { ChatPlatformMessageRow } from "../types/chatPlatform.types";
import { dedupeTripRoomActionCards } from "./dedupeTripRoomActionCards.util";
import { isMissionDebriefMessage } from "./missionDebrief.util";

export function isTripRoomFeedbackMirror(msg: ChatPlatformMessageRow): boolean {
  return isMissionDebriefMessage(msg);
}

/** Filter lane-only debrief mirrors, then collapse cross-lane operational duplicates. */
export function sanitizeTripRoomMessages(
  messages: ChatPlatformMessageRow[],
): ChatPlatformMessageRow[] {
  const withoutFeedback = messages.filter((m) => !isTripRoomFeedbackMirror(m));
  return dedupeTripRoomActionCards(withoutFeedback);
}
