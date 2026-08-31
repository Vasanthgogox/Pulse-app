import { fetchSupportTicketDetail } from '@/features/support/services/supportTickets.service';
import { queryKeys } from '@/lib/queryKeys';
import {
  infrastructureRetryDelay,
  infrastructureShouldRetry,
} from '@/lib/queryRetry';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

/**
 * One ticket + its conversation (public comments only — RLS on
 * support_ticket_comments excludes visibility='internal' at the database
 * level regardless of what this query asks for).
 */
export function useSupportTicketDetailQuery(ticketId?: string | null) {
  const id = ticketId ?? '';

  const query = useQuery({
    queryKey: queryKeys.support.ticketDetail(id),
    queryFn: async () => {
      const result = await fetchSupportTicketDetail(id);
      if ('error' in result) throw result.error;
      return result;
    },
    enabled: !!id,
    staleTime: 15_000,
    gcTime: 10 * 60_000,
    retry: infrastructureShouldRetry,
    retryDelay: infrastructureRetryDelay,
    refetchOnWindowFocus: true,
  });

  const queryClient = useQueryClient();
  const invalidate = useCallback(() => {
    if (!id) return;
    void queryClient.invalidateQueries({ queryKey: queryKeys.support.ticketDetail(id) });
  }, [queryClient, id]);

  return {
    ...query,
    ticket: query.data?.ticket ?? null,
    comments: query.data?.comments ?? [],
    attachments: query.data?.attachments ?? [],
    invalidate,
  };
}
