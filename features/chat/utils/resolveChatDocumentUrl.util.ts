/**
 * Resolves a Supabase storage path to a time-limited HTTPS URL for chat document_share messages.
 * Driver POD/trip photos live in `trip-documents`; dispatcher-shared org docs may use `documents`.
 *
 * Uses sequential bucket tries (stops on first success) + 50-min in-memory TTL cache.
 * Signed URLs are valid for 60 min; caching at 50 min avoids serving an about-to-expire URL.
 */
import { supabase } from '@/lib/supabase';

const SIGNED_EXPIRY_SEC = 3600;
const CACHE_TTL_MS = 50 * 60 * 1000;

const BUCKET_TRY_ORDER = ['trip-documents', 'documents', 'pod-documents'] as const;

const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();

/**
 * Session-scoped blob URL cache.
 * Keyed by storage path; values are never revoked so callers don't need to
 * manage lifetime — the URLs live until the JS runtime is torn down (app close
 * or page reload). This prevents re-downloading the same image binary every
 * time a DocumentShareCard mounts or its parent re-renders.
 */
const blobUrlCache = new Map<string, string>();

/** Cache for transformed (thumbnail) signed URLs, keyed by `${path}:${width}x${height}q${quality}`. */
const thumbUrlCache = new Map<string, { url: string; expiresAt: number }>();

function thumbCacheKey(path: string, width: number, height: number, quality: number): string {
  return `${path}:${width}x${height}q${quality}`;
}

