/**
 * TanStack Query hooks for drivers. Cached by orgId.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  syncDriversWithCache,
} from '@/features/drivers/services/drivers.service';
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
      const res = await syncDriversWithCache(orgId!, existing as any);
      if (res.error) throw res.error;
      return res.drivers;
    },
    enabled: !!orgId,
    staleTime: STALE.slow,
  });
}

export function useInvalidateDrivers() {
  const qc = useQueryClient();
  return (orgId: string) => {
    qc.invalidateQueries({ queryKey: queryKeys.drivers.all(orgId) });
    qc.invalidateQueries({ queryKey: queryKeys.drivers.finite(orgId) });
  };
}
