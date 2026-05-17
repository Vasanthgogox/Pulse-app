import type { ConversationPartyType, TripMessageRow } from "../types/chat.types";
import { isMessageVisibleInTab } from "../types/chat.types";

/**
 * Stable row height estimates for FlatList.getItemLayout (avoids layout thrash
 * when images resolve). Values are conservative upper bounds vs. actual UI.
 */
export function estimateTripMessageRowHeight(
  m: TripMessageRow,
  partyType: ConversationPartyType,
): number {
  if (!isMessageVisibleInTab(m.message_type, partyType)) return 1;

  switch (m.message_type) {
    case "document_share":
      return 320;
    case "ledger_event":
    case "ledger":
    case "payment":
      return 176;
    case "feedback_request":
    case "feedback":
      return 380;
    case "system":
    case "update":
    case "system_log":
      return 88;
    case "location_log":
      return 200;
    case "status_change":
    case "image":
      return 104;
    case "tracking":
      return 200;
    default:
      return Math.min(240, 76 + Math.ceil((m.content?.length ?? 0) / 34) * 18);
  }
}

export function buildTripMessageListLayoutMeta(
  messages: TripMessageRow[],
  partyType: ConversationPartyType,
): {
  lengths: number[];
  offsets: number[];
  getItemLayout: (index: number) => { length: number; offset: number; index: number };
} {
  const lengths = messages.map((m) => estimateTripMessageRowHeight(m, partyType));
  const offsets: number[] = [];
  let acc = 0;
  for (let i = 0; i < lengths.length; i++) {
    offsets.push(acc);
    acc += lengths[i];
  }
  return {
    lengths,
    offsets,
    getItemLayout: (index: number) => ({
      length: lengths[index] ?? 80,
      offset: offsets[index] ?? 0,
      index,
    }),
  };
}
