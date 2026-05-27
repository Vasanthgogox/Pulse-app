/**
 * Finance entity list fetch — sync cache with direct API fallback when cache is empty or sync fails.
 * Prevents persisted/delta-sync empty arrays from blocking party tabs on mobile cold start.
 */
import type { CacheDomain } from '@/lib/cache/deltaTypes';
import { clearDomainCacheMeta } from '@/lib/cache/cacheMetadataStore';

type SyncResult<T> = { error: Error | null; rows: T[] };
type DirectResult<T> = { error: Error | null; rows: T[] };

export async function fetchEntityListWithFallback<T>(params: {
  orgId: string;
  domain: CacheDomain;
  cachedRows: T[];
  sync: (orgId: string, cachedRows: T[]) => Promise<SyncResult<T>>;
  fetchDirect: (orgId: string) => Promise<DirectResult<T>>;
}): Promise<T[]> {
  const { orgId, domain, cachedRows, sync, fetchDirect } = params;

  try {
    const synced = await sync(orgId, cachedRows);
    if (synced.error) throw synced.error;
    if (synced.rows.length > 0) return synced.rows;
  } catch (syncError) {
    const direct = await fetchDirect(orgId);
    if (direct.error) throw syncError;
    if (direct.rows.length > 0) {
      await clearDomainCacheMeta(domain, orgId);
      return direct.rows;
    }
    throw syncError;
  }

  const direct = await fetchDirect(orgId);
  if (direct.error) throw direct.error;
  if (direct.rows.length > 0) {
    await clearDomainCacheMeta(domain, orgId);
    return direct.rows;
  }

  return [];
}
