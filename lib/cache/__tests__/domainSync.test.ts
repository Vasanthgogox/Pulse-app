/**
 * Regression tests for the two cache-drift bugs behind GX-PULSE-CACHE:
 * a truncated full fetch seeding the delta cursor, and a delta merge that
 * silently serves a short list forever.
 */
// The shared AsyncStorage mock is stateless (getItem always resolves null), so
// cursor round-tripping cannot be observed through it. Back it with a real
// in-memory map for this suite only.
jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>();
  return {
    __store: store,
    setItem: jest.fn(async (k: string, v: string) => void store.set(k, v)),
    getItem: jest.fn(async (k: string) => store.get(k) ?? null),
    removeItem: jest.fn(async (k: string) => void store.delete(k)),
    clear: jest.fn(async () => void store.clear()),
    getAllKeys: jest.fn(async () => [...store.keys()]),
  };
});

import { syncDomainRows } from '@/lib/cache/domainSync';
import {
  clearDomainCacheMeta,
  getDomainCacheMeta,
  setDomainCacheMeta,
} from '@/lib/cache/cacheMetadataStore';

type Row = { id: string; updated_at: string };

const ORG = 'org-1';
const DOMAIN = 'indents' as const;
const POLICY = { maxDeltaLagMs: 3 * 60_000, fullSyncEveryMs: 15 * 60_000 };

const row = (id: string, updatedAt: string): Row => ({ id, updated_at: updatedAt });

/** Meta that decideSyncMode will accept for the delta path. */
async function seedFreshDeltaMeta(cursor: string) {
  const now = new Date().toISOString();
  await setDomainCacheMeta({
    domain: DOMAIN,
    orgId: ORG,
    schemaVersion: '3',
    lastSuccessfulCursor: { updatedAt: cursor },
    lastFullSyncAt: now,
    lastDeltaSyncAt: now,
    etag: null,
  });
}

beforeEach(async () => {
  await clearDomainCacheMeta(DOMAIN, ORG);
});

describe('syncDomainRows — truncated full fetch', () => {
  it('does not store a cursor when the full fetch was capped', async () => {
    const rows = [row('a', '2026-09-01T10:00:00Z'), row('b', '2026-09-01T09:00:00Z')];

    const result = await syncDomainRows<Row>({
      domain: DOMAIN,
      orgId: ORG,
      schemaVersion: '3',
      policy: POLICY,
      currentRows: [],
      getFull: async () => ({ rows, truncated: true }),
      getDelta: async () => {
        throw new Error('delta must not run on a full sync');
      },
      merge: (existing) => existing,
    });

    expect(result).toEqual(rows);
    const meta = await getDomainCacheMeta(DOMAIN, ORG);
    // A cursor here would skip every row cut off by the cap, permanently.
    expect(meta?.lastSuccessfulCursor).toBeNull();
  });

  it('clears a pre-existing cursor when the full fetch was capped', async () => {
    // Regression: upsert used `params.cursor ?? current.cursor`, so passing null
    // preserved the stale cursor instead of clearing it — the truncation guard
    // silently did nothing for the users who already had a poisoned cursor.
    await seedFreshDeltaMeta('2026-09-01T08:00:00Z');
    const rows = [row('a', '2026-09-01T10:00:00Z')];

    await syncDomainRows<Row>({
      domain: DOMAIN,
      orgId: ORG,
      schemaVersion: '3',
      policy: POLICY,
      currentRows: [],
      getFull: async () => ({ rows, truncated: true }),
      getDelta: async () => {
        throw new Error('delta must not run on a full sync');
      },
      merge: (existing) => existing,
    });

    const meta = await getDomainCacheMeta(DOMAIN, ORG);
    expect(meta?.lastSuccessfulCursor).toBeNull();
  });

  it('stores max(updated_at) as the cursor when the fetch was complete', async () => {
    const rows = [row('a', '2026-09-01T10:00:00Z'), row('b', '2026-09-01T09:00:00Z')];

    await syncDomainRows<Row>({
      domain: DOMAIN,
      orgId: ORG,
      schemaVersion: '3',
      policy: POLICY,
      currentRows: [],
      getFull: async () => ({ rows, truncated: false }),
      getDelta: async () => {
        throw new Error('delta must not run on a full sync');
      },
      merge: (existing) => existing,
    });

    const meta = await getDomainCacheMeta(DOMAIN, ORG);
    expect(meta?.lastSuccessfulCursor).toEqual({ updatedAt: '2026-09-01T10:00:00Z' });
  });

  it('accepts a bare array from getFull as a complete fetch', async () => {
    const rows = [row('a', '2026-09-01T10:00:00Z')];

    const result = await syncDomainRows<Row>({
      domain: DOMAIN,
      orgId: ORG,
      schemaVersion: '3',
      policy: POLICY,
      currentRows: [],
      getFull: async () => rows,
      getDelta: async () => {
        throw new Error('delta must not run on a full sync');
      },
      merge: (existing) => existing,
    });

    expect(result).toEqual(rows);
    const meta = await getDomainCacheMeta(DOMAIN, ORG);
    expect(meta?.lastSuccessfulCursor).toEqual({ updatedAt: '2026-09-01T10:00:00Z' });
  });
});

