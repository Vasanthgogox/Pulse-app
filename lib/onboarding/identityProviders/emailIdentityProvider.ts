import { resolveTeamInvitationsByEmail } from '@/features/organization/services/teamInvitationResolver.service';
import { supabase } from '@/lib/supabase';

import type { EmailIdentity } from '../identityTypes';
import { legacyTeamInviteToIdentityInvitation } from '../invitationModel.util';

import type {
  IdentityProvider,
  ResolveProviderInvitationsResult,
  VerifyIdentityInput,
  VerifyIdentityResult,
} from './identityProvider.types';

/**
 * Email identity — verified against the current Supabase Auth session's confirmed email
 * (no separate OTP/magic-link flow exists yet; this reuses Supabase's own email
 * confirmation state rather than inventing a parallel verification mechanism).
 */
export const emailIdentityProvider: IdentityProvider = {
  type: 'email',

  supports(identity): identity is EmailIdentity {
    return identity.type === 'email';
  },

  async verify(input: VerifyIdentityInput): Promise<VerifyIdentityResult> {
    if (input.identity.type !== 'email') {
      return { error: new Error('Not an email identity'), identity: null };
    }
    if (input.identity.verified) {
      return { error: null, identity: input.identity };
    }

    const targetEmail = input.identity.value.trim().toLowerCase();
    if (!targetEmail) {
      return { error: new Error('Email is required'), identity: null };
    }

    const { data, error } = await supabase().auth.getUser();
    if (error) {
      return { error, identity: null };
    }

    const sessionEmail = data.user?.email?.trim().toLowerCase();
    const confirmed = Boolean(data.user?.email_confirmed_at);

    if (sessionEmail && sessionEmail === targetEmail && confirmed) {
      return { error: null, identity: { ...input.identity, verified: true } };
    }

    return {
      error: new Error('Email is not verified for the current session.'),
      identity: null,
    };
  },

  async resolveInvitations(identity): Promise<ResolveProviderInvitationsResult> {
    if (identity.type !== 'email' || !identity.value.trim()) {
      return { error: null, invitations: [], expired: [] };
    }

    const { error, result } = await resolveTeamInvitationsByEmail(identity.value);
    if (error) {
      return { error, invitations: [], expired: [] };
    }

    return {
      error: null,
      invitations: result.active.map((row) => legacyTeamInviteToIdentityInvitation(row)),
      expired: result.expired.map((row) =>
        legacyTeamInviteToIdentityInvitation({ ...row, isExpired: true, status: 'expired' }),
      ),
    };
  },
};
