import { useQuery } from '@tanstack/react-query';
import { getClientManagementBundle } from '@/features/clients/services/clientManagement.service';
import { queryKeys } from '@/lib/queryKeys';

export function useClientManagementBundleQuery(
  orgId: string | null,
  clientId: string | null,
) {
  return useQuery({
    queryKey: queryKeys.clients.managementBundle(orgId ?? '', clientId ?? ''),
    queryFn: async () => {
      if (!orgId || !clientId) return null;
      const { error, bundle } = await getClientManagementBundle(orgId, clientId);
      if (error) throw error;
      return bundle;
    },
    enabled: Boolean(orgId && clientId),
    staleTime: 60_000,
  });
}
