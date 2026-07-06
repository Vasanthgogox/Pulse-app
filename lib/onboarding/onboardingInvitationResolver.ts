/**
 * Identity-channel-agnostic invitation resolver via registered IdentityProviders.
 * V1: PhoneIdentityProvider → organization_team_invites RPCs.
 */
import type { InvitationResolverResult } from '@/features/organization/services/teamInvitationResolver.service';

import { getProviderForIdentity } from './identityProviders/identityProviderRegistry';
import type { IdentityInvitation, InvitationIdentity, InvitationIdentityType } from './identityTypes';
import { isIdentityVerified } from './identityTypes';
import { identityInvitationToLegacy } from './invitationModel.util';

export type ResolveInvitationsInput = {
  identities: InvitationIdentity[];
};

export type ResolveInvitationsOutput = {
  error: Error | null;
  result: InvitationResolverResult;
  /** V2 native invitation model (union of all provider results). */
  invitations: IdentityInvitation[];
  expiredInvitations: IdentityInvitation[];
  matchedBy: InvitationIdentityType[];
};

const empty: InvitationResolverResult = { active: [], expired: [] };

function dedupeInvitations(list: IdentityInvitation[]): IdentityInvitation[] {
  const seen = new Set<string>();
  return list.filter((inv) => {
    if (seen.has(inv.id)) return false;
    seen.add(inv.id);
    return true;
  });
}

function toLegacyResult(
  active: IdentityInvitation[],
  expired: IdentityInvitation[],
): InvitationResolverResult {
  return {
    active: active.map(identityInvitationToLegacy),
    expired: expired.map(identityInvitationToLegacy),
  };
}

/**
 * Resolve pending invitations for one or more verified identities.
 * Succeeds if any verified identity matches (via provider resolveInvitations).
 * Never assumes phone is mandatory.
 */
export async function resolveInvitationsByIdentities(
  input: ResolveInvitationsInput,
): Promise<ResolveInvitationsOutput> {
  const identities = input.identities.filter(
    (i) => isIdentityVerified(i) && (i.type === 'external_identity' ? i.subject.trim() : i.value.trim()),
  );

  if (identities.length === 0) {
    return {
      error: null,
      result: empty,
      invitations: [],
      expiredInvitations: [],
      matchedBy: [],
    };
  }

  let active: IdentityInvitation[] = [];
  let expired: IdentityInvitation[] = [];
  let firstError: Error | null = null;
  const matchedBy: InvitationIdentityType[] = [];

  for (const identity of identities) {
    const provider = getProviderForIdentity(identity);
    if (!provider) continue;

    const { error, invitations, expired: exp } = await provider.resolveInvitations(identity);
    if (error && !firstError) firstError = error;
    if (invitations.length > 0 || exp.length > 0) {
      if (!matchedBy.includes(identity.type)) {
        matchedBy.push(identity.type);
      }
    }
    active = dedupeInvitations([...active, ...invitations]);
    expired = dedupeInvitations([...expired, ...exp]);
  }

  return {
    error: firstError,
    result: toLegacyResult(active, expired),
    invitations: active,
    expiredInvitations: expired,
    matchedBy,
  };
}
