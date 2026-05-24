/**
 * useAvatar — context-aware profile picture hook.
 *
 * Rules (no exceptions):
 *   Driver                → their uploaded photo, or initials
 *   Organization          → company logo, or initials
 *   User (personal)       → their uploaded photo, or initials
 *   User (business)       → org logo, then their own photo, or initials
 *
 * NO random preset avatars. If no real photo is found → initials only.
 * Signed URLs are resolved async; initials render immediately as placeholder.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AVATAR_BUCKET,
  LEGACY_AVATAR_BUCKET,
  extractPathFromStorageUrl,
  getSignedAvatarUrl,
} from '@/lib/avatarUpload';

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `personal`           → internal (profile page, account settings, team chat)
 * `representing_company` → external (dispatch cards, invoices, B2B network, customer chat)
 */
export type AvatarContext = 'personal' | 'representing_company';

/**
 * Direct party — a driver/courier. Always shows their own photo.
 */
export type DriverParty = {
  type: 'driver';
  name: string;
  /** profile.avatar_url — Supabase storage path or full URL */
  avatarUrl?: string | null;
};

/**
 * A company / fleet operator. Always shows the company logo.
 */
export type OrgParty = {
  type: 'organization';
  name: string;
  /** organizations.logo_url — Supabase storage path or full URL */
  logoUrl?: string | null;
  /**
   * Org owner's profile.avatar_url — used as secondary fallback when no logo.
   * (Not a preset — this is their actual uploaded photo.)
   */
  ownerAvatarUrl?: string | null;
};

/**
 * A dispatcher / admin / employee.
 * `personal` context  → their own photo
 * `representing_company` → org logo → their own photo → initials
 */
export type UserParty = {
  type: 'user';
  name: string;
  /** profile.avatar_url */
  avatarUrl?: string | null;
  /** organizations.logo_url — populate when user may represent the company */
  orgLogoUrl?: string | null;
  /** org owner's profile.avatar_url — secondary fallback for business context */
  orgOwnerAvatarUrl?: string | null;
};

export type AvatarParty = DriverParty | OrgParty | UserParty;

export type UseAvatarResult = {
  /** Resolved signed URL, or null when no photo found → render initials */
  imageUri: string | null;
  /** True while the async URL resolution is in flight */
  loading: boolean;
  /** 1–2 uppercase chars derived from name */
  initials: string;
  /** Deterministic background colour for the initials circle */
  initialsColor: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Internals
// ─────────────────────────────────────────────────────────────────────────────

const INITIALS_PALETTE = [
  '#4F46E5', // indigo
  '#0891B2', // cyan
  '#059669', // emerald
  '#D97706', // amber
  '#DC2626', // red
  '#7C3AED', // violet
  '#DB2777', // pink
  '#0284C7', // sky
  '#65A30D', // lime
  '#EA580C', // orange
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

function deriveInitials(name: string): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

function deriveInitialsColor(name: string): string {
  return INITIALS_PALETTE[hash(name || '?') % INITIALS_PALETTE.length]!;
}

/**
 * Given a raw storage path or URL, return a displayable signed URL.
 * Returns null if the input is empty or resolution fails — callers show initials.
 */
async function resolvePhotoUrl(raw: string | null | undefined): Promise<string | null> {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return null;

  // Already a full URL
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    const ref = extractPathFromStorageUrl(trimmed);
    if (!ref) return trimmed; // fully public URL — use as-is
    if (ref.bucket !== AVATAR_BUCKET && ref.bucket !== LEGACY_AVATAR_BUCKET) {
      return trimmed; // different (likely public) bucket
    }
    // Private Supabase avatar bucket → sign it
    try {
      return await getSignedAvatarUrl(ref.path);
    } catch {
      return null;
    }
  }

  // Bare storage path
  try {
    return await getSignedAvatarUrl(trimmed);
  } catch {
    return null;
  }
}

/**
 * Ordered list of raw URLs to try for this party + context.
 * The first non-null resolved URL wins. No presets — only real photos.
 */
function rawUrlCandidates(party: AvatarParty, context: AvatarContext): Array<string | null | undefined> {
  switch (party.type) {
    case 'driver':
      return [party.avatarUrl];

    case 'organization':
      return [party.logoUrl, party.ownerAvatarUrl];

    case 'user':
      if (context === 'representing_company') {
        // Org logo first, then personal photo
        return [party.orgLogoUrl, party.orgOwnerAvatarUrl, party.avatarUrl];
      }
      return [party.avatarUrl];
  }
}

/**
 * Collapse the candidate list into a single stable cache key string.
 * Changing this string triggers a new async resolution.
 */
function cacheKey(party: AvatarParty, context: AvatarContext): string {
  return rawUrlCandidates(party, context)
    .map((u) => (u ?? '').trim())
    .join('|');
}

// ─────────────────────────────────────────────────────────────────────────────
// The hook
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve the correct profile picture for a party in the given context.
 *
 * @example — driver card
 * const { imageUri, loading, initials, initialsColor } = useAvatar(
 *   { type: 'driver', name: 'Ahmed', avatarUrl: driver.avatar_url },
 * );
 *
 * @example — dispatcher acting on behalf of their company (shows org logo)
 * const { imageUri, initials, initialsColor } = useAvatar(
 *   { type: 'user', name: 'Nihas N', avatarUrl: profile.avatar_url,
 *     orgLogoUrl: org.logo_url },
 *   'representing_company',
 * );
 */
export function useAvatar(
  party: AvatarParty,
  context: AvatarContext = 'personal',
): UseAvatarResult {
  const key = useMemo(() => cacheKey(party, context), [
    // eslint-disable-next-line react-hooks/exhaustive-deps
    party.type, party.name,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    ...rawUrlCandidates(party, context).map((u) => u ?? ''),
    context,
  ]);

  const [imageUri, setImageUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const prevKey = useRef<string>('');

  useEffect(() => {
    if (prevKey.current === key) return;
    prevKey.current = key;

    const candidates = rawUrlCandidates(party, context).filter(
      (u): u is string => typeof u === 'string' && u.trim().length > 0,
    );

    if (candidates.length === 0) {
      setImageUri(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setImageUri(null);

    // Try candidates in order — first successful resolution wins.
    (async () => {
      for (const raw of candidates) {
        const resolved = await resolvePhotoUrl(raw);
        if (cancelled) return;
        if (resolved) {
          setImageUri(resolved);
          setLoading(false);
          return;
        }
      }
      // All candidates failed → show initials
      setImageUri(null);
      setLoading(false);
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return {
    imageUri,
    loading,
    initials: deriveInitials(party.name),
    initialsColor: deriveInitialsColor(party.name),
  };
}
