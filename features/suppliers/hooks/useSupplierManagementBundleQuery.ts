import { useQuery } from "@tanstack/react-query";
import { getSupplierManagementBundle } from "@/features/suppliers/services/supplierManagement.service";
import { queryKeys } from "@/lib/queryKeys";

export function useSupplierManagementBundleQuery(
  orgId: string | null,
  supplierId: string | null,
) {
  return useQuery({
    queryKey: queryKeys.suppliers.managementBundle(orgId ?? "", supplierId ?? ""),
    queryFn: async () => {
      if (!orgId || !supplierId) return null;
      const { error, bundle } = await getSupplierManagementBundle(orgId, supplierId);
      if (error) throw error;
      return bundle;
    },
    enabled: Boolean(orgId && supplierId),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    retry: 1,
  });
}
