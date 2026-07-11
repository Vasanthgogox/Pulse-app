/**
 * Driver pilot levels and preset avatars (reference: Qu Tactical Hub).
 * Used for Pilot Card, Rank Path Progression, and onboarding.
 * Preset avatars are 10 bundled driver icons in assets/drivers/.
 */

import { Asset } from 'expo-asset';
import { Image, Platform, type ImageSourcePropType } from 'react-native';

function absolutizeWebUri(uri: string): string {
  if (
    typeof window !== 'undefined' &&
    uri.startsWith('/') &&
    !uri.startsWith('//')
  ) {
    return `${window.location.origin}${uri}`;
  }
  return uri;
}

export const DEFAULT_DRIVER_AVATAR_SEED = 'driver-1';

export const LEVELS_CONFIG = [
  { level: 1, name: 'Initiate', goalText: 'Complete Signup', type: 'signup', target: 1, reward: 'Access Hub', tier: 'Bronze' },
  { level: 2, name: 'Novice', goalText: 'Complete 2 Trips', type: 'trips', target: 2, reward: 'Standard Trips', tier: 'Bronze' },
  { level: 3, name: 'Verified', goalText: 'Verify Identity', type: 'verification', target: 1, reward: 'Silver Status', tier: 'Silver' },
  { level: 4, name: 'Trusted', goalText: 'Earn 2 Five-Star Ratings', type: 'ratings', target: 2, reward: 'Priority Support', tier: 'Silver' },
  { level: 5, name: 'Navigator', goalText: 'Complete 10 Trips', type: 'trips', target: 10, reward: 'Grid Boost', tier: 'Silver' },
  { level: 6, name: 'Veteran', goalText: 'Complete 25 Trips', type: 'trips', target: 25, reward: 'Tier-1 Settlements', tier: 'Silver' },
  { level: 7, name: 'Elite', goalText: 'Get 10 Five-Star Ratings', type: 'ratings', target: 10, reward: 'Hot Request Lock', tier: 'Silver' },
  { level: 8, name: 'Gold', goalText: 'Get 20 Five-Star Ratings', type: 'ratings', target: 20, reward: 'Gold Yield (+5%)', tier: 'Gold' },
] as const;

/** Preset avatar: bundled image (require) and seed for persistence. */
export type PresetAvatar = { name: string; seed: string; image: ImageSourcePropType };

const driver1 = require('../assets/drivers/driver-1.png');
const driver2 = require('../assets/drivers/driver-2.png');
const driver3 = require('../assets/drivers/driver-3.png');
const driver4 = require('../assets/drivers/driver-4.png');
const driver5 = require('../assets/drivers/driver-5.png');
const driver6 = require('../assets/drivers/driver-6.png');
const driver7 = require('../assets/drivers/driver-7.png');
const driver8 = require('../assets/drivers/driver-8.png');
const driver9 = require('../assets/drivers/driver-9.png');
const driver10 = require('../assets/drivers/driver-10.png');

/** All driver preset avatars (bundled in assets/drivers). */
export const DRIVER_PRESET_AVATARS: PresetAvatar[] = [
  { name: 'Happy Captain', seed: 'driver-1', image: driver1 },
  { name: 'Trusty Veteran', seed: 'driver-2', image: driver2 },
  { name: 'Modern Rider', seed: 'driver-3', image: driver3 },
  { name: 'The Chauffeur', seed: 'driver-4', image: driver4 },
  { name: 'Swift Sister', seed: 'driver-5', image: driver5 },
  { name: 'Express Pilot', seed: 'driver-6', image: driver6 },
  { name: 'Safety First', seed: 'driver-7', image: driver7 },
  { name: 'The Legend', seed: 'driver-8', image: driver8 },
  { name: 'Urban Guru', seed: 'driver-9', image: driver9 },
  { name: 'Friendly Fellow', seed: 'driver-10', image: driver10 },
];

/** All presets shown in driver profile avatar picker. */
export const ALL_PRESET_AVATARS: PresetAvatar[] = DRIVER_PRESET_AVATARS;