/** Strip accidental bucket prefix so createSignedUrl targets the object key inside the bucket. */
export function normalizeTripDocumentsStoragePath(raw: string): string {
  let path = String(raw ?? '').trim();
  if (!path || /^https?:\/\//i.test(path)) return path;
  const stripped = path.replace(/^\/*/, '');
  if (stripped.startsWith('trip-documents/')) return stripped.slice('trip-documents/'.length);
  if (stripped.startsWith('documents/')) return stripped.slice('documents/'.length);
  if (stripped.startsWith('pod-documents/')) return stripped.slice('pod-documents/'.length);
  return path;
}

/** Synchronous read of a valid cached signed URL — safe during render (no Supabase client I/O). */
export function peekChatDocumentSignedUrl(storagePath: string): string | null {
  const raw = String(storagePath ?? "").trim();
  if (/^https?:\/\//i.test(raw)) return raw;
  const path = normalizeTripDocumentsStoragePath(raw);
  if (!path) return null;
  const cached = signedUrlCache.get(path);
  if (cached && Date.now() < cached.expiresAt) return cached.url;
  return null;
}

export async function resolveChatDocumentStorageUrl(storagePath: string): Promise<string | null> {
  const path = normalizeTripDocumentsStoragePath(String(storagePath ?? '').trim());
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;

  const cached = signedUrlCache.get(path);
  if (cached && Date.now() < cached.expiresAt) return cached.url;

  let lastError: string | null = null;

  for (const bucket of BUCKET_TRY_ORDER) {
    try {
      const { data, error } = await supabase().storage.from(bucket).createSignedUrl(path, SIGNED_EXPIRY_SEC);
      if (!error && data?.signedUrl) {
        signedUrlCache.set(path, { url: data.signedUrl, expiresAt: Date.now() + CACHE_TTL_MS });
        return data.signedUrl;
      }
      if (error) lastError = error.message ?? lastError;
    } catch {
      // try next bucket
    }
  }

  // Fallback: trip-documents may still yield a public URL if bucket is public
  const { data: pub } = supabase().storage.from('trip-documents').getPublicUrl(path);
  if (pub?.publicUrl?.startsWith('http')) {
    return pub.publicUrl;
  }

  if (__DEV__ && lastError) {
    console.warn('[resolveChatDocumentStorageUrl]', path, lastError);
  }
  return null;
}

/**
 * Downloads the object with the authenticated Supabase client and returns a blob: URL.
 * Use for inline preview on web when `<Image source={{ uri: signedUrl }}>` is blocked by CORS.
 * Caller must revoke the URL when unmounting.
 */
export async function tryChatDocumentBlobObjectUrl(
  storagePath: string,
): Promise<{ url: string; revoke: () => void } | null> {
  const path = normalizeTripDocumentsStoragePath(String(storagePath ?? '').trim());
  if (!path || /^https?:\/\//i.test(path)) return null;
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    return null;
  }

  // Return cached blob URL — avoids re-downloading the same binary on every
  // component mount or parent re-render.
  const cached = blobUrlCache.get(path);
  if (cached) {
    return { url: cached, revoke: () => {} };
  }

  const dlResults = await Promise.allSettled(
    BUCKET_TRY_ORDER.map((bucket) => supabase().storage.from(bucket).download(path))
  );
  for (const result of dlResults) {
    if (result.status === 'fulfilled' && !result.value.error && result.value.data) {
      const url = URL.createObjectURL(result.value.data);
      blobUrlCache.set(path, url);
      return { url, revoke: () => {} };
    }
  }
  return null;
}

/**
 * Resolve a Supabase Image Transformation URL for a chat document image.
 * Returns a signed URL with resize applied — never loads the original binary.
 * Falls back to the full signed URL if the transform endpoint fails.
 *
 * Used by OptimizedChatImage / ChatImage (default 300×300 @ q70).
 * The transform is handled server-side by Supabase's imgproxy integration.
 */
/**
 * Instant read of a cached transformed URL — use for initial React state so the
 * first paint does not schedule an effect-only network round-trip.
 */
export function peekChatImageThumbnailUrl(
  storagePath: string,
  width = 300,
  height = 300,
  quality = 70,
): string | null {
  const raw = String(storagePath ?? "").trim();
  if (/^https?:\/\//i.test(raw)) return raw;
  const path = normalizeTripDocumentsStoragePath(raw);
  if (!path) return null;
  const cacheKey = thumbCacheKey(path, width, height, quality);
  const cached = thumbUrlCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) return cached.url;
  return null;
}

export async function resolveChatImageThumbnail(
  storagePath: string,
  width  = 300,
  height = 300,
  quality = 70,
): Promise<string | null> {
  const path = normalizeTripDocumentsStoragePath(String(storagePath ?? '').trim());
  if (!path || /^https?:\/\//i.test(path)) return storagePath || null;

  const cacheKey = thumbCacheKey(path, width, height, quality);
  const cached = thumbUrlCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) return cached.url;

  for (const bucket of BUCKET_TRY_ORDER) {
    try {
      const { data, error } = await supabase()
        .storage
        .from(bucket)
        .createSignedUrl(path, SIGNED_EXPIRY_SEC, {
          transform: {
            width,
            height,
            quality,
            resize: 'cover',
          },
        });
      if (!error && data?.signedUrl) {
        thumbUrlCache.set(cacheKey, { url: data.signedUrl, expiresAt: Date.now() + CACHE_TTL_MS });
        return data.signedUrl;
      }
    } catch {
      // try next bucket
    }
  }

  // Fallback: return the full signed URL if transforms are not available.
  return resolveChatDocumentStorageUrl(storagePath);
}

/**
 * Large preview / lightbox: CDN transform with a generous max edge so we avoid
 * pulling the full original binary when imgproxy is available.
 */
export async function resolveChatImageFullDisplayUrl(
  storagePath: string,
  maxEdge = 1280,
  quality = 80,
): Promise<string | null> {
  return resolveChatImageThumbnail(storagePath, maxEdge, maxEdge, quality);
}

/** Sync peek for the full-display transform cache slot. */
export function peekChatImageFullDisplayUrl(
  storagePath: string,
  maxEdge = 1280,
  quality = 80,
): string | null {
  return peekChatImageThumbnailUrl(storagePath, maxEdge, maxEdge, quality);
}

/**
 * Web fallback when signed URLs fail CORS on `<Image>` — same-origin fetch via JS often succeeds for viewing.
 */
export async function fetchSignedUrlAsObjectUrl(
  signedHttpsUrl: string,
): Promise<{ url: string; revoke: () => void } | null> {
  if (
    typeof fetch === 'undefined' ||
    typeof URL === 'undefined' ||
    typeof URL.createObjectURL !== 'function'
  ) {
    return null;
  }
  const u = String(signedHttpsUrl ?? '').trim();
  if (!/^https?:\/\//i.test(u)) return null;
  try {
    const res = await fetch(u);
    if (!res.ok) return null;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    return {
      url,
      revoke: () => {
        try {
          URL.revokeObjectURL(url);
        } catch {
          /* noop */
        }
      },
    };
  } catch {
    return null;
  }
}
