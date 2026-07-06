import type { EmailIdentity, IdentityInvitation } from '../identityTypes';

import type {
  IdentityProvider,
  ResolveProviderInvitationsResult,
  VerifyIdentityInput,
  VerifyIdentityResult,
} from './identityProvider.types';

/** V2 — email OTP / magic link / invitation email. */
export const emailIdentityProvider: IdentityProvider = {
  type: 'email',

  supports(identity): identity is EmailIdentity {
    return identity.type === 'email';
  },

  async verify(input: VerifyIdentityInput): Promise<VerifyIdentityResult> {
    if (input.identity.type !== 'email') {
      return { error: new Error('Not an email identity'), identity: null };
    }
    // Future: validate magic-link token or email OTP via Platform Identity.
    if (input.identity.verified) {
      return { error: null, identity: input.identity };
    }
    return { error: new Error('Email verification not implemented'), identity: null };
  },

  async resolveInvitations(identity): Promise<ResolveProviderInvitationsResult> {
    void identity;
    // Future: resolve_pending_team_invitations_by_email / platform.invitations
    const empty: IdentityInvitation[] = [];
    return { error: null, invitations: empty, expired: empty };
  },
};
