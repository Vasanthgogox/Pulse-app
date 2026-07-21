import { useQuery } from "@tanstack/react-query";

import {
  getWarehousesByClient,
  type ClientWarehouse,
} from "@/features/clients/services/clientWarehouses.service";
import { queryKeys } from "@/lib/queryKeys";

export function useClientWarehousesQuery(
  orgId: string | null | undefined,
  clientId: string | null | undefined,
) {
  return useQuery<ClientWarehouse[], Error>({
    queryKey: queryKeys.clients.warehouses(orgId ?? "", clientId ?? ""),
    enabled: Boolean(orgId && clientId),
    queryFn: async () => {
      const { error, warehouses } = await getWarehousesByClient(
        orgId!,
        clientId!,
      );
      if (error) throw error;
      return warehouses;
    },
    staleTime: 60_000,
  });
}
