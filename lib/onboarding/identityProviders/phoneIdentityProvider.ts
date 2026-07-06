import { resolveTeamInvitationsByPhone } from '@/features/organization/services/teamInvitationResolver.service';

import type { IdentityInvitation, PhoneIdentity } from '../identityTypes';
import { isIdentityVerified } from '../identityTypes';
import { legacyTeamInviteToIdentityInvitation } from '../invitationModel.util';

import type {
  IdentityProvider,
  ResolveProviderInvitationsResult,
  VerifyIdentityInput,
  VerifyIdentityResult,
} from './identityProvider.types';

function toIdentityInvitations(
  result: Awaited<ReturnType<typeof resolveTeamInvitationsByPhone>>['result'],
  phone: string,
): ResolveProviderInvitationsResult {
  const invitations: IdentityInvitation[] = [];
  const expired: IdentityInvitation[] = [];

  for (const row of result.active) {
    invitations.push(legacyTeamInviteToIdentityInvitation(row, phone));
  }
  for (const row of result.expired) {
    expired.push(
      legacyTeamInviteToIdentityInvitation(
        { ...row, isExpired: true, status: 'expired' },
        phone,
      ),
    );
  }

  return { error: null, invitations, expired };
}

/** V1 — phone OTP verification happens in signup UI before resolver runs. */
export const phoneIdentityProvider: IdentityProvider = {
  type: 'phone',

  supports(identity): identity is PhoneIdentity {
    return identity.type === 'phone';
  },

  async verify(input: VerifyIdentityInput): Promise<VerifyIdentityResult> {
    if (input.identity.type !== 'phone') {
      return { error: new Error('Not a phone identity'), identity: null };
    }
    if (isIdentityVerified(input.identity)) {
      return { error: null, identity: input.identity };
    }
    if (!input.credential?.trim()) {
      return { error: new Error('Phone OTP required'), identity: null };
    }
    // V1: OTP validated in useBusinessSignUpFlow before identities are marked verified.
    return {
      error: null,
      identity: { ...input.identity, verified: true },
    };
  },

  async resolveInvitations(identity): Promise<ResolveProviderInvitationsResult> {
    if (identity.type !== 'phone' || !identity.value.trim()) {
      return { error: null, invitations: [], expired: [] };
    }
    const { error, result } = await resolveTeamInvitationsByPhone(identity.value);
    if (error) {
      return { error, invitations: [], expired: [] };
    }
    return toIdentityInvitations(result, identity.value);
  },
};
