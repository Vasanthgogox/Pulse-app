/**
 * TanStack Query hooks for the cross-org network notification inbox
 * (indent created / bid received / awarded / quote requested / counter offered).
 */
import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getNetworkNotifications,
  getNetworkNotificationsCount,
  markAllNetworkNotificationsRead,
  markNetworkNotificationHandled,
  markNetworkNotificationRead,
  subscribeToNetworkNotifications,
  type NetworkNotificationRow,
} from "@/features/network/services/networkNotifications.service";
import { queryKeys } from "@/lib/queryKeys";
import { STALE } from "@/lib/queryClient";

const EMPTY: NetworkNotificationRow[] = [];

export type NetworkNotificationStatusFilter =
  | "all"
  | "action_required"
  | "history";

export function useNetworkNotificationsQuery(
  orgId: string | null,
  statusFilter: NetworkNotificationStatusFilter = "all",
) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.networkNotifications.list(orgId ?? "", statusFilter),
    queryFn: async () => {
      const res = await getNetworkNotifications(orgId!, statusFilter);
      if (res.error) throw res.error;
      return res.notifications;
    },
    enabled: !!orgId,
    staleTime: STALE.realtime,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  // One shared channel per org; invalidates both the list and the badge count.
  // Debounce so bursty indent/bid writes do not refetch the inbox on every row.
  useEffect(() => {
    if (!orgId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsub = subscribeToNetworkNotifications(orgId, () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.networkNotifications.all(orgId),
        });
      }, 280);
    });
    return () => {
      if (timer) clearTimeout(timer);
      unsub();
    };
  }, [orgId, queryClient]);

  return { ...query, data: query.data ?? EMPTY };
}

/** Unread badge count. Shares the realtime channel opened by the list hook. */
export function useNetworkNotificationsCountQuery(orgId: string | null) {
  return useQuery({
    queryKey: queryKeys.networkNotifications.count(orgId ?? ""),
    queryFn: async () => {
      const res = await getNetworkNotificationsCount(orgId!);
      if (res.error) throw res.error;
      return res.count;
    },
    enabled: !!orgId,
    staleTime: STALE.realtime,
  });
}

export function useMarkNetworkNotificationRead(orgId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await markNetworkNotificationRead(id);
      if (res.error) throw res.error;
    },
    onSuccess: () => {
      if (!orgId) return;
      void qc.invalidateQueries({
        queryKey: queryKeys.networkNotifications.all(orgId),
      });
    },
  });
}

export function useMarkNetworkNotificationHandled(orgId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; userId?: string | null }) => {
      const res = await markNetworkNotificationHandled(input.id, input.userId);
      if (res.error) throw res.error;
    },
    onSuccess: () => {
      if (!orgId) return;
      void qc.invalidateQueries({
        queryKey: queryKeys.networkNotifications.all(orgId),
      });
    },
  });
}

export function useMarkAllNetworkNotificationsRead(orgId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!orgId) return;
      const res = await markAllNetworkNotificationsRead(orgId);
      if (res.error) throw res.error;
    },
    onSuccess: () => {
      if (!orgId) return;
      void qc.invalidateQueries({
        queryKey: queryKeys.networkNotifications.all(orgId),
      });
    },
  });
}
