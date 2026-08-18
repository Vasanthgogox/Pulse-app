/**
 * TanStack Query hooks for drivers. Cached by orgId.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  filterActiveFleetRelationshipDrivers,
  filterFinanceLedgerDrivers,
  getDriversByOrganization,
  syncDriversWithCache,
  type DriverRow,
} from '@/features/drivers/services/drivers.service';
import { fetchEntityListWithFallback } from '@/lib/queries/fetchEntityListWithFallback';
import { refetchOnMountIfEntityListEmpty } from '@/lib/queries/entityListQueryOptions';
import { queryKeys } from '@/lib/queryKeys';
import { STALE } from '@/lib/queryClient';
import { useAuth } from '@/contexts/AuthContext';

export type DriversQueryMembership = "fleet" | "ledger";

export function useDriversQuery(
  orgId: string | null,
  opts?: { membership?: DriversQueryMembership },
) {
  const qc = useQueryClient();
  const { status } = useAuth();
  const membership = opts?.membership ?? "fleet";
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
      // Non-tracking rows only. Membership (fleet vs finance ledger) is applied
      // in `select` so both views share this cache.
      return rows;
    },
    enabled: !!orgId && status !== 'restoring',
    staleTime: STALE.moderate,
    refetchOnMount: refetchOnMountIfEntityListEmpty<DriverRow[]>(),
    select:
      membership === "ledger"
        ? filterFinanceLedgerDrivers
        : filterActiveFleetRelationshipDrivers,
  });
}

export function useInvalidateDrivers() {
  const qc = useQueryClient();
  return (orgId: string) => {
    qc.invalidateQueries({ queryKey: queryKeys.drivers.all(orgId) });
    qc.invalidateQueries({ queryKey: queryKeys.drivers.finite(orgId) });
  };
}
