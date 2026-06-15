/**
 * Conversation-scoped realtime for one open unified chat thread.
 *
 * Bootstrap model (aligns with driver chat and global TQ config):
 *   1. Bootstrap: getChatMessages RPC fetches the newest page once (staleTime: 60s).
 *   2. Patch: subscribeSharedPostgresChanges upserts each INSERT/UPDATE into the cache.
 *   3. Any Realtime events that arrive before the bootstrap cache is populated are
 *      buffered in a local ref and drained as soon as the query resolves.
 *
 * Only the device with the thread open receives message payloads; everyone else's
 * inbox updates via the cheap `chat_conversations` row stream (useChatInboxQuery).
 */
import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/lib/queryKeys";
import { subscribeSharedPostgresChanges } from "@/lib/realtimeRegistry";

import { getChatMessages } from "../services/chatPlatform.service";
import type { ChatPlatformMessageRow } from "../types/chatPlatform.types";

function upsertMessage(
  old: ChatPlatformMessageRow[] | undefined,
  row: ChatPlatformMessageRow,
): ChatPlatformMessageRow[] {
  if (!Array.isArray(old)) {
    // Cache not yet populated (bootstrap in flight) — seed with this event.
    // The bootstrap result will merge via the drain effect below.
    return [row];
  }
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
  return [row, ...old];
}

/**
 * Loads the newest message page and keeps it live while the thread is open.
 * Pass `null` to park the hook (no subscription, no query).
 */
export function useChatThreadRealtime(conversationId: string | null) {
  const qc = useQueryClient();
  // Buffer Realtime events that fire before the bootstrap cache exists.
  const pendingRef = useRef<ChatPlatformMessageRow[]>([]);

  const query = useQuery({
    queryKey: queryKeys.chatPlatform.messages(conversationId ?? "_"),
    queryFn: () => getChatMessages(conversationId!),
    enabled: !!conversationId,
    staleTime: 60_000,
    gcTime: 30 * 60_000,
    networkMode: "offlineFirst",
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  });

  // Drain buffered events once the bootstrap cache is available.
  useEffect(() => {
    if (!conversationId || !query.isSuccess || !pendingRef.current.length) return;
    const pending = pendingRef.current.splice(0);
    for (const row of pending) {
      qc.setQueryData<ChatPlatformMessageRow[]>(
        queryKeys.chatPlatform.messages(conversationId),
        (old) => upsertMessage(old, row),
      );
    }
  }, [conversationId, query.isSuccess, qc]);

  useEffect(() => {
    if (!conversationId) {
      pendingRef.current = [];
      return;
    }
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
        const current = qc.getQueryData<ChatPlatformMessageRow[]>(
          queryKeys.chatPlatform.messages(conversationId),
        );
        if (!Array.isArray(current)) {
          // Bootstrap in flight — buffer for drain.
          pendingRef.current.push(row);
          return;
        }
        qc.setQueryData<ChatPlatformMessageRow[]>(
          queryKeys.chatPlatform.messages(conversationId),
          (old) => upsertMessage(old, row),
        );
      },
    );
  }, [conversationId, qc]);

  return query;
}
