/**
 * TanStack Query hooks for Network tab: connection requests + driver invites.
 */
import { getDriverInvitesSent } from "@/features/drivers/services/drivers.service";
import { queryKeys } from "@/lib/queryKeys";
import { STALE } from "@/lib/queryClient";
import {
    getConnectionRequestsReceived,
    getConnectionRequestsSent,
} from "@/services/connectionRequestsService";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export function useConnectionRequestsReceivedQuery(orgId: string | null) {
  return useQuery({
    queryKey: queryKeys.connectionRequests.received(orgId ?? ""),
    queryFn: async () => {
      const res = await getConnectionRequestsReceived(orgId!);
      if (res.error) throw res.error;
      return res.requests;
    },
    enabled: !!orgId,
    staleTime: STALE.moderate,
  });
}

export function useConnectionRequestsSentQuery(orgId: string | null) {
  return useQuery({
    queryKey: queryKeys.connectionRequests.sent(orgId ?? ""),
    queryFn: async () => {
      const res = await getConnectionRequestsSent(orgId!);
      if (res.error) throw res.error;
      return res.requests;
    },
    enabled: !!orgId,
    staleTime: STALE.moderate,
  });
}

export function useDriverInvitesSentQuery(orgId: string | null) {
  return useQuery({
    queryKey: queryKeys.driverInvites.sent(orgId ?? ""),
    queryFn: async () => {
      const res = await getDriverInvitesSent(orgId!);
      if (res.error) throw res.error;
      return res.invites;
    },
    enabled: !!orgId,
    staleTime: STALE.moderate,
  });
}

export function useInvalidateNetwork(orgId: string | null) {
  const qc = useQueryClient();
  return () => {
    if (!orgId) return;
    // Connection request decisions can create/update linked parties; refresh all network data.
    qc.invalidateQueries({ queryKey: queryKeys.clients.all(orgId) });
    qc.invalidateQueries({ queryKey: queryKeys.suppliers.all(orgId) });
    qc.invalidateQueries({ queryKey: queryKeys.drivers.all(orgId) });
    qc.invalidateQueries({
      queryKey: queryKeys.connectionRequests.received(orgId),
    });
    qc.invalidateQueries({
      queryKey: queryKeys.connectionRequests.sent(orgId),
    });
    qc.invalidateQueries({ queryKey: queryKeys.driverInvites.sent(orgId) });
  };
}
