/**
 * useMarkSeen — per-message seen tracking via FlatList viewability.
 *
 * Wires FlatList's onViewableItemsChanged to the `mark_messages_seen` RPC
 * with a 2s debounce per conversation (see `enqueueReadReceiptsDebounced` in
 * `useChatStore`). One RPC batches all visible ids + one optimistic store write.
 *
 * Usage:
 *
 *   const { onViewableItemsChanged, viewabilityConfig } = useMarkSeen({
 *     conversationId,
 *     selfUid,
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
import { enqueueReadReceiptsDebounced } from '../store/useChatStore';
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
  const batchIds = useRef<string[]>([]);

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (!conversationId) return;

      batchIds.current.length = 0;
      for (const token of viewableItems) {
        const msg = token.item as TripMessageRow | undefined;
        if (!msg) continue;
        // Skip synthetic list rows (date/unread dividers) — their ids are
        // sentinels like "__date__2026-07-10", not UUIDs, and would make the
        // mark_messages_seen RPC fail with 22P02 (invalid uuid) → 400.
        if (typeof msg.id !== 'string' || msg.id.startsWith('__')) continue;
        // Only mark messages from others (not own sends).
        if (msg.sender_role === 'dispatcher') continue;
        if (msg.sender_user_id === selfUid) continue;
        if (msg.is_read) continue;
        batchIds.current.push(msg.id);
      }

      if (batchIds.current.length === 0) return;
      enqueueReadReceiptsDebounced(conversationId, [...batchIds.current], 2000);
    },
    [conversationId, selfUid],
  );

  return { onViewableItemsChanged, viewabilityConfig: VIEWABILITY_CONFIG };
}
