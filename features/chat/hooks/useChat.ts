/**
 * useChat — standalone single-conversation hook (WhatsApp-style).
 *
 * Design principles:
 *  1. STRICT CLEANUP   — unsubscribes the channel on every unmount, no exceptions.
 *  2. SHARED CHANNEL   — reuses the per-org WebSocket via realtimeRegistry so 10
 *                        open conversations cost 1 DB-side subscription, not 10.
 *  3. BATCH UPDATES    — 100ms flush window collapses message bursts into one
 *                        setState pass (WhatsApp/Telegram pattern).
 *  4. OPTIMISTIC SEND  — message appears instantly; rolled back on server error.
 *  5. DEBOUNCED READ   — markAsRead waits 2s before hitting DB, coalescing
 *                        rapid tab-in/tab-out events into a single UPDATE.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { subscribeSharedPostgresChanges } from "@/lib/realtimeRegistry";
import * as chatService from "../services/chat.service";
import type { MessageSenderRole, MessageType, TripMessageRow } from "../types/chat.types";

// ── Public API ────────────────────────────────────────────────────────────────

export interface UseChatOptions {
  conversationId: string | null;
  organizationId: string | null;
  selfUid: string | null;
  senderRole: MessageSenderRole;
  senderName: string;
  /** How many messages to fetch on mount (default 20, windowed history). */
  initialLimit?: number;
}

export interface UseChatReturn {
  messages: TripMessageRow[];
  isLoading: boolean;
  isSending: boolean;
  sendMessage: (content: string, messageType?: MessageType) => Promise<void>;
  loadMore: () => Promise<void>;
  hasMore: boolean;
  markAsRead: () => void;
}

// ── Implementation ────────────────────────────────────────────────────────────

