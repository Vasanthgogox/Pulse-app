/**
 * TanStack Query hooks for suppliers. Cached by orgId.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getSuppliersByOrganization,
  syncSuppliersWithCache,
  type SupplierRow,
} from '@/features/suppliers/services/suppliers.service';
import { fetchEntityListWithFallback } from '@/lib/queries/fetchEntityListWithFallback';
import { refetchOnMountIfEntityListEmpty } from '@/lib/queries/entityListQueryOptions';
import { queryKeys } from '@/lib/queryKeys';
import { STALE } from '@/lib/queryClient';

export function useSuppliersQuery(orgId: string | null) {
  const qc = useQueryClient();
  return useQuery<SupplierRow[], Error>({
    queryKey: queryKeys.suppliers.finite(orgId ?? ''),
    queryFn: async () => {
      const existing =
        (qc.getQueryData(queryKeys.suppliers.finite(orgId ?? '')) as
          | SupplierRow[]
          | undefined) ?? [];
      return fetchEntityListWithFallback<SupplierRow>({
        orgId: orgId!,
        domain: 'suppliers',
        cachedRows: existing,
        sync: async (id, cachedRows) => {
          const res = await syncSuppliersWithCache(id, cachedRows);
          return { error: res.error, rows: res.suppliers };
        },
        fetchDirect: async (id) => {
          const res = await getSuppliersByOrganization(id);
          return { error: res.error, rows: res.suppliers };
        },
      });
    },
    enabled: !!orgId,
    staleTime: STALE.moderate,
    refetchOnMount: refetchOnMountIfEntityListEmpty<SupplierRow[]>(),
  });
}

export function useInvalidateSuppliers() {
  const qc = useQueryClient();
  return (orgId: string) => {
    qc.invalidateQueries({ queryKey: queryKeys.suppliers.all(orgId) });
  };
}
