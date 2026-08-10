/**
 * TanStack Query hooks for drivers. Cached by orgId.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  filterActiveFleetRelationshipDrivers,
  getDriversByOrganization,
  syncDriversWithCache,
  type DriverRow,
} from '@/features/drivers/services/drivers.service';
import { fetchEntityListWithFallback } from '@/lib/queries/fetchEntityListWithFallback';
import { refetchOnMountIfEntityListEmpty } from '@/lib/queries/entityListQueryOptions';
import { queryKeys } from '@/lib/queryKeys';
import { STALE } from '@/lib/queryClient';
import { useAuth } from '@/contexts/AuthContext';

export function useDriversQuery(orgId: string | null) {
  const qc = useQueryClient();
  const { status } = useAuth();
  return useQuery<DriverRow[], Error>({
    queryKey: queryKeys.drivers.finite(orgId ?? ''),
    queryFn: async () => {
      const existing =
        (qc.getQueryData(queryKeys.drivers.finite(orgId ?? '')) as
          | DriverRow[]
          | undefined) ?? [];
      const rows = await fetchEntityListWithFallback<DriverRow>({
        orgId: orgId!,
        domain: 'drivers',
        cachedRows: existing,
        sync: async (id, cachedRows) => {
          const res = await syncDriversWithCache(id, cachedRows);
          return { error: res.error, rows: res.drivers };
        },
        fetchDirect: async (id) => {
          const res = await getDriversByOrganization(id);
          return { error: res.error, rows: res.drivers };
        },
      });
      // Party roster only — fleet-relationship membership (active_employee /
      // independent), not tracking_only. See filterActiveFleetRelationshipDrivers.
      return filterActiveFleetRelationshipDrivers(rows);
    },
    enabled: !!orgId && status !== 'restoring',
    staleTime: STALE.moderate,
    refetchOnMount: refetchOnMountIfEntityListEmpty<DriverRow[]>(),
    // Drop non-fleet-relationship rows from any stale in-memory / persisted cache.
    select: filterActiveFleetRelationshipDrivers,
  });
}

export function useInvalidateDrivers() {
  const qc = useQueryClient();
  return (orgId: string) => {
    qc.invalidateQueries({ queryKey: queryKeys.drivers.all(orgId) });
    qc.invalidateQueries({ queryKey: queryKeys.drivers.finite(orgId) });
  };
}
