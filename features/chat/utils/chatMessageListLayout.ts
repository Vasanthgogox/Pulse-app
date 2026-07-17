import type { ConversationPartyType, TripMessageRow } from "../types/chat.types";
import { isMessageVisibleInTab } from "../types/chat.types";

/**
 * Stable row height estimates for FlatList.getItemLayout (avoids layout thrash
 * when images resolve). Values are conservative upper bounds vs. actual UI.
 *
 * IMPORTANT: only call with the same array the FlatList `data` prop uses.
 * Building layout from `displayMessages` while rendering date/unread dividers
 * mis-indexes rows and hides the newest bubbles on desktop web.
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
    case "ledger_update":
      return 200;
    case "feedback_request":
    case "feedback":
      return 380;
    case "system":
    case "update":
    case "system_log":
    case "assignment_update":
      return 128;
    case "location_log":
      return 248;
    case "status_change":
      return 128;
    case "image":
      return 104;
    case "tracking":
      return 248;
    default:
      return Math.min(240, 76 + Math.ceil((m.content?.length ?? 0) / 34) * 18);
  }
}

export function estimateThreadListItemHeight(
  item:
    | TripMessageRow
    | { __dateDivider: true; dateStr: string; id: string }
    | { __unreadDivider: true; id: string },
  partyType: ConversationPartyType,
): number {
  if ("__dateDivider" in item) return 44;
  if ("__unreadDivider" in item) return 36;
  return estimateTripMessageRowHeight(item, partyType);
}

export function buildTripMessageListLayoutMeta(
  messages: TripMessageRow[],
  partyType: ConversationPartyType,
): {
  lengths: number[];
  offsets: number[];
  getItemLayout: (index: number) => { length: number; offset: number; index: number };
} {
  return buildThreadListLayoutMeta(messages, partyType);
}

export function buildThreadListLayoutMeta(
  items: ReadonlyArray<
    | TripMessageRow
    | { __dateDivider: true; dateStr: string; id: string }
    | { __unreadDivider: true; id: string }
  >,
  partyType: ConversationPartyType,
): {
  lengths: number[];
  offsets: number[];
  getItemLayout: (index: number) => { length: number; offset: number; index: number };
} {
  const lengths = items.map((item) => estimateThreadListItemHeight(item, partyType));
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
      offset:
        offsets[index] ??
        (offsets.length
          ? offsets[offsets.length - 1]! + (lengths[lengths.length - 1] ?? 80)
          : 0),
      index,
    }),
  };
}
