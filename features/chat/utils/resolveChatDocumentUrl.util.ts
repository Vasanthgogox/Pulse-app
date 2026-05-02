/**
 * Resolves a Supabase storage path to a time-limited HTTPS URL for chat document_share messages.
 * Driver POD/trip photos live in `trip-documents`; dispatcher-shared org docs may use `documents`.
 *
 * Complexity: O(buckets) — typically 3 tries.
 */
import { supabase } from '@/lib/supabase';

const SIGNED_EXPIRY_SEC = 3600;

const BUCKET_TRY_ORDER = ['trip-documents', 'documents', 'pod-documents'] as const;

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

export async function resolveChatDocumentStorageUrl(storagePath: string): Promise<string | null> {
  const path = normalizeTripDocumentsStoragePath(String(storagePath ?? '').trim());
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;

  let lastError: string | null = null;

  for (const bucket of BUCKET_TRY_ORDER) {
    const { data, error } = await supabase()
      .storage.from(bucket)
      .createSignedUrl(path, SIGNED_EXPIRY_SEC);
    if (!error && data?.signedUrl) {
      return data.signedUrl;
    }
    lastError = error?.message ?? lastError;
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

  for (const bucket of BUCKET_TRY_ORDER) {
    const { data, error } = await supabase().storage.from(bucket).download(path);
    if (!error && data) {
      const url = URL.createObjectURL(data);
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
    }
  }
  return null;
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
