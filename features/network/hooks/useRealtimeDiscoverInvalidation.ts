/**
 * One Discover realtime subscription per org (ref-counted).
 * Invalidates TanStack Discover queries once — hooks do not refetch themselves.
 *
 * Dataset changes: connection_requests involving the viewer, plus clients/suppliers
 * (linked partners leave Discover). Display stats refresh on the next fetch / staleTime.
 * Unfiltered `organizations` and `posts` are intentionally omitted (call-frequency storm).
 */
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { subscribeSharedPostgresChanges } from "@/lib/realtimeRegistry";
import { clearDiscoveryCache } from "@/features/network/lib/discoveryCache";
import { queryKeys } from "@/lib/queryKeys";

const INVALIDATE_DEBOUNCE_MS = 400;

type Retainer = {
  count: number;
  unsubscribe: () => void;
};

const retainers = new Map<string, Retainer>();

export function useDiscoverRealtimeCoordinator(orgId: string | null): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!orgId) return;

    let entry = retainers.get(orgId);
    if (!entry) {
      let timer: ReturnType<typeof setTimeout> | null = null;
      const scheduleInvalidate = () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          clearDiscoveryCache(orgId);
          void queryClient.invalidateQueries({
            queryKey: queryKeys.discover.all(orgId),
          });
        }, INVALIDATE_DEBOUNCE_MS);
      };

      const unsubscribeChannel = subscribeSharedPostgresChanges(
        `discover:org:${orgId}`,
        [
          {
            event: "*",
            schema: "public",
            table: "connection_requests",
            filter: `from_organization_id=eq.${orgId}`,
          },
          {
            event: "*",
            schema: "public",
            table: "connection_requests",
            filter: `to_organization_id=eq.${orgId}`,
          },
          {
            event: "*",
            schema: "public",
            table: "clients",
            filter: `organization_id=eq.${orgId}`,
          },
          {
            event: "*",
            schema: "public",
            table: "suppliers",
            filter: `organization_id=eq.${orgId}`,
          },
        ],
        () => scheduleInvalidate(),
      );

      entry = {
        count: 0,
        unsubscribe: () => {
          if (timer) clearTimeout(timer);
          unsubscribeChannel();
        },
      };
      retainers.set(orgId, entry);
    }

    entry.count += 1;
    return () => {
      const current = retainers.get(orgId);
      if (!current) return;
      current.count -= 1;
      if (current.count <= 0) {
        current.unsubscribe();
        retainers.delete(orgId);
      }
    };
  }, [orgId, queryClient]);
}

/** @deprecated Use useDiscoverRealtimeCoordinator — kept as a name alias. */
export const useRealtimeDiscoverInvalidation = (
  orgId: string | null,
  _onInvalidate?: () => void,
): void => {
  useDiscoverRealtimeCoordinator(orgId);
};
