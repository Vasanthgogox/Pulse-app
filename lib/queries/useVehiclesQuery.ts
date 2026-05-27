/**
 * TanStack Query hooks for vehicles. Cached by orgId.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getVehiclesByOrganization,
  syncVehiclesWithCache,
} from '@/features/vehicles/services/vehicles.service';
import { fetchEntityListWithFallback } from '@/lib/queries/fetchEntityListWithFallback';
import { refetchOnMountIfEntityListEmpty } from '@/lib/queries/entityListQueryOptions';
import { queryKeys } from '@/lib/queryKeys';
import { STALE } from '@/lib/queryClient';

export function useVehiclesQuery(orgId: string | null) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: queryKeys.vehicles.finite(orgId ?? ''),
    queryFn: async () => {
      const existing =
        (qc.getQueryData(queryKeys.vehicles.finite(orgId ?? '')) as
          | Array<{ id: string }>
          | undefined) ?? [];
      return fetchEntityListWithFallback({
        orgId: orgId!,
        domain: 'vehicles',
        cachedRows: existing as never[],
        sync: async (id, cached) => {
          const res = await syncVehiclesWithCache(id, cached as never[]);
          return { error: res.error, rows: res.vehicles };
        },
        fetchDirect: async (id) => {
          const res = await getVehiclesByOrganization(id);
          return { error: res.error, rows: res.vehicles };
        },
      });
    },
    enabled: !!orgId,
    staleTime: STALE.moderate,
    refetchOnMount: refetchOnMountIfEntityListEmpty,
  });
}

export function useInvalidateVehicles() {
  const qc = useQueryClient();
  return (orgId: string) => {
    qc.invalidateQueries({ queryKey: queryKeys.vehicles.all(orgId) });
    qc.invalidateQueries({ queryKey: queryKeys.vehicles.finite(orgId) });
  };
}
