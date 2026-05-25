import { queryKeys } from '@/lib/queryKeys';
import { driverInvitesReceivedQueryKey } from '@/lib/queries/useDriverInvitesQuery';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

/**
 * Invalidates all driver-home TanStack Query caches (drivers, pending OTP, invites).
 * Use for pull-to-refresh, focus resume, and post-mutation refresh — never raw parallel fetch().
 */
export function useInvalidateDriverHomeDashboard() {
  const qc = useQueryClient();

  return useCallback(
    async (userId: string) => {
      if (!userId) return;
      await Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.driverApp.root(userId) }),
        qc.invalidateQueries({ queryKey: driverInvitesReceivedQueryKey(userId) }),
      ]);
    },
    [qc],
  );
}
