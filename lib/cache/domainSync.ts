import { bumpCacheMetric } from '@/lib/cache/cacheMetrics';
import {
  decideSyncMode,
  getDomainCacheMeta,
  upsertDomainCacheMeta,
} from '@/lib/cache/cacheMetadataStore';
import type { CacheDomain, DeltaResponse, SyncPolicy } from '@/lib/cache/deltaTypes';
import { runSingleflight } from '@/lib/cache/singleflight';

interface SyncDomainParams<T> {
  domain: CacheDomain;
  orgId: string;
  schemaVersion: string;
  policy: SyncPolicy;
  getFull: () => Promise<T[]>;
  getDelta: (cursor: { updatedAt: string; tieBreakerId?: string | null }) => Promise<DeltaResponse<T>>;
  merge: (current: T[], delta: DeltaResponse<T>) => T[];
  currentRows: T[];
}

export async function syncDomainRows<T>(params: SyncDomainParams<T>): Promise<T[]> {
  return runSingleflight(`sync:${params.domain}:${params.orgId}`, async () => {
    const meta = await getDomainCacheMeta(params.domain, params.orgId);
    const mode = decideSyncMode({
      meta,
      schemaVersion: params.schemaVersion,
      policy: params.policy,
    });

    if (mode.doFullSync || params.currentRows.length === 0) {
      const rows = await params.getFull();
      bumpCacheMetric(params.domain, 'full_fetch');
      const maxUpdatedAt = extractMaxUpdatedAt(rows);
      await upsertDomainCacheMeta({
        domain: params.domain,
        orgId: params.orgId,
        schemaVersion: params.schemaVersion,
        cursor: maxUpdatedAt ? { updatedAt: maxUpdatedAt } : null,
        markFullSync: true,
      });
      return rows;
    }

    try {
      const cursor = meta?.lastSuccessfulCursor;
      if (!cursor) return params.currentRows;
      const delta = await params.getDelta(cursor);
      bumpCacheMetric(params.domain, 'delta_fetch');
      const merged = params.merge(params.currentRows, delta);
      await upsertDomainCacheMeta({
        domain: params.domain,
        orgId: params.orgId,
        schemaVersion: params.schemaVersion,
        cursor: delta.nextCursor ?? cursor,
      });
      return merged;
    } catch {
      bumpCacheMetric(params.domain, 'delta_fallback_full');
      const rows = await params.getFull();
      const maxUpdatedAt = extractMaxUpdatedAt(rows);
      await upsertDomainCacheMeta({
        domain: params.domain,
        orgId: params.orgId,
        schemaVersion: params.schemaVersion,
        cursor: maxUpdatedAt ? { updatedAt: maxUpdatedAt } : null,
        markFullSync: true,
      });
      return rows;
    }
  });
}

function extractMaxUpdatedAt<T>(rows: T[]): string | null {
  let maxTs: string | null = null;
  for (const row of rows as Array<Record<string, unknown>>) {
    const value = typeof row.updated_at === 'string' ? row.updated_at : null;
    if (!value) continue;
    if (!maxTs || value > maxTs) maxTs = value;
  }
  return maxTs;
}
