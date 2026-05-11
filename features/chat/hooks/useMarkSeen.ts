/**
 * useMarkSeen — per-message seen tracking via FlatList viewability.
 *
 * Wires FlatList's onViewableItemsChanged to the mark_messages_seen RPC
 * with a 1500ms debounce per conversation. The debounce coalesces rapid
 * scroll events into a single DB write — the same interval used for
 * markAsRead in TripChatContext.
 *
 * Usage:
 *
 *   const { onViewableItemsChanged, viewabilityConfig } = useMarkSeen({
 *     conversationId,
 *     selfUid,
 *     onLocalMarkRead: (ids) => chatStore.patchMessage(conversationId, id, { is_read: true }),
 *   });
 *
 *   <FlatList
 *     data={messages}
 *     onViewableItemsChanged={onViewableItemsChanged}
 *     viewabilityConfig={viewabilityConfig}
 *   />
 */
import { useCallback, useRef } from 'react';
import type { ViewToken } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useChatStore } from '../store/useChatStore';
import type { TripMessageRow } from '../types/chat.types';

interface UseMarkSeenOptions {
  conversationId: string | null;
  selfUid: string | null;
}

interface UseMarkSeenResult {
  onViewableItemsChanged: (info: { viewableItems: ViewToken[] }) => void;
  viewabilityConfig: { itemVisiblePercentThreshold: number };
}

/**
 * A message is "seen" when ≥50% of its area is visible on screen.
 * Only marks non-own, unread messages as seen.
 */
const VIEWABILITY_CONFIG = { itemVisiblePercentThreshold: 50 };

export function useMarkSeen({
  conversationId,
  selfUid,
}: UseMarkSeenOptions): UseMarkSeenResult {
  // Accumulate message IDs visible since last flush.
  const pendingSeenIds = useRef<Set<string>>(new Set());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(() => {
    if (!conversationId || pendingSeenIds.current.size === 0) return;
    const ids = Array.from(pendingSeenIds.current);
    pendingSeenIds.current.clear();

    // Optimistic: update local store so the read indicators flip instantly.
    const s = useChatStore.getState();
    for (const id of ids) {
      s.patchMessage(conversationId, id, {
        is_read: true,
        read_at: new Date().toISOString(),
      });
    }

    // DB write: single RPC call regardless of how many messages were seen.
    void supabase()
      .rpc('mark_messages_seen', {
        p_conversation_id: conversationId,
        p_message_ids:     ids,
      })
      .then(({ error }) => {
        if (error && __DEV__) console.warn('[mark_messages_seen]', error.message);
      });
  }, [conversationId]);

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (!conversationId) return;

      for (const token of viewableItems) {
        const msg = token.item as TripMessageRow | undefined;
        if (!msg) continue;
        // Only mark messages from others (not own sends).
        if (msg.sender_role === 'dispatcher') continue;
        if (msg.sender_user_id === selfUid) continue;
        if (msg.is_read) continue;
        pendingSeenIds.current.add(msg.id);
      }

      if (pendingSeenIds.current.size === 0) return;

      // Debounce: reset the timer on every scroll event.
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        flush();
      }, 2500);
    },
    [conversationId, selfUid, flush],
  );

  return { onViewableItemsChanged, viewabilityConfig: VIEWABILITY_CONFIG };
}
