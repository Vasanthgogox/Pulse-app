/**
 * Profile avatar upload and signed URL resolution for private bucket.
 * Bucket is private: we store the storage path in profile.avatar_url and resolve to signed URLs for display.
 * Storage bucket must exist in Supabase (e.g. "userprofiles") with RLS allowing authenticated users
 * to upload/update their own path: {user_id}/avatar.jpg
 */
import { getAvatarUriForSeed } from '@/constants/DriverLevels';
import { useAuth } from '@/contexts/AuthContext';
import { useDriverAvatar } from '@/contexts/DriverAvatarContext';
import { supabase } from '@/lib/supabase';
import { File } from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useState } from 'react';

export const AVATAR_BUCKET = 'userprofiles';
export const LEGACY_AVATAR_BUCKET = 'avatars';
const MAX_SIZE = 512;
const QUALITY = 0.85;
/** Signed URL expiry (seconds). Refresh before expiry when displaying. */
const SIGNED_URL_EXPIRY_SEC = 3600;
const SIGNED_URL_CACHE_MS = 55 * 60 * 1000;
const signedAvatarUrlCache = new Map<string, { url: string; expiresAt: number }>();

function base64ToUint8Array(base64: string): Uint8Array {
  const normalized = base64.replace(/\s/g, '');
  if (typeof globalThis.atob === 'function') {
    const binary = globalThis.atob(normalized);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  const maybeBuffer = (globalThis as { Buffer?: { from: (value: string, enc: string) => Uint8Array } }).Buffer;
  if (maybeBuffer?.from) {
    return maybeBuffer.from(normalized, 'base64');
  }
  throw new Error('Base64 decoding is not available on this device');
}

export interface PickAndUploadAvatarResult {
  /** Storage path to store in profile.avatar_url (e.g. "userId/avatar.jpg"). */
  path: string | null;
  /** Local image uri for instant preview after successful upload. */
  previewUri?: string | null;
  error: Error | null;
}

/**
 * Request media library permission, pick an image, resize, upload to private Storage bucket.
 * Returns the storage path; caller should call authService.updateProfile({ avatar_url: path }).
 */
export async function pickAndUploadAvatar(userId: string): Promise<PickAndUploadAvatarResult> {
  try {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      return { path: null, previewUri: null, error: new Error('Permission to access photos is required') };
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
      base64: true,
    });

    if (result.canceled || !result.assets?.[0]) {
      return { path: null, previewUri: null, error: null };
    }

    const asset = result.assets[0];
    let uri = asset.uri;

    try {
      const manipulated = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: MAX_SIZE, height: MAX_SIZE } }],
        { compress: QUALITY, format: ImageManipulator.SaveFormat.JPEG }
      );
      uri = manipulated.uri;
    } catch {
      // Keep original if resize fails
    }

    const path = `${userId}/avatar-${Date.now()}.jpg`;
    // Prefer ImagePicker base64 payload because it is stable across Expo runtimes.
    // Fallback to File.arrayBuffer() if base64 is unavailable on the current device.
    let uploadBytes: ArrayBuffer | Uint8Array | null = null;
    const base64 = typeof asset.base64 === 'string' ? asset.base64.trim() : '';
    if (base64) {
      uploadBytes = base64ToUint8Array(base64);
    } else {
      const file = new File(uri);
      uploadBytes = await file.arrayBuffer();
    }

    if (!uploadBytes || uploadBytes.byteLength === 0) {
      return { path: null, previewUri: null, error: new Error('Could not read image file') };
    }

    const { error } = await supabase().storage.from(AVATAR_BUCKET).upload(path, uploadBytes, {
      contentType: 'image/jpeg',
      upsert: false,
    });

    if (error) {
      const msg = error.message || 'Upload failed';
      const isRls = /row-level security|policy|rls/i.test(msg);
      // Log for debugging
      console.log("[Avatar Upload Error]", msg, "isRls:", isRls, "bucket:", AVATAR_BUCKET, "path:", path);
      return {
        path: null,
        previewUri: null,
        error: new Error(
          isRls
            ? `Storage permissions blocked for bucket "${AVATAR_BUCKET}" (path: "${path}"). Supabase says: ${msg}. Add/verify RLS policies in docs/AVATAR_STORAGE_RLS.md.`
            : msg
        ),
      };
    }

    return { path, previewUri: uri, error: null };
  } catch (e) {
    return {
      path: null,
      previewUri: null,
      error: e instanceof Error ? e : new Error('Failed to pick or upload photo'),
    };
  }
}

/**
 * Pick and upload an organization logo. Stores at orgs/{orgId}/logo-{timestamp}.jpg.
 * Returns storage path; caller should call updateOrganizationLogo(orgId, path).
 */
