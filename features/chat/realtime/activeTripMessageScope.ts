/**
 * Single open trip thread for hub vs thread Realtime routing.
 * `TripChatProvider` passes `hubListOnly` into `processIncomingEvent` when this id
 * differs from the incoming `conversation_id` (see `ChatScreen` scope effect).
 */

let activeConversationId: string | null = null;

export function setActiveTripMessageConversationId(id: string | null): void {
  const next = id && id.trim() ? id.trim() : null;
  if (next === activeConversationId) return;
  activeConversationId = next;
}

export function getActiveTripMessageConversationId(): string | null {
  return activeConversationId;
}
