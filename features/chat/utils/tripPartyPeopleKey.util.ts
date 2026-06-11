import type { TripConversation } from "@/features/chat/types/chat.types";

function normalizePartyLabelKey(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** Stable people-strip / recommendation key for a trip conversation party. */
export function tripPartyPeopleKey(
  conv: Pick<
    TripConversation,
    "party_type" | "party_name" | "client_id" | "supplier_id" | "driver_id"
  >,
): string {
  const clientId = (conv.client_id ?? "").trim();
  if (conv.party_type === "client" && clientId) return `client:${clientId}`;

  const supplierId = (conv.supplier_id ?? "").trim();
  if (conv.party_type === "supplier" && supplierId) return `supplier:${supplierId}`;

  const driverId = (conv.driver_id ?? "").trim();
  if (conv.party_type === "driver" && driverId) return `driver:${driverId}`;

  const name = normalizePartyLabelKey(conv.party_name);
  return `${conv.party_type}:${name || "unknown"}`;
}

export function conversationMatchesPartyPeopleKey(
  conv: Pick<
    TripConversation,
    "party_type" | "party_name" | "client_id" | "supplier_id" | "driver_id"
  >,
  partyKey: string | null | undefined,
): boolean {
  const key = (partyKey ?? "").trim();
  if (!key) return false;
  return tripPartyPeopleKey(conv) === key;
}

const tripConversationActivitySort = (
  a: TripConversation,
  b: TripConversation,
  tripStatus: (conv: TripConversation) => string | null | undefined,
  isTerminal: (status: string | null | undefined) => boolean,
): number => {
  const aTerminal = isTerminal(tripStatus(a)) ? 1 : 0;
  const bTerminal = isTerminal(tripStatus(b)) ? 1 : 0;
  if (aTerminal !== bTerminal) return aTerminal - bTerminal;

  const aUnread = (a.unread_dispatcher_count ?? 0) > 0 ? 0 : 1;
  const bUnread = (b.unread_dispatcher_count ?? 0) > 0 ? 0 : 1;
  if (aUnread !== bUnread) return aUnread - bUnread;

  return (
    new Date(b.last_message_at ?? 0).getTime() -
    new Date(a.last_message_at ?? 0).getTime()
  );
};

export function pickRecommendedTripConversation(
  conversations: TripConversation[],
): TripConversation | null {
  if (conversations.length === 0) return null;
  return [...conversations].sort((a, b) => {
    const aUnread = (a.unread_dispatcher_count ?? 0) > 0 ? 0 : 1;
    const bUnread = (b.unread_dispatcher_count ?? 0) > 0 ? 0 : 1;
    if (aUnread !== bUnread) return aUnread - bUnread;
    return (
      new Date(b.last_message_at ?? 0).getTime() -
      new Date(a.last_message_at ?? 0).getTime()
    );
  })[0]!;
}

export function partitionTripConversationsByPartyFocus(
  conversations: TripConversation[],
  partyKey: string | null | undefined,
  options: {
    tripStatus: (conv: TripConversation) => string | null | undefined;
    isTerminal: (status: string | null | undefined) => boolean;
  },
): { recommended: TripConversation[]; rest: TripConversation[] } {
  const compare = (a: TripConversation, b: TripConversation) =>
    tripConversationActivitySort(a, b, options.tripStatus, options.isTerminal);

  const key = (partyKey ?? "").trim();
  if (!key) {
    return { recommended: [], rest: [...conversations].sort(compare) };
  }

  const recommended: TripConversation[] = [];
  const rest: TripConversation[] = [];
  for (const conv of conversations) {
    if (tripPartyPeopleKey(conv) === key) recommended.push(conv);
    else rest.push(conv);
  }
  recommended.sort(compare);
  rest.sort(compare);
  return { recommended, rest };
}

export type MobileTripInboxRow =
  | {
      kind: "party_recommended_header";
      id: string;
      partyName: string;
      count: number;
    }
  | { kind: "party_recommended_divider"; id: string }
  | { kind: "conversation"; id: string; conversation: TripConversation };

export function buildMobileTripInboxRows(
  conversations: TripConversation[],
  partyKey: string | null | undefined,
  partyDisplayName: string | null | undefined,
  options: {
    tripStatus: (conv: TripConversation) => string | null | undefined;
    isTerminal: (status: string | null | undefined) => boolean;
  },
): MobileTripInboxRow[] {
  const { recommended, rest } = partitionTripConversationsByPartyFocus(
    conversations,
    partyKey,
    options,
  );

  if (recommended.length === 0) {
    return rest.map((conversation) => ({
      kind: "conversation" as const,
      id: conversation.id,
      conversation,
    }));
  }

  const rows: MobileTripInboxRow[] = [
    {
      kind: "party_recommended_header",
      id: `party-header:${partyKey}`,
      partyName: (partyDisplayName ?? "").trim() || "Party",
      count: recommended.length,
    },
    ...recommended.map((conversation) => ({
      kind: "conversation" as const,
      id: conversation.id,
      conversation,
    })),
  ];

  if (rest.length > 0) {
    rows.push({ kind: "party_recommended_divider", id: `party-divider:${partyKey}` });
    rows.push(
      ...rest.map((conversation) => ({
        kind: "conversation" as const,
        id: conversation.id,
        conversation,
      })),
    );
  }

  return rows;
}
