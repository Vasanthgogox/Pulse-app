/**
 * TanStack Query hooks for Network tab: connection requests + driver invites.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getConnectionRequestsReceived,
  getConnectionRequestsSent,
} from '@/features/network/services/connection-requests.service';
import { getDriverInvitesSent } from '@/features/drivers/services/drivers.service';
import { queryKeys } from '@/lib/supabase';

export function useConnectionRequestsReceivedQuery(orgId: string | null) {
  return useQuery({
    queryKey: queryKeys.connectionRequests.received(orgId ?? ''),
    queryFn: async () => {
      const res = await getConnectionRequestsReceived(orgId!);
      if (res.error) throw res.error;
      return res.requests;
    },
    enabled: !!orgId,
  });
}

export function useConnectionRequestsSentQuery(orgId: string | null) {
  return useQuery({
    queryKey: queryKeys.connectionRequests.sent(orgId ?? ''),
    queryFn: async () => {
      const res = await getConnectionRequestsSent(orgId!);
      if (res.error) throw res.error;
      return res.requests;
    },
    enabled: !!orgId,
  });
}

export function useDriverInvitesSentQuery(orgId: string | null) {
  return useQuery({
    queryKey: queryKeys.driverInvites.sent(orgId ?? ''),
    queryFn: async () => {
      const res = await getDriverInvitesSent(orgId!);
      if (res.error) throw res.error;
      return res.invites;
    },
    enabled: !!orgId,
  });
}

export function useInvalidateNetwork(orgId: string | null) {
  const qc = useQueryClient();
  return () => {
    if (!orgId) return;
    qc.invalidateQueries({ queryKey: queryKeys.connectionRequests.received(orgId) });
    qc.invalidateQueries({ queryKey: queryKeys.connectionRequests.sent(orgId) });
    qc.invalidateQueries({ queryKey: queryKeys.driverInvites.sent(orgId) });
  };
}