export function useChat({
  conversationId,
  organizationId,
  selfUid,
  senderRole,
  senderName,
  initialLimit = 20,
}: UseChatOptions): UseChatReturn {
  const [messages, setMessages] = useState<TripMessageRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  // ── Batch queue ───────────────────────────────────────────────────────────────
  // Incoming realtime rows are pushed here and flushed once per 100ms window.
  // This prevents 20 rapid INSERTs from scheduling 20 separate React renders.
  const queueRef = useRef<Partial<TripMessageRow>[]>([]);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleFlush = useCallback(() => {
    if (flushTimerRef.current) return; // already scheduled for this window
    flushTimerRef.current = setTimeout(() => {
      flushTimerRef.current = null;
      const incoming = queueRef.current.splice(0);
      if (incoming.length === 0) return;
      setMessages((prev) => [...prev, ...(incoming as TripMessageRow[])]);
    }, 100);
  }, []);

  // ── Initial load ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!conversationId) {
      setMessages([]);
      setHasMore(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    chatService
      .getMessagesByConversation(conversationId, { limit: initialLimit })
      .then((rows) => {
        if (cancelled) return;
        setMessages(rows);
        setHasMore(rows.length === initialLimit);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => { cancelled = true; };
  }, [conversationId, initialLimit]);

  // ── Realtime subscription — filtered channel per thread (narrow WAL fanout) ───
  //
  // Subscription key is per conversation so specs stay stable and the registry
  // does not collide with the org-wide hub channel (`trip_messages:org:…`).
  //
  // Cleanup: the returned `unsub` decrements the ref count. When refs → 0, the
  // registry schedules channel teardown after TEARDOWN_GRACE_MS (5 s), preventing
  // churn on quick tab switches while still closing stale channels promptly.
  useEffect(() => {
    if (!conversationId || !organizationId || !selfUid) return;

    const filter = `conversation_id=eq.${conversationId}`;
    const unsub = subscribeSharedPostgresChanges(
      `trip_messages:conv:${organizationId}:${conversationId}`,
      [
        {
          event: "INSERT",
          schema: "public",
          table: "trip_messages",
          filter,
        },
        {
          event: "UPDATE",
          schema: "public",
          table: "trip_messages",
          filter,
        },
      ],
      (payload) => {
        if (payload.eventType === "INSERT") {
          const row = payload.new as Partial<TripMessageRow> | null;
          if (!row?.conversation_id) return;
          if (row.conversation_id !== conversationId) return;
          if (row.sender_user_id && row.sender_user_id === selfUid) return;
          queueRef.current.push(row);
          scheduleFlush();
          return;
        }
        if (payload.eventType === "UPDATE") {
          const row = payload.new as Partial<TripMessageRow> | null;
          if (!row?.id || row.conversation_id !== conversationId) return;
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== row.id) return m;
              return {
                ...m,
                is_delivered: row.is_delivered ?? m.is_delivered,
                delivered_at: row.delivered_at ?? m.delivered_at,
                is_read: row.is_read ?? m.is_read,
                read_at: row.read_at ?? m.read_at,
                metadata: row.metadata != null ? row.metadata : m.metadata,
              };
            }),
          );
        }
      },
    );

    // STRICT CLEANUP: always runs, even if the component crashes.
    return () => {
      // 1. Decrement registry ref-count (triggers 5s grace teardown if last listener).
      unsub();
      // 2. Cancel any pending flush timer to prevent setState after unmount.
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      // 3. Drop queued messages — stale data, next mount will re-fetch.
      queueRef.current = [];
    };
  }, [conversationId, organizationId, selfUid, scheduleFlush]);

  // ── Debounced markAsRead ──────────────────────────────────────────────────────
  // Coalesces rapid open/close events (e.g. user previewing multiple threads)
  // into one UPDATE + one realtime broadcast instead of N.
  const markReadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const markAsRead = useCallback(() => {
    if (!conversationId) return;
    if (markReadTimerRef.current) clearTimeout(markReadTimerRef.current);
    markReadTimerRef.current = setTimeout(() => {
      markReadTimerRef.current = null;
      void chatService.markConversationRead(conversationId).catch(() => {});
    }, 2000);
  }, [conversationId]);

  useEffect(() => () => {
    if (markReadTimerRef.current) clearTimeout(markReadTimerRef.current);
  }, []);

  // ── Optimistic send ───────────────────────────────────────────────────────────
  const sendMessage = useCallback(
    async (content: string, messageType: MessageType = "text") => {
      if (!conversationId || !organizationId || !selfUid) return;
      setIsSending(true);

      const optimistic: TripMessageRow = {
        id: `optimistic-${Date.now()}`,
        conversation_id: conversationId,
        organization_id: organizationId,
        sender_user_id: selfUid,
        sender_role: senderRole,
        sender_name: senderName,
        content,
        message_type: messageType,
        is_read: true,
        read_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, optimistic]);

      try {
        const persisted = await chatService.sendChatMessage({
          conversationId,
          organizationId,
          content,
          senderRole,
          senderName,
          senderUserId: selfUid,
          messageType,
        });
        setMessages((prev) =>
          prev.map((m) => (m.id === optimistic.id ? persisted : m)),
        );
      } catch {
        // Roll back optimistic insert on failure.
        setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      } finally {
        setIsSending(false);
      }
    },
    [conversationId, organizationId, selfUid, senderRole, senderName],
  );

  // ── Pagination ────────────────────────────────────────────────────────────────
  const loadMore = useCallback(async () => {
    if (!conversationId || messages.length === 0) return;
    const oldest = messages[0].created_at;
    try {
      const older = await chatService.getMessagesByConversation(conversationId, {
        before: oldest,
        limit: initialLimit,
        partyType: null,
      });
      setMessages((prev) => [...older, ...prev]);
      setHasMore(older.length === initialLimit);
    } catch {
      // non-critical
    }
  }, [conversationId, messages, initialLimit]);

  return { messages, isLoading, isSending, sendMessage, loadMore, hasMore, markAsRead };
}
