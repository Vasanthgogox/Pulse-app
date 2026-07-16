/**
 * TanStack Query hooks for Network tab: connection requests + driver invites.
 *
 * Connection requests are bootstrap-backed — see `useConnectionRequestsFromGlobalSync`.
 */
export {
  useConnectionRequestsReceivedQuery,
  useConnectionRequestsSentQuery,
} from '@/lib/hooks/useConnectionRequestsFromGlobalSync';

import { getDriverInvitesSent } from '@/features/drivers/services/drivers.service';
import { invalidateFleetDriverConnectionCaches } from '@/lib/invalidateFleetDriverConnectionCaches';
import { useQueryBootDefer } from '@/lib/hooks/useQueryBootDefer';
import { refetchOnMountIfEntityListEmpty } from '@/lib/queries/entityListQueryOptions';
import { queryKeys } from '@/lib/queryKeys';
import { STALE } from '@/lib/queryClient';
import { useQuery, useQueryClient } from '@tanstack/react-query';

type DriverInvitesOptions = {
  enabled?: boolean;
  /** Delay network fetch after org mount (default 1500ms). Set 0 to fetch immediately. */
  bootDeferMs?: number;
};

export function useDriverInvitesSentQuery(
  orgId: string | null,
  options?: DriverInvitesOptions,
) {
  const deferMs = options?.bootDeferMs ?? 1500;
  const deferReady = useQueryBootDefer(orgId, deferMs);
  const enabled =
    !!orgId &&
    options?.enabled !== false &&
    (deferMs === 0 ? true : deferReady);

  return useQuery({
    queryKey: queryKeys.driverInvites.sent(orgId ?? ''),
    queryFn: async () => {
      const res = await getDriverInvitesSent(orgId!);
      if (res.error) throw res.error;
      return res.invites;
    },
    enabled,
    staleTime: STALE.moderate,
    refetchOnMount: refetchOnMountIfEntityListEmpty(),
  });
}

export function useInvalidateNetwork(orgId: string | null) {
  const qc = useQueryClient();
  return () => {
    if (!orgId) return;
    void import('@/lib/globalSync/useGlobalSyncStore').then(({ useGlobalSyncStore }) => {
      void useGlobalSyncStore.getState().refreshInboundProtocol(orgId);
    });
    void invalidateFleetDriverConnectionCaches(qc, orgId);
    qc.invalidateQueries({ queryKey: queryKeys.clients.all(orgId) });
    qc.invalidateQueries({ queryKey: queryKeys.suppliers.all(orgId) });
    qc.invalidateQueries({
      queryKey: queryKeys.connectionRequests.received(orgId),
    });
    qc.invalidateQueries({
      queryKey: queryKeys.connectionRequests.sent(orgId),
    });
  };
}
