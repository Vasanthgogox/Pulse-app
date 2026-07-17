/**
 * Build GrantSet from profile flags.
 * Adapts lib/capabilities — does not change capability matrix.
 */

import {
  getCapabilitiesFromProfile,
  type ProfileForCapabilities,
} from '@/lib/capabilities';
import type { GrantSet, Principal } from '@/lib/navigationPolicy/types';

export type ProfileForGrants = ProfileForCapabilities & {
  role: string;
};

export function buildGrantSet(
  profile: ProfileForGrants | null,
  operatingModel?: string | null,
): GrantSet {
  if (!profile) return new Set();
  if (profile.role === 'driver') return new Set();
  return new Set(getCapabilitiesFromProfile(profile, operatingModel));
}

export function buildPrincipal(
  profile: ProfileForGrants | null,
  operatingModel?: string | null,
): Principal | null {
  if (!profile) return null;
  const role = profile.role === 'driver' ? 'driver' : 'user';
  return {
    role,
    grants: buildGrantSet(profile, operatingModel),
  };
}

export function grantsSatisfy(
  grants: GrantSet,
  predicate: { allOf?: readonly string[]; anyOf?: readonly string[] } | undefined,
): boolean {
  if (!predicate) return true;
  const { allOf, anyOf } = predicate;
  if (allOf && allOf.length > 0) {
    for (const g of allOf) {
      if (!grants.has(g)) return false;
    }
  }
  if (anyOf && anyOf.length > 0) {
    if (!anyOf.some((g) => grants.has(g))) return false;
  }
  return true;
}