describe('syncDomainRows — count reconciliation', () => {
  it('resyncs in full when the merged list is short of the server count', async () => {
    await seedFreshDeltaMeta('2026-09-01T12:00:00Z');
    const cached = [row('a', '2026-09-01T11:00:00Z')];
    const serverRows = [
      row('a', '2026-09-01T11:00:00Z'),
      row('missed', '2026-09-01T10:00:00Z'),
      row('c', '2026-09-01T09:00:00Z'),
    ];
    const getFull = jest.fn(async () => ({ rows: serverRows, truncated: false }));

    const result = await syncDomainRows<Row>({
      domain: DOMAIN,
      orgId: ORG,
      schemaVersion: '3',
      policy: POLICY,
      currentRows: cached,
      getFull,
      // Delta reports nothing new — the pre-fix path would serve the short list.
      getDelta: async () => ({ changed: [], deletedIds: [], nextCursor: null }),
      merge: (existing) => existing,
      getServerCount: async () => 3,
    });

    expect(getFull).toHaveBeenCalledTimes(1);
    expect(result.map((r) => r.id)).toContain('missed');
  });

  it('keeps the delta result when the count agrees', async () => {
    await seedFreshDeltaMeta('2026-09-01T12:00:00Z');
    const cached = [row('a', '2026-09-01T11:00:00Z')];
    const getFull = jest.fn(async () => ({ rows: [], truncated: false }));

    const result = await syncDomainRows<Row>({
      domain: DOMAIN,
      orgId: ORG,
      schemaVersion: '3',
      policy: POLICY,
      currentRows: cached,
      getFull,
      getDelta: async () => ({ changed: [], deletedIds: [], nextCursor: null }),
      merge: (existing) => existing,
      getServerCount: async () => 1,
    });

    expect(getFull).not.toHaveBeenCalled();
    expect(result).toEqual(cached);
  });

  it('does not resync when the cache is longer than the live-row floor', async () => {
    // The full fetch also returns soft-deleted rows, so a cache can legitimately
    // exceed the live count. Treating the count as exact would resync forever.
    await seedFreshDeltaMeta('2026-09-01T12:00:00Z');
    const cached = [
      row('a', '2026-09-01T11:00:00Z'),
      row('b', '2026-09-01T10:00:00Z'),
      row('soft-deleted-but-still-cached', '2026-09-01T09:00:00Z'),
    ];
    const getFull = jest.fn(async () => ({ rows: [], truncated: false }));

    const result = await syncDomainRows<Row>({
      domain: DOMAIN,
      orgId: ORG,
      schemaVersion: '3',
      policy: POLICY,
      currentRows: cached,
      getFull,
      getDelta: async () => ({ changed: [], deletedIds: [], nextCursor: null }),
      merge: (existing) => existing,
      getServerCount: async () => 2,
    });

    expect(getFull).not.toHaveBeenCalled();
    expect(result).toEqual(cached);
  });

  it('resyncs when the cache falls below the live-row floor by one', async () => {
    await seedFreshDeltaMeta('2026-09-01T12:00:00Z');
    const cached = [row('a', '2026-09-01T11:00:00Z')];
    const serverRows = [row('a', '2026-09-01T11:00:00Z'), row('b', '2026-09-01T10:00:00Z')];
    const getFull = jest.fn(async () => ({ rows: serverRows, truncated: false }));

    const result = await syncDomainRows<Row>({
      domain: DOMAIN,
      orgId: ORG,
      schemaVersion: '3',
      policy: POLICY,
      currentRows: cached,
      getFull,
      getDelta: async () => ({ changed: [], deletedIds: [], nextCursor: null }),
      merge: (existing) => existing,
      getServerCount: async () => 2,
    });

    expect(getFull).toHaveBeenCalledTimes(1);
    expect(result.map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('skips the count check when the cached list sits at the fetch cap', async () => {
    await seedFreshDeltaMeta('2026-09-01T12:00:00Z');
    const cached = [row('a', '2026-09-01T11:00:00Z'), row('b', '2026-09-01T10:00:00Z')];
    const getFull = jest.fn(async () => ({ rows: [], truncated: false }));

    const result = await syncDomainRows<Row>({
      domain: DOMAIN,
      orgId: ORG,
      schemaVersion: '3',
      policy: POLICY,
      currentRows: cached,
      getFull,
      getDelta: async () => ({ changed: [], deletedIds: [], nextCursor: null }),
      merge: (existing) => existing,
      getServerCount: async () => 500,
      fullFetchCap: 2,
    });

    // At the cap a short list is expected; resyncing here would loop every sync.
    expect(getFull).not.toHaveBeenCalled();
    expect(result).toEqual(cached);
  });

  it('does not resync when a failed count throws', async () => {
    await seedFreshDeltaMeta('2026-09-01T12:00:00Z');
    const cached = [row('a', '2026-09-01T11:00:00Z')];
    const getFull = jest.fn(async () => ({ rows: [], truncated: false }));

    const result = await syncDomainRows<Row>({
      domain: DOMAIN,
      orgId: ORG,
      schemaVersion: '3',
      policy: POLICY,
      currentRows: cached,
      getFull,
      getDelta: async () => ({ changed: [], deletedIds: [], nextCursor: null }),
      merge: (existing) => existing,
      getServerCount: async () => {
        throw new Error('offline');
      },
    });

    expect(getFull).not.toHaveBeenCalled();
    expect(result).toEqual(cached);
  });

  it('honours a server-requested full sync', async () => {
    await seedFreshDeltaMeta('2026-09-01T12:00:00Z');
    const serverRows = [row('a', '2026-09-01T11:00:00Z')];
    const getFull = jest.fn(async () => ({ rows: serverRows, truncated: false }));

    const result = await syncDomainRows<Row>({
      domain: DOMAIN,
      orgId: ORG,
      schemaVersion: '3',
      policy: POLICY,
      currentRows: [row('stale', '2026-09-01T01:00:00Z')],
      getFull,
      getDelta: async () => ({
        changed: [],
        deletedIds: [],
        nextCursor: null,
        fullSyncRequired: true,
      }),
      merge: (existing) => existing,
    });

    expect(getFull).toHaveBeenCalledTimes(1);
    expect(result).toEqual(serverRows);
  });
});
