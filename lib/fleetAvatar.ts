/**
 * Deterministic fleet/org avatar using the same preset driver images as driver profiles.
 */
import { ALL_PRESET_AVATARS, getAvatarUriForSeed } from '@/constants/DriverLevels';

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

/** Stable preset seed for an organization (bundled asset key, e.g. driver-3). */
export function getFleetAvatarSeedForOrg(orgId: string, orgName?: string): string {
  const key = `${orgId ?? ''}|${orgName ?? ''}`;
  const idx = hashString(key) % ALL_PRESET_AVATARS.length;
  return ALL_PRESET_AVATARS[idx].seed;
}

/** Resolved file:// or http URI for displaying the fleet avatar. */
export function getFleetAvatarUriForOrg(orgId: string, orgName?: string): string {
  return getAvatarUriForSeed(getFleetAvatarSeedForOrg(orgId, orgName));
}
