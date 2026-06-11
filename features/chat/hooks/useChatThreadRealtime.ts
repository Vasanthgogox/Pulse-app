/**
 * Conversation-scoped realtime for one open unified chat thread.
 *
 * Subscribes to `chat_messages` rows for a SINGLE conversation
 * (`conversation_id=eq.<id>`) — the Phase 1 replacement for org-wide message
 * fan-out. Only the device with the thread open receives message payloads;
 * everyone else's inbox updates via the cheap `chat_conversations` row stream
 * (see `useChatInboxQuery`).
 *
 * Message pages live in the TanStack cache under
 * `queryKeys.chatPlatform.messages(conversationId)` newest-first, matching
 * `getChatMessages`.
 */
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/lib/queryKeys";
import { subscribeSharedPostgresChanges } from "@/lib/realtimeRegistry";

import { getChatMessages } from "../services/chatPlatform.service";
import type { ChatPlatformMessageRow } from "../types/chatPlatform.types";

function upsertMessage(
  old: ChatPlatformMessageRow[] | undefined,
  row: ChatPlatformMessageRow,
): ChatPlatformMessageRow[] | undefined {
  if (!Array.isArray(old)) return old;
  // Replace in place on edit/delete/echo (same id, or optimistic row matched
  // by client_message_id after an offline replay).
  const idx = old.findIndex(
    (m) =>
      m.id === row.id ||
      (row.client_message_id != null &&
        m.client_message_id === row.client_message_id),
  );
  if (idx >= 0) {
    const next = old.slice();
    next[idx] = { ...next[idx], ...row };
    return next;
  }
  // Newest-first prepend.
  return [row, ...old];
}

/**
 * Loads the newest message page and keeps it live while the thread is open.
 * Pass `null` to park the hook (no subscription, no query).
 */
export function useChatThreadRealtime(conversationId: string | null) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.chatPlatform.messages(conversationId ?? "_"),
    queryFn: () => getChatMessages(conversationId!),
    enabled: !!conversationId,
  });

  useEffect(() => {
    if (!conversationId) return;
    return subscribeSharedPostgresChanges(
      `chat_messages:conv:${conversationId}`,
      [
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        {
          event: "UPDATE",
          schema: "public",
          table: "chat_messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
      ],
      (payload) => {
        const row = payload.new as ChatPlatformMessageRow | null;
        if (!row?.id) return;
        qc.setQueryData<ChatPlatformMessageRow[]>(
          queryKeys.chatPlatform.messages(conversationId),
          (old) => upsertMessage(old, row),
        );
      },
    );
  }, [conversationId, qc]);

  return query;
}
