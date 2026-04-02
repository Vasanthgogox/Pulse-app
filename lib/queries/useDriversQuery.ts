/**
 * TanStack Query hooks for drivers. Cached by orgId.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getDriversByOrganization } from '@/features/drivers/services/drivers.service';
import { queryKeys } from '@/lib/queryKeys';

export function useDriversQuery(orgId: string | null) {
  return useQuery({
    queryKey: queryKeys.drivers.all(orgId ?? ''),
    queryFn: async () => {
      const res = await getDriversByOrganization(orgId!);
      if (res.error) throw res.error;
      return res.drivers;
    },
    enabled: !!orgId,
  });
}

export function useInvalidateDrivers() {
  const qc = useQueryClient();
  return (orgId: string) => qc.invalidateQueries({ queryKey: queryKeys.drivers.all(orgId) });
}
