import { useAuth } from '@/contexts/AuthContext';
import { fetchMySupportTickets } from '@/features/support/services/supportTickets.service';
import { queryKeys } from '@/lib/queryKeys';
import {
  infrastructureRetryDelay,
  infrastructureShouldRetry,
} from '@/lib/queryRetry';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

/** This user's own support_tickets rows — My Support Tickets screen. RLS already scopes to created_by_user_id. */
export function useMySupportTicketsQuery(userId?: string | null) {
  const { status, profile } = useAuth();
  const uid = userId ?? profile?.uid ?? '';

  const query = useQuery({
    queryKey: queryKeys.support.myTickets(uid),
    queryFn: async () => {
      const result = await fetchMySupportTickets(uid);
      if ('error' in result) throw result.error;
      return result.tickets;
    },
    enabled: !!uid && status !== 'restoring',
    staleTime: 30_000,
    gcTime: 10 * 60_000,
    retry: infrastructureShouldRetry,
    retryDelay: infrastructureRetryDelay,
    refetchOnWindowFocus: true,
  });

  const queryClient = useQueryClient();
  const invalidate = useCallback(() => {
    if (!uid) return;
    void queryClient.invalidateQueries({ queryKey: queryKeys.support.myTickets(uid) });
  }, [queryClient, uid]);

  return { ...query, tickets: query.data ?? [], invalidate };
}
