import { clearDomainCacheMeta } from '@/lib/cache/cacheMetadataStore';
import { queryKeys } from '@/lib/queryKeys';
import type { QueryClient } from '@tanstack/react-query';

/** Refresh fleet roster + sent driver invites after invite lifecycle changes. */
export async function invalidateFleetDriverConnectionCaches(
  queryClient: QueryClient,
  orgId: string,
): Promise<void> {
  await clearDomainCacheMeta('drivers', orgId);
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.drivers.all(orgId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.drivers.finite(orgId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.driverInvites.sent(orgId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.driverOffers(orgId) }),
  ]);
}
