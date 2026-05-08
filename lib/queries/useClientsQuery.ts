/**
 * TanStack Query hooks for clients. Cached by orgId.
 */
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getClientsByOrganization,
  syncClientsWithCache,
} from '@/features/clients/services/clients.service';
import { queryKeys } from '@/lib/queryKeys';
import { DEFAULT_PAGE_SIZE } from '@/lib/pagination';
import { STALE } from '@/lib/queryClient';

/** Full list (no pagination). Use for dropdowns, Finance entities. */
export function useClientsQuery(orgId: string | null) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: queryKeys.clients.finite(orgId ?? ''),
    queryFn: async () => {
      const existing =
        (qc.getQueryData(queryKeys.clients.finite(orgId ?? '')) as
          | Array<{ id: string }>
          | undefined) ?? [];
      const res = await syncClientsWithCache(orgId!, existing as any);
      if (res.error) throw res.error;
      return res.clients;
    },
    enabled: !!orgId,
    staleTime: STALE.moderate,
  });
}

/** Paginated list for Customers tab. */
export function useClientsInfiniteQuery(orgId: string | null, opts?: { pageSize?: number }) {
  const pageSize = opts?.pageSize ?? DEFAULT_PAGE_SIZE;
  return useInfiniteQuery({
    queryKey: queryKeys.clients.infinite(orgId ?? '', pageSize),
    queryFn: async ({ pageParam = 0 }) => {
      const res = await getClientsByOrganization(orgId!, { limit: pageSize, offset: pageParam });
      if (res.error) throw res.error;
      return { clients: res.clients, hasMore: res.hasMore ?? false, nextOffset: pageParam + pageSize };
    },
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextOffset : undefined),
    initialPageParam: 0,
    enabled: !!orgId,
    staleTime: STALE.moderate,
  });
}

export function useInvalidateClients() {
  const qc = useQueryClient();
  return (orgId: string) => {
    qc.invalidateQueries({ queryKey: queryKeys.clients.all(orgId) });
    qc.invalidateQueries({ queryKey: queryKeys.clients.finite(orgId) });
    qc.invalidateQueries({ queryKey: ['q', 'clients', orgId, 'infinite'] });
  };
}
