import { decideSyncMode } from '@/lib/cache/cacheMetadataStore';

describe('decideSyncMode', () => {
  const policy = { maxDeltaLagMs: 60_000, fullSyncEveryMs: 3600_000 };

  it('requires full sync when meta missing', () => {
    const mode = decideSyncMode({
      meta: null,
      schemaVersion: '1',
      policy,
      nowMs: Date.UTC(2026, 0, 1),
    });
    expect(mode.doFullSync).toBe(true);
  });

  it('allows delta when cursor and full sync are fresh', () => {
    const nowMs = Date.UTC(2026, 0, 1, 1, 0, 0);
    const mode = decideSyncMode({
      meta: {
        domain: 'trips',
        orgId: 'org-1',
        schemaVersion: '1',
        lastSuccessfulCursor: { updatedAt: '2026-01-01T00:58:00.000Z' },
        lastFullSyncAt: '2026-01-01T00:30:00.000Z',
        lastDeltaSyncAt: '2026-01-01T00:59:00.000Z',
        etag: null,
      },
      schemaVersion: '1',
      policy,
      nowMs,
    });
    expect(mode.doFullSync).toBe(false);
    expect(mode.reason).toBe('delta-ok');
  });
});