export async function pickAndUploadOrgLogo(orgId: string): Promise<PickAndUploadAvatarResult> {
  try {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      return { path: null, previewUri: null, error: new Error('Permission to access photos is required') };
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
      base64: true,
    });
    if (result.canceled || !result.assets?.[0]) {
      return { path: null, previewUri: null, error: null };
    }
    const asset = result.assets[0];
    let uri = asset.uri;
    try {
      const manipulated = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: MAX_SIZE, height: MAX_SIZE } }],
        { compress: QUALITY, format: ImageManipulator.SaveFormat.JPEG }
      );
      uri = manipulated.uri;
    } catch {
      // keep original if resize fails
    }
    const path = `orgs/${orgId}/logo-${Date.now()}.jpg`;
    let uploadBytes: ArrayBuffer | Uint8Array | null = null;
    const base64 = typeof asset.base64 === 'string' ? asset.base64.trim() : '';
    if (base64) {
      uploadBytes = base64ToUint8Array(base64);
    } else {
      const file = new File(uri);
      uploadBytes = await file.arrayBuffer();
    }
    if (!uploadBytes || uploadBytes.byteLength === 0) {
      return { path: null, previewUri: null, error: new Error('Could not read image file') };
    }
    const { error } = await supabase().storage.from(AVATAR_BUCKET).upload(path, uploadBytes, {
      contentType: 'image/jpeg',
      upsert: false,
    });
    if (error) {
      return { path: null, previewUri: null, error: new Error(error.message || 'Upload failed') };
    }
    return { path, previewUri: uri, error: null };
  } catch (e) {
    return { path: null, previewUri: null, error: e instanceof Error ? e : new Error('Failed to upload org logo') };
  }
}

/** Save the organization logo storage path to the organizations table. */
export async function updateOrganizationLogo(
  orgId: string,
  logoPath: string | null,
): Promise<{ error: Error | null }> {
  const { error } = await supabase()
    .from('organizations')
    .update({ logo_url: logoPath })
    .eq('id', orgId);
  return { error: error ? new Error(error.message) : null };
}

/** Image file extensions supported for avatar object discovery. */
const AVATAR_IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];

