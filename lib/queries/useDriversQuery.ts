/**
 * TanStack Query hooks for drivers. Cached by orgId.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getDriversByOrganization,
  syncDriversWithCache,
} from '@/features/drivers/services/drivers.service';
import { fetchEntityListWithFallback } from '@/lib/queries/fetchEntityListWithFallback';
import { refetchOnMountIfEntityListEmpty } from '@/lib/queries/entityListQueryOptions';
import { queryKeys } from '@/lib/queryKeys';
import { STALE } from '@/lib/queryClient';

export function useDriversQuery(orgId: string | null) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: queryKeys.drivers.finite(orgId ?? ''),
    queryFn: async () => {
      const existing =
        (qc.getQueryData(queryKeys.drivers.finite(orgId ?? '')) as
          | Array<{ id: string }>
          | undefined) ?? [];
      return fetchEntityListWithFallback({
        orgId: orgId!,
        domain: 'drivers',
        cachedRows: existing as never[],
        sync: async (id, cached) => {
          const res = await syncDriversWithCache(id, cached as never[]);
          return { error: res.error, rows: res.drivers };
        },
        fetchDirect: async (id) => {
          const res = await getDriversByOrganization(id);
          return { error: res.error, rows: res.drivers };
        },
      });
    },
    enabled: !!orgId,
    staleTime: STALE.moderate,
    refetchOnMount: refetchOnMountIfEntityListEmpty,
  });
}

export function useInvalidateDrivers() {
  const qc = useQueryClient();
  return (orgId: string) => {
    qc.invalidateQueries({ queryKey: queryKeys.drivers.all(orgId) });
    qc.invalidateQueries({ queryKey: queryKeys.drivers.finite(orgId) });
  };
}
