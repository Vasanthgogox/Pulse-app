/**
 * Pulse Chat Platform — unified inbox query (Phase 1 realtime fix).
 *
 * Realtime model: ONE shared `chat_conversations` row subscription per org.
 * Conversation rows are denormalized by DB trigger (last_message_at, preview,
 * message_count), so the inbox updates from tiny row payloads instead of the
 * legacy org-wide `trip_messages` stream — every message body in the org no
 * longer fans out to every connected client just to refresh a list.
 *
 * Cache strategy: UPDATE patches the cached inbox in place and re-sorts;
 * INSERT (new conversation) invalidates to pull the full row with unread
 * state from `get_chat_inbox`.
 */
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { getChatInbox } from "@/features/chat/services/chatPlatform.service";
import type { ChatInboxItem } from "@/features/chat/types/chatPlatform.types";
import { queryKeys } from "@/lib/queryKeys";
import { subscribeSharedPostgresChanges } from "@/lib/realtimeRegistry";

const INBOX_PAGE_SIZE = 50;

function patchInboxRow(
  old: ChatInboxItem[] | undefined,
  row: Record<string, unknown>,
): ChatInboxItem[] | undefined {
  if (!Array.isArray(old)) return old;
  const id = typeof row.id === "string" ? row.id : null;
  if (!id) return old;

  let found = false;
  const next = old.map((item) => {
    if (item.id !== id) return item;
    found = true;
    // Realtime rows lack unread_count / my_last_read_at — preserve them, but
    // bump unread when a new inbound message advanced the row.
    const lastMessageAt =
      typeof row.last_message_at === "string" ? row.last_message_at : item.last_message_at;
    const messageCount =
      typeof row.message_count === "number" ? row.message_count : item.message_count;
    const grewByMessages = messageCount > item.message_count;
    return {
      ...item,
      title: (row.title as string | null) ?? item.title,
      is_archived:
        typeof row.is_archived === "boolean" ? row.is_archived : item.is_archived,
      last_message_at: lastMessageAt,
      last_message_preview:
        typeof row.last_message_preview === "string"
          ? row.last_message_preview
          : item.last_message_preview,
      message_count: messageCount,
      metadata: (row.metadata as Record<string, unknown>) ?? item.metadata,
      unread_count: grewByMessages
        ? item.unread_count + (messageCount - item.message_count)
        : item.unread_count,
    };
  });
  if (!found) return old;

  next.sort((a, b) => {
    const ta = a.last_message_at ?? a.created_at;
    const tb = b.last_message_at ?? b.created_at;
    return tb.localeCompare(ta);
  });
  return next;
}

export function useChatInboxQuery(organizationId: string | null) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.chatPlatform.inbox(organizationId ?? "_"),
    queryFn: () => getChatInbox(organizationId!, { limit: INBOX_PAGE_SIZE }),
    enabled: !!organizationId,
  });

  useEffect(() => {
    if (!organizationId) return;
    return subscribeSharedPostgresChanges(
      `chat_conversations:org:${organizationId}`,
      [
        {
          event: "INSERT",
          schema: "public",
          table: "chat_conversations",
          filter: `organization_id=eq.${organizationId}`,
        },
        {
          event: "UPDATE",
          schema: "public",
          table: "chat_conversations",
          filter: `organization_id=eq.${organizationId}`,
        },
      ],
      (payload) => {
        const inboxKey = queryKeys.chatPlatform.inbox(organizationId);
        if (payload.eventType === "UPDATE" && payload.new) {
          qc.setQueryData<ChatInboxItem[]>(inboxKey, (old) =>
            patchInboxRow(old, payload.new as Record<string, unknown>),
          );
          // Row not in cache (beyond first page or fresh login) → refetch.
          const cached = qc.getQueryData<ChatInboxItem[]>(inboxKey);
          const rowId = (payload.new as { id?: string }).id;
          if (rowId && cached && !cached.some((c) => c.id === rowId)) {
            void qc.invalidateQueries({ queryKey: inboxKey });
          }
        } else if (payload.eventType === "INSERT") {
          void qc.invalidateQueries({ queryKey: inboxKey });
        }
      },
    );
  }, [organizationId, qc]);

  return query;
}
