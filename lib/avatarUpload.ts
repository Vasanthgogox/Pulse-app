/**
 * Profile avatar upload and signed URL resolution for private bucket.
 * Bucket is private: we store the storage path in profile.avatar_url and resolve to signed URLs for display.
 * Storage bucket must exist in Supabase (e.g. "avatars") with RLS allowing authenticated users
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

export const AVATAR_BUCKET = 'avatars';
const MAX_SIZE = 512;
const QUALITY = 0.85;
/** Signed URL expiry (seconds). Refresh before expiry when displaying. */
const SIGNED_URL_EXPIRY_SEC = 3600;

export interface PickAndUploadAvatarResult {
  /** Storage path to store in profile.avatar_url (e.g. "userId/avatar.jpg"). */
  path: string | null;
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
      return { path: null, error: new Error('Permission to access photos is required') };
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });

    if (result.canceled || !result.assets?.[0]) {
      return { path: null, error: null };
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

    const path = `${userId}/avatar.jpg`;
    // In React Native, fetch(fileUri) + response.blob() often yields an empty blob for file:// URIs.
    // Use expo-file-system File.arrayBuffer() so the uploaded file has real bytes.
    const file = new File(uri);
    const arrayBuffer = await file.arrayBuffer();
    if (!arrayBuffer || arrayBuffer.byteLength === 0) {
      return { path: null, error: new Error('Could not read image file') };
    }
    const { error } = await supabase().storage.from(AVATAR_BUCKET).upload(path, arrayBuffer, {
      contentType: 'image/jpeg',
      upsert: true,
    });

    if (error) {
      const msg = error.message || 'Upload failed';
      const isRls = /row-level security|policy|rls/i.test(msg);
      return {
        path: null,
        error: new Error(
          isRls
            ? 'Storage permissions blocked. Your admin needs to add RLS policies for the avatars bucket (see docs/AVATAR_STORAGE_RLS.md).'
            : msg
        ),
      };
    }

    return { path, error: null };
  } catch (e) {
    return {
      path: null,
      error: e instanceof Error ? e : new Error('Failed to pick or upload photo'),
    };
  }
}

/**
 * Normalize avatar path: if DB stores only the user id (no slash), the file is at {id}/avatar.jpg.
 */
function normalizeAvatarPath(path: string): string {
  const p = path.trim();
  if (!p) return p;
  if (p.includes('/')) return p;
  return `${p}/avatar.jpg`;
}

/**
 * Get a signed URL for an avatar storage path (private bucket).
 * Returns null if path is empty or signed URL fails.
 * Accepts path as "userId" or "userId/avatar.jpg".
 */
export async function getSignedAvatarUrl(path: string): Promise<string | null> {
  const normalized = normalizeAvatarPath(path);
  if (!normalized) return null;
  const { data, error } = await supabase()
    .storage
    .from(AVATAR_BUCKET)
    .createSignedUrl(normalized, SIGNED_URL_EXPIRY_SEC);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
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
