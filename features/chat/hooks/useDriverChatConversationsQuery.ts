/**
 * Driver inbox list — metadata only (no embedded message history).
 */
import * as chatService from '@/features/chat/services/chat.service';
import type { TripConversation } from '@/features/chat/types/chat.types';
import { queryKeys } from '@/lib/queryKeys';
import {
  infrastructureRetryDelay,
  infrastructureShouldRetry,
} from '@/lib/queryRetry';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

const STALE_MS = 30_000;
const EMPTY: TripConversation[] = [];

export function driverChatConversationsQueryKey(driverIdsKey: string) {
  return queryKeys.driverChat.conversations(driverIdsKey);
}

export function useDriverChatConversationsQuery(driverIds: string[]) {
  const safeDriverIds = Array.isArray(driverIds) ? driverIds : [];
  const driverIdsKey = useMemo(
    () => [...safeDriverIds].sort().join(','),
    [safeDriverIds],
  );

  const query = useQuery({
    queryKey: driverChatConversationsQueryKey(driverIdsKey),
    queryFn: () => chatService.getConversationsByDriverIds(safeDriverIds),
    enabled: safeDriverIds.length > 0,
    staleTime: STALE_MS,
    gcTime: 10 * 60_000,
    retry: infrastructureShouldRetry,
    retryDelay: infrastructureRetryDelay,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  });

  return {
    conversations: query.data ?? EMPTY,
    isLoading: query.isLoading,
    refreshConversations: query.refetch,
    driverIdsKey,
  };
}

export function useInvalidateDriverChatConversations() {
  const qc = useQueryClient();
  return (driverIdsKey: string) => {
    void qc.invalidateQueries({
      queryKey: driverChatConversationsQueryKey(driverIdsKey),
    });
  };
}
