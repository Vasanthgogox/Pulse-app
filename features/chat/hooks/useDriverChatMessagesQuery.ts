/**
 * Driver thread: bootstrapped message history via TanStack Query infinite pages.
 * Screen → this hook → chat.service.getMessagesByConversation → Supabase RPC.
 */
import * as chatService from '@/features/chat/services/chat.service';
import { TRIP_CHAT_HISTORY_PAGE } from '@/features/chat/services/chat.service';
import type { TripMessageRow } from '@/features/chat/types/chat.types';
import {
  flattenDriverChatMessages,
  type DriverChatMessagesPage,
} from '@/features/chat/utils/driverChatMessageCache.util';
import { driverChatMessagesQueryKey } from '@/features/chat/utils/driverChatMessageCache.util';
import {
  infrastructureRetryDelay,
  infrastructureShouldRetry,
} from '@/lib/queryRetry';
import {
  useInfiniteQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

const STALE_MS = 30_000;

export { driverChatMessagesQueryKey } from '@/features/chat/utils/driverChatMessageCache.util';

export function useDriverChatMessagesQuery(conversationId: string | null) {
  const cid = conversationId ?? '';

  const query = useInfiniteQuery({
    queryKey: driverChatMessagesQueryKey(cid),
    enabled: !!cid,
    initialPageParam: undefined as string | undefined,
    staleTime: STALE_MS,
    gcTime: 10 * 60_000,
    retry: infrastructureShouldRetry,
    retryDelay: infrastructureRetryDelay,
    refetchOnWindowFocus: false,
    queryFn: async ({ pageParam }) => {
      const rows = await chatService.getMessagesByConversation(cid, {
        before: pageParam,
        limit: TRIP_CHAT_HISTORY_PAGE,
        partyType: null,
      });
      return { rows } satisfies DriverChatMessagesPage;
    },
    getNextPageParam: (lastPage) => {
      if (lastPage.rows.length < TRIP_CHAT_HISTORY_PAGE) return undefined;
      return lastPage.rows[0]?.created_at;
    },
  });

  const messages = useMemo(
    () => flattenDriverChatMessages(query.data),
    [query.data],
  );

  const loadOlder = useCallback(async () => {
    if (!query.hasNextPage || query.isFetchingNextPage) return;
    await query.fetchNextPage();
  }, [query]);

  return {
    messages,
    isLoading: query.isLoading,
    isFetchingOlder: query.isFetchingNextPage,
    hasOlder: query.hasNextPage ?? false,
    loadOlder,
    refetch: query.refetch,
  };
}

export function useInvalidateDriverChatMessages() {
  const qc = useQueryClient();
  return (conversationId: string) => {
    void qc.invalidateQueries({
      queryKey: driverChatMessagesQueryKey(conversationId),
    });
  };
}