function hasImageExtension(name: string): boolean {
  const lower = name.toLowerCase();
  return AVATAR_IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

async function findLatestAvatarPathForUserFolder(
  bucket: string,
  userIdFolder: string
): Promise<string | null> {
  const folder = userIdFolder.trim();
  if (!folder) return null;

  const { data, error } = await supabase()
    .storage
    .from(bucket)
    .list(folder, {
      limit: 100,
      sortBy: { column: "updated_at", order: "desc" },
    });

  if (error || !Array.isArray(data) || data.length === 0) return null;

  const files = data.filter((entry) => {
    const name = (entry?.name ?? "").trim();
    return name.length > 0 && !name.endsWith("/") && hasImageExtension(name);
  });
  if (files.length === 0) return null;

  files.sort((a, b) => {
    const aTime = Date.parse(a.updated_at ?? a.created_at ?? "") || 0;
    const bTime = Date.parse(b.updated_at ?? b.created_at ?? "") || 0;
    return bTime - aTime;
  });

  const top = files[0]?.name?.trim();
  return top ? `${folder}/${top}` : null;
}

async function buildAvatarPathCandidates(path: string): Promise<string[]> {
  const p = path.trim();
  if (!p) return [];
  if (p.includes("/")) return [p];

  // Legacy records sometimes stored only the user-id folder in avatar_url.
  // In that case discover the newest image object under that folder first.
  const discoveredPrimary = await findLatestAvatarPathForUserFolder(AVATAR_BUCKET, p);
  const discoveredLegacy = await findLatestAvatarPathForUserFolder(LEGACY_AVATAR_BUCKET, p);
  const fallbackConventional = [`${p}/avatar.jpg`, `${p}/avatar.jpeg`, `${p}/avatar.png`];

  const deduped = new Set<string>();
  if (discoveredPrimary) deduped.add(discoveredPrimary);
  if (discoveredLegacy) deduped.add(discoveredLegacy);
  for (const candidate of fallbackConventional) deduped.add(candidate);
  return Array.from(deduped);
}

export function extractPathFromStorageUrl(
  rawUrl: string
): { bucket: string; path: string } | null {
  try {
    const parsed = new URL(rawUrl);
    const segments = parsed.pathname.split('/').filter(Boolean);
    const objectIdx = segments.indexOf('object');
    if (objectIdx < 0 || objectIdx + 2 >= segments.length) return null;
    const accessType = segments[objectIdx + 1]; // public | sign | authenticated
    if (!['public', 'sign', 'authenticated'].includes(accessType)) return null;
    const bucket = segments[objectIdx + 2] ?? '';
    const pathParts = segments.slice(objectIdx + 3);
    if (!bucket || pathParts.length === 0) return null;
    return {
      bucket,
      path: decodeURIComponent(pathParts.join('/')),
    };
  } catch {
    return null;
  }
}

/**
 * Synchronously resolve a storage path to a public URL.
 * Use this when the bucket is PUBLIC — no network round-trip needed.
 * Returns null if path is empty. Passes through full HTTP(S) URLs unchanged.
 */
export function resolveAvatarPublicUrl(path: string | null | undefined): string | null {
  const p = (path ?? '').trim();
  if (!p) return null;
  if (p.startsWith('http://') || p.startsWith('https://')) return p;
  const { data } = supabase().storage.from(AVATAR_BUCKET).getPublicUrl(p);
  return data?.publicUrl ?? null;
}

/**
 * Get a signed URL for an avatar storage path (private bucket).
 * Returns null if path is empty or signed URL fails.
 * Accepts path as "userId" or "userId/avatar.jpg".
 */
export async function getSignedAvatarUrl(path: string): Promise<string | null> {
  const cacheKey = path.trim();
  if (cacheKey) {
    const cached = signedAvatarUrlCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.url;
    }
  }

  const candidates = await buildAvatarPathCandidates(path);
  if (candidates.length === 0) return null;

  for (const candidate of candidates) {
    const primary = await supabase()
      .storage
      .from(AVATAR_BUCKET)
      .createSignedUrl(candidate, SIGNED_URL_EXPIRY_SEC);
    if (!primary.error && primary.data?.signedUrl) {
      const url = primary.data.signedUrl;
      if (cacheKey) {
        signedAvatarUrlCache.set(cacheKey, {
          url,
          expiresAt: Date.now() + SIGNED_URL_CACHE_MS,
        });
      }
      return url;
    }

    // If bucket is public or signed URL policy is unavailable, try public URL.
    const primaryPublic = supabase()
      .storage
      .from(AVATAR_BUCKET)
      .getPublicUrl(candidate);
    if (primaryPublic.data?.publicUrl) {
      return primaryPublic.data.publicUrl;
    }
  }

  // Backward compatibility: old avatars may still be in the previous bucket.
  for (const candidate of candidates) {
    const legacy = await supabase()
      .storage
      .from(LEGACY_AVATAR_BUCKET)
      .createSignedUrl(candidate, SIGNED_URL_EXPIRY_SEC);
    if (!legacy.error && legacy.data?.signedUrl) {
      const url = legacy.data.signedUrl;
      if (cacheKey) {
        signedAvatarUrlCache.set(cacheKey, {
          url,
          expiresAt: Date.now() + SIGNED_URL_CACHE_MS,
        });
      }
      return url;
    }
    const legacyPublic = supabase()
      .storage
      .from(LEGACY_AVATAR_BUCKET)
      .getPublicUrl(candidate);
    if (legacyPublic.data?.publicUrl) {
      return legacyPublic.data.publicUrl;
    }
  }

  return null;
}

/**
 * Resolve profile.avatar_url to a displayable URI: if it's a storage path, returns signed URL; if it's already http(s), returns as-is; otherwise uses preset avatar from seed.
 */
export function useDriverAvatarUri(): { avatarUri: string; loading: boolean } {
  const { profile } = useAuth();
  const { avatarSeed } = useDriverAvatar();
  const presetUri = getAvatarUriForSeed(avatarSeed);
  const [avatarUri, setAvatarUri] = useState(presetUri);
  const [loading, setLoading] = useState(false);

  const resolve = useCallback(async (avatarUrl: string | undefined) => {
    if (!avatarUrl?.trim()) {
      setAvatarUri(presetUri);
      return;
    }
    if (avatarUrl.startsWith('http://') || avatarUrl.startsWith('https://')) {
      const storageRef = extractPathFromStorageUrl(avatarUrl);
      // Backward compatibility: old profiles may store full storage URL instead of object path.
      if (storageRef && (storageRef.bucket === AVATAR_BUCKET || storageRef.bucket === LEGACY_AVATAR_BUCKET)) {
        setLoading(true);
        const signed = await getSignedAvatarUrl(storageRef.path);
        setAvatarUri(signed ?? presetUri);
        setLoading(false);
        return;
      }
      setAvatarUri(avatarUrl);
      return;
    }
    setLoading(true);
    const signed = await getSignedAvatarUrl(avatarUrl.trim());
    setAvatarUri(signed ?? presetUri);
    setLoading(false);
  }, [presetUri]);

  useEffect(() => {
    resolve(profile?.avatar_url);
  }, [profile?.avatar_url, resolve]);

  return { avatarUri: avatarUri || presetUri, loading };
}
