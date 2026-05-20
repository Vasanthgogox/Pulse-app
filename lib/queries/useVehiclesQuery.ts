/**
 * TanStack Query hooks for vehicles. Cached by orgId.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  syncVehiclesWithCache,
} from '@/features/vehicles/services/vehicles.service';
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
      const res = await syncVehiclesWithCache(orgId!, existing as any);
      if (res.error) throw res.error;
      return res.vehicles;
    },
    enabled: !!orgId,
    staleTime: STALE.moderate,
  });
}

export function useInvalidateVehicles() {
  const qc = useQueryClient();
  return (orgId: string) => {
    qc.invalidateQueries({ queryKey: queryKeys.vehicles.all(orgId) });
    qc.invalidateQueries({ queryKey: queryKeys.vehicles.finite(orgId) });
  };
}
