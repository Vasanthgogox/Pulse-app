import { getIdentityDb } from '@/lib/supabase';

const AVATAR_BUCKET = 'userprofiles';
const LEGACY_AVATAR_BUCKET = 'avatars';
/** Public bucket + path prefix for org logos (never signed) — mirrors Core `lib/avatarUpload.ts`. */
const PUBLIC_ORG_ASSET_BUCKET = 'org-assets';
const PUBLIC_ORG_LOGO_PREFIX = 'org-logos/';
const SIGNED_URL_EXPIRY_SEC = 3600;
const SIGNED_URL_CACHE_MS = 55 * 60 * 1000;

const signedUrlCache = new Map<string, { url: string | null; expiresAt: number }>();

const PARTY_AVATAR_COLORS = [
  '#EEF2FF',
  '#E0E7FF',
  '#ECFEFF',
  '#E0F2FE',
  '#ECFDF5',
  '#F0FDF4',
  '#FEF3C7',
  '#FFF7ED',
  '#F3F4F6',
  '#E5E7EB',
];

/** Max 2 chars — aligned with Core `partyInitialsFromName`. */
export function initialsFromName(name: string): string {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return '—';
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0]![0]! + words[words.length - 1]![0]!).toUpperCase().slice(0, 2);
  }
  return trimmed.slice(0, 2).toUpperCase();
}

/** Deterministic background — aligned with Core `partyAvatarBackgroundColor`. */
export function avatarBackgroundColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return PARTY_AVATAR_COLORS[hash % PARTY_AVATAR_COLORS.length]!;
}

function avatarInkColor(background: string): string {
  const hex = background.replace('#', '');
  if (hex.length !== 6) return '#1e293b';
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? '#1e293b' : '#ffffff';
}

export function avatarInitialsStyle(seed: string): { backgroundColor: string; color: string } {
  const backgroundColor = avatarBackgroundColor(seed);
  return { backgroundColor, color: avatarInkColor(backgroundColor) };
}

/** Public URL for an `org-logos/...` path. Never signs. */
function publicOrgLogoUrl(path: string): string | null {
  const db = getIdentityDb();
  if (!db) return null;
  return db.storage.from(PUBLIC_ORG_ASSET_BUCKET).getPublicUrl(path).data.publicUrl;
}

async function createSignedUrl(bucket: string, path: string): Promise<string | null> {
  const db = getIdentityDb();
  if (!db) return null;
  const { data, error } = await db.storage.from(bucket).createSignedUrl(path, SIGNED_URL_EXPIRY_SEC);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

/** Resolve private storage path to signed URL (Core `userprofiles` bucket). */
export async function getSignedAvatarUrl(path: string): Promise<string | null> {
  const cacheKey = path.trim();
  if (!cacheKey) return null;

  // Org logos live in the PUBLIC `org-assets` bucket (`org-logos/<orgId>/...`).
  // Signing them probed `userprofiles` then `avatars` — neither holds the object, so
  // every call was two guaranteed 400s. getPublicUrl is a pure string builder: no network.
  if (cacheKey.startsWith(PUBLIC_ORG_LOGO_PREFIX)) {
    return publicOrgLogoUrl(cacheKey);
  }

  const cached = signedUrlCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.url;
  }

  const primary = await createSignedUrl(AVATAR_BUCKET, cacheKey);
  if (primary) {
    signedUrlCache.set(cacheKey, { url: primary, expiresAt: Date.now() + SIGNED_URL_CACHE_MS });
    return primary;
  }

  const legacy = await createSignedUrl(LEGACY_AVATAR_BUCKET, cacheKey);
  signedUrlCache.set(cacheKey, {
    url: legacy,
    expiresAt: Date.now() + SIGNED_URL_CACHE_MS,
  });
  return legacy;
}

export async function resolveUserAvatarUri(options: {
  avatarUrl?: string | null;
  avatarSeed?: string | null;
}): Promise<string | null> {
  const rawUrl = (options.avatarUrl ?? '').trim();
  if (rawUrl) {
    if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
      return rawUrl;
    }
    return getSignedAvatarUrl(rawUrl);
  }

  const seed = (options.avatarSeed ?? '').trim();
  if (!seed) return null;

  // Web fallback for Core avatar_seed presets (deterministic, no RN asset bundle).
  return `https://api.dicebear.com/7.x/notionists/png?seed=${encodeURIComponent(seed)}&size=128`;
}
