/**
 * TanStack Query hooks for vehicles. Cached by orgId.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getVehiclesByOrganization } from '@/features/vehicles/services/vehicles.service';
import { queryKeys } from '@/lib/queryKeys';
import { STALE } from '@/lib/queryClient';

export function useVehiclesQuery(orgId: string | null) {
  return useQuery({
    queryKey: queryKeys.vehicles.all(orgId ?? ''),
    queryFn: async () => {
      const res = await getVehiclesByOrganization(orgId!);
      if (res.error) throw res.error;
      return res.vehicles;
    },
    enabled: !!orgId,
    staleTime: STALE.moderate,
  });
}

export function useInvalidateVehicles() {
  const qc = useQueryClient();
  return (orgId: string) => qc.invalidateQueries({ queryKey: queryKeys.vehicles.all(orgId) });
}