/** URI for a preset (from bundled asset). Works on native and react-native-web. */
export function getPresetAvatarUri(av: PresetAvatar): string {
  const source = av.image as ImageSourcePropType;
  if (!source) return '';

  if (typeof source === 'string') {
    const uri = source.trim();
    if (uri) return absolutizeWebUri(uri);
  }

  if (typeof source === 'number') {
    try {
      const asset = Asset.fromModule(source);
      const uri = (asset?.uri ?? asset?.localUri ?? '').trim();
      if (uri) return absolutizeWebUri(uri);
    } catch {
      // fall through
    }
  }

  if (typeof source === 'object' && source !== null) {
    if ('uri' in source) {
      const uri = typeof source.uri === 'string' ? source.uri.trim() : '';
      if (uri) return absolutizeWebUri(uri);
    }
    const mod = source as { default?: unknown };
    if (typeof mod.default === 'string' && mod.default.trim()) {
      return absolutizeWebUri(mod.default.trim());
    }
    if (typeof mod.default === 'number') {
      try {
        const asset = Asset.fromModule(mod.default);
        const uri = (asset?.uri ?? asset?.localUri ?? '').trim();
        if (uri) return absolutizeWebUri(uri);
      } catch {
        // fall through
      }
    }
  }

  // resolveAssetSource is native-only — undefined on react-native-web.
  if (
    Platform.OS !== 'web' &&
    typeof Image.resolveAssetSource === 'function'
  ) {
    const resolved = Image.resolveAssetSource(source);
    if (resolved?.uri) {
      return absolutizeWebUri(resolved.uri.trim());
    }
  }

  try {
    const asset = Asset.fromModule(source);
    const uri = (asset?.uri ?? asset?.localUri ?? '').trim();
    if (uri) return absolutizeWebUri(uri);
  } catch {
    return '';
  }

  return '';
}

/** Bundled `require()` source for a driver preset seed (preferred for `<Image source={…} />`). */
export function getPresetImageSourceForSeed(
  seed?: string | null,
): ImageSourcePropType {
  return getDriverPresetForSeed(seed).image;
}

/** Resolve stored avatarSeed to display URI. */
export function getAvatarUriForSeed(seed: string): string {
  const preset = ALL_PRESET_AVATARS.find((av) => av.seed === seed);
  return preset ? getPresetAvatarUri(preset) : getPresetAvatarUri(ALL_PRESET_AVATARS[0]);
}

/** Preset row for a driver seed (falls back to driver-1). */
export function getDriverPresetForSeed(seed?: string | null): PresetAvatar {
  const s = (seed ?? '').trim();
  return ALL_PRESET_AVATARS.find((av) => av.seed === s) ?? ALL_PRESET_AVATARS[0]!;
}

/** Image source for driver UI: uploaded photo URL or bundled preset (`assets/drivers` or legacy `user-N`). */
export function resolveDriverAvatarImageSource(
  avatarUri?: string | null,
  avatarSeed?: string | null,
): ImageSourcePropType {
  const trimmed = avatarUri?.trim();
  if (trimmed && (trimmed.startsWith('http') || trimmed.startsWith('data:'))) {
    return { uri: trimmed };
  }
  const seed = (avatarSeed ?? '').trim();
  if (seed.startsWith('user-')) {
    const { getUser2DPresetImageSourceForSeed } =
      require('./UserAvatars') as typeof import('./UserAvatars');
    return getUser2DPresetImageSourceForSeed(seed);
  }
  return getDriverPresetForSeed(avatarSeed).image;
}

/** Display URI for map markers / web img src (bundled driver or legacy user presets). */
export function resolveDriverAvatarUriForSeed(seed?: string | null): string {
  const s = (seed ?? '').trim();
  if (s.startsWith('user-')) {
    const { getUser2DAvatarUriForSeed } =
      require('./UserAvatars') as typeof import('./UserAvatars');
    return getUser2DAvatarUriForSeed(s);
  }
  return getPresetAvatarUri(getDriverPresetForSeed(seed));
}

/** @deprecated Use getAvatarUriForSeed. Kept for compatibility. */
export function getAvatarUrl(seed: string): string {
  return getAvatarUriForSeed(seed);
}
