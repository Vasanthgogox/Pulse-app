/**
 * Team room message hygiene — mission debrief stays on client/supplier party lanes.
 */
import type { ChatPlatformMessageRow } from "../types/chatPlatform.types";
import { dedupeTripRoomActionCards } from "./dedupeTripRoomActionCards.util";

const MISSION_DEBRIEF_SNIPPET = "rate this partner to close the mission debrief";

export function isTripRoomFeedbackMirror(msg: ChatPlatformMessageRow): boolean {
  if (msg.message_type === "feedback_request" || msg.message_type === "feedback") {
    return true;
  }
  const meta = (msg.metadata ?? {}) as Record<string, unknown>;
  const eventType = String(meta.event_type ?? "")
    .trim()
    .toLowerCase();
  if (eventType === "feedback_request" || eventType === "feedback") {
    return true;
  }
  const body =
    (typeof meta.body === "string" ? meta.body : "") ||
    (typeof msg.content === "string" ? msg.content : "");
  return body.toLowerCase().includes(MISSION_DEBRIEF_SNIPPET);
}

/** Filter lane-only debrief mirrors, then collapse cross-lane operational duplicates. */
export function sanitizeTripRoomMessages(
  messages: ChatPlatformMessageRow[],
): ChatPlatformMessageRow[] {
  const withoutFeedback = messages.filter((m) => !isTripRoomFeedbackMirror(m));
  return dedupeTripRoomActionCards(withoutFeedback);
}
