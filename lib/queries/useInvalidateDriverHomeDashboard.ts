import { queryKeys } from '@/lib/queryKeys';
import { driverInvitesReceivedQueryKey } from '@/lib/queries/useDriverInvitesQuery';
import { syncLinkedDriversForDriverHome } from '@/lib/syncLinkedDriversForDriverHome';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

/**
 * Invalidates all driver-home TanStack Query caches (drivers, pending OTP, invites).
 * Manual refresh also re-syncs linked driver rows (not done on poll).
 */
export function useInvalidateDriverHomeDashboard() {
  const qc = useQueryClient();

  return useCallback(
    async (userId: string, opts?: { syncLinkedDrivers?: boolean }) => {
      if (!userId) return;
      if (opts?.syncLinkedDrivers) {
        await syncLinkedDriversForDriverHome();
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.driverApp.root(userId) }),
        qc.invalidateQueries({ queryKey: driverInvitesReceivedQueryKey(userId) }),
      ]);
    },
    [qc],
  );
}
