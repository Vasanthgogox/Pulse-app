/**
 * Entity list fetch. Prefer a direct table/RPC read.
 * Delta-sync (`get_*_delta`) was tried first and could sit on a 12s+ timeout
 * with no fallback — that left Finance/Trips/party tabs on Loading during DB
 * degradation. Direct first; sync only if direct fails.
 */
import type { CacheDomain } from '@/lib/cache/deltaTypes';
import { clearDomainCacheMeta } from '@/lib/cache/cacheMetadataStore';

export type SyncResult<T> = { error: Error | null; rows: T[] };
export type DirectResult<T> = { error: Error | null; rows: T[] };

export async function fetchEntityListWithFallback<T>(params: {
  orgId: string;
  domain: CacheDomain;
  cachedRows: T[];
  sync: (orgId: string, cachedRows: T[]) => Promise<SyncResult<T>>;
  fetchDirect: (orgId: string) => Promise<DirectResult<T>>;
}): Promise<T[]> {
  const { orgId, domain, cachedRows, sync, fetchDirect } = params;

  try {
    const direct = await fetchDirect(orgId);
    if (!direct.error) {
      return direct.rows;
    }
  } catch {
    // Fall through to delta-sync.
  }

  try {
    const synced = await sync(orgId, cachedRows);
    if (synced.error) throw synced.error;
    if (synced.rows.length > 0) {
      await clearDomainCacheMeta(domain, orgId);
    }
    return synced.rows;
  } catch (syncError) {
    throw syncError;
  }
}
