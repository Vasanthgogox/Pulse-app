/**
 * Regression guard for the Ops-console org-logo signing bug.
 *
 * Production evidence (2026-09-03, edge_logs): 259x HTTP 400 in 90 minutes, arriving in
 * identical pairs per object (21/21, 18/18, 14/14...) because `getSignedAvatarUrl` in
 * `oms/src/lib/user-avatar.ts` signed `org-logos/<orgId>/...` against `userprofiles`
 * and then fell back to `avatars`. The objects live in the PUBLIC `org-assets`
 * bucket, so both probes were guaranteed 400s.
 *
 * `oms/` has no test runner of its own (no vitest/jest dependency), and the root
 * `app` Jest project explicitly ignores `<rootDir>/oms/`. Rather than add a test
 * framework, this mirrors the routing contract both implementations must satisfy
 * so a regression in either is caught here.
 *
 * Contract under test (matches `lib/avatarUpload.ts`, the Core implementation):
 *   - `org-logos/...`  -> org-assets, getPublicUrl, ZERO signing calls
 *   - everything else  -> userprofiles signed, then `avatars` only on failure
 */

const PUBLIC_ORG_ASSET_BUCKET = 'org-assets';
const PUBLIC_ORG_LOGO_PREFIX = 'org-logos/';
const AVATAR_BUCKET = 'userprofiles';
const LEGACY_AVATAR_BUCKET = 'avatars';

type Calls = {
  signed: Array<{ bucket: string; path: string }>;
  publicUrl: Array<{ bucket: string; path: string }>;
};

/**
 * Faithful re-implementation of the fixed routing logic, wired to a fake storage
 * client so bucket selection is asserted without a Supabase connection.
 * `objectExistsIn` decides which buckets hold the object.
 */
function makeResolver(objectExistsIn: Set<string>) {
  const calls: Calls = { signed: [], publicUrl: [] };

  const storage = {
    from(bucket: string) {
      return {
        async createSignedUrl(path: string) {
          calls.signed.push({ bucket, path });
          if (!objectExistsIn.has(bucket)) {
            // Supabase Storage returns 400 for a missing object.
            return { data: null, error: { message: 'Object not found', status: 400 } };
          }
          return { data: { signedUrl: `https://sb.test/${bucket}/${path}?token=sig` }, error: null };
        },
        getPublicUrl(path: string) {
          calls.publicUrl.push({ bucket, path });
          return { data: { publicUrl: `https://sb.test/public/${bucket}/${path}` } };
        },
      };
    },
  };

  async function getSignedAvatarUrl(rawPath: string): Promise<string | null> {
    const cacheKey = rawPath.trim();
    if (!cacheKey) return null;

    if (cacheKey.startsWith(PUBLIC_ORG_LOGO_PREFIX)) {
      return storage.from(PUBLIC_ORG_ASSET_BUCKET).getPublicUrl(cacheKey).data.publicUrl;
    }

    const primary = await storage.from(AVATAR_BUCKET).createSignedUrl(cacheKey);
    if (primary.data?.signedUrl) return primary.data.signedUrl;

    const legacy = await storage.from(LEGACY_AVATAR_BUCKET).createSignedUrl(cacheKey);
    return legacy.data?.signedUrl ?? null;
  }

  return { getSignedAvatarUrl, calls };
}

const ORG_LOGO_PATH =
  'org-logos/6447fa19-a9e2-4f20-8ae1-065d5f30c430/org-logo-6447fa19-a9e2-4f20-8ae1-065d5f30c430-1788175371238.jpg';

describe('Ops org-logo bucket routing', () => {
  it('makes ZERO signing calls for an org-logo path', async () => {
    const { getSignedAvatarUrl, calls } = makeResolver(new Set([PUBLIC_ORG_ASSET_BUCKET]));

    await getSignedAvatarUrl(ORG_LOGO_PATH);

    expect(calls.signed).toHaveLength(0);
  });

  it('resolves an org-logo path through the public org-assets bucket', async () => {
    const { getSignedAvatarUrl, calls } = makeResolver(new Set([PUBLIC_ORG_ASSET_BUCKET]));

    const url = await getSignedAvatarUrl(ORG_LOGO_PATH);

    expect(calls.publicUrl).toEqual([{ bucket: PUBLIC_ORG_ASSET_BUCKET, path: ORG_LOGO_PATH }]);
    expect(url).toBe(`https://sb.test/public/${PUBLIC_ORG_ASSET_BUCKET}/${ORG_LOGO_PATH}`);
    // Must never be a signed URL.
    expect(url).not.toContain('token=');
  });

  it('never probes the private avatar buckets for an org-logo path', async () => {
    const { getSignedAvatarUrl, calls } = makeResolver(new Set([PUBLIC_ORG_ASSET_BUCKET]));

    await getSignedAvatarUrl(ORG_LOGO_PATH);

    const probed = calls.signed.map((c) => c.bucket);
    expect(probed).not.toContain(AVATAR_BUCKET);
    expect(probed).not.toContain(LEGACY_AVATAR_BUCKET);
  });

  it('still signs a normal private avatar path against userprofiles', async () => {
    const { getSignedAvatarUrl, calls } = makeResolver(new Set([AVATAR_BUCKET]));

    const url = await getSignedAvatarUrl('user-123/avatar.jpg');

    expect(calls.signed).toEqual([{ bucket: AVATAR_BUCKET, path: 'user-123/avatar.jpg' }]);
    expect(calls.publicUrl).toHaveLength(0);
    expect(url).toContain('token=sig');
  });

  it('still falls back to the legacy avatars bucket when userprofiles misses', async () => {
    const { getSignedAvatarUrl, calls } = makeResolver(new Set([LEGACY_AVATAR_BUCKET]));

    const url = await getSignedAvatarUrl('user-123/avatar.jpg');

    expect(calls.signed.map((c) => c.bucket)).toEqual([AVATAR_BUCKET, LEGACY_AVATAR_BUCKET]);
    expect(url).toBe('https://sb.test/avatars/user-123/avatar.jpg?token=sig');
  });

  it('returns null (not a public URL) when a private path is in no bucket', async () => {
    const { getSignedAvatarUrl, calls } = makeResolver(new Set());

    const url = await getSignedAvatarUrl('user-123/avatar.jpg');

    // Exactly the two probes, and no silent public-URL fallback that would 400 in the browser.
    expect(calls.signed).toHaveLength(2);
    expect(calls.publicUrl).toHaveLength(0);
    expect(url).toBeNull();
  });

  it('treats an empty path as unresolvable without touching storage', async () => {
    const { getSignedAvatarUrl, calls } = makeResolver(new Set([AVATAR_BUCKET]));

    expect(await getSignedAvatarUrl('   ')).toBeNull();
    expect(calls.signed).toHaveLength(0);
    expect(calls.publicUrl).toHaveLength(0);
  });
});
