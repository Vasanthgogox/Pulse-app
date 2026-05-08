/**
 * TanStack Query hooks for suppliers. Cached by orgId.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getSuppliersByOrganization } from '@/features/suppliers/services/suppliers.service';
import { queryKeys } from '@/lib/queryKeys';
import { STALE } from '@/lib/queryClient';

export function useSuppliersQuery(orgId: string | null) {
  return useQuery({
    queryKey: queryKeys.suppliers.all(orgId ?? ''),
    queryFn: async () => {
      const res = await getSuppliersByOrganization(orgId!);
      if (res.error) throw res.error;
      return res.suppliers;
    },
    enabled: !!orgId,
    staleTime: STALE.moderate,
  });
}

export function useInvalidateSuppliers() {
  const qc = useQueryClient();
  return (orgId: string) => qc.invalidateQueries({ queryKey: queryKeys.suppliers.all(orgId) });
}
