/**
 * TanStack Query hooks for vehicles. Cached by orgId.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getVehiclesByOrganization,
  syncVehiclesWithCache,
  type VehicleRow,
} from '@/features/vehicles/services/vehicles.service';
import { fetchEntityListWithFallback } from '@/lib/queries/fetchEntityListWithFallback';
import { refetchOnMountIfEntityListEmpty } from '@/lib/queries/entityListQueryOptions';
import { queryKeys } from '@/lib/queryKeys';
import { STALE } from '@/lib/queryClient';

export function useVehiclesQuery(orgId: string | null) {
  const qc = useQueryClient();
  return useQuery<VehicleRow[], Error>({
    queryKey: queryKeys.vehicles.finite(orgId ?? ''),
    queryFn: async () => {
      const existing =
        (qc.getQueryData(queryKeys.vehicles.finite(orgId ?? '')) as
          | VehicleRow[]
          | undefined) ?? [];
      return fetchEntityListWithFallback<VehicleRow>({
        orgId: orgId!,
        domain: 'vehicles',
        cachedRows: existing,
        sync: async (id, cachedRows) => {
          const res = await syncVehiclesWithCache(id, cachedRows);
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
    refetchOnMount: refetchOnMountIfEntityListEmpty<VehicleRow[]>(),
  });
}

export function useInvalidateVehicles() {
  const qc = useQueryClient();
  return (orgId: string) => {
    qc.invalidateQueries({ queryKey: queryKeys.vehicles.all(orgId) });
    qc.invalidateQueries({ queryKey: queryKeys.vehicles.finite(orgId) });
  };
}
