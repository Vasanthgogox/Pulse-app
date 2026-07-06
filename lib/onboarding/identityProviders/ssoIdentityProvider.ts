import { supabase } from '@/lib/supabase';

import type { ExternalIdentity, IdentityInvitation, SsoProvider } from '../identityTypes';

import type {
    IdentityProvider,
    ResolveProviderInvitationsResult,
    VerifyIdentityInput,
    VerifyIdentityResult,
} from './identityProvider.types';

/** SSO providers with a real, configured Supabase Auth integration today. */
const CONFIGURED_SSO_PROVIDERS: SsoProvider[] = ['google'];

/**
 * External (SSO) identity — verified against the current Supabase Auth session's linked
 * provider identity. Only 'google' has a configured Supabase Auth provider today (reused
 * from the existing signInWithGoogle() flow); Entra, Okta, Auth0, and SAML each require
 * IdP app registration plus Supabase Auth provider configuration (an ops/infra task, not
 * a code change) before they can verify anything for real — they fail with an explicit
 * "not configured" error rather than a fabricated pass.
 */
export const ssoIdentityProvider: IdentityProvider = {
  type: 'external_identity',

  supports(identity): identity is ExternalIdentity {
    return identity.type === 'external_identity';
  },

  async verify(input: VerifyIdentityInput): Promise<VerifyIdentityResult> {
    if (input.identity.type !== 'external_identity') {
      return { error: new Error('Not an external identity'), identity: null };
    }
    const externalIdentity: ExternalIdentity = input.identity;

    if (externalIdentity.verified) {
      return { error: null, identity: externalIdentity };
    }

    if (!CONFIGURED_SSO_PROVIDERS.includes(externalIdentity.provider)) {
      return {
        error: new Error(
          `${externalIdentity.provider} is not yet configured as a Supabase Auth provider for this workspace.`,
        ),
        identity: null,
      };
    }

    const { data, error } = await supabase().auth.getUser();
    if (error) {
      return { error, identity: null };
    }

    const linkedIdentity = data.user?.identities?.find(
      (i) => i.provider === externalIdentity.provider,
    );

    if (linkedIdentity && linkedIdentity.id === externalIdentity.subject) {
      return { error: null, identity: { ...externalIdentity, verified: true } };
    }

    return {
      error: new Error(`No verified ${externalIdentity.provider} sign-in found for this session.`),
      identity: null,
    };
  },

  async resolveInvitations(identity): Promise<ResolveProviderInvitationsResult> {
    void identity;
    // No backend capability yet to resolve invitations by external-identity subject —
    // would require platform.invitations with an identity-provider linkage, which is
    // explicitly out of scope here (no migration off organization_team_invites in PR-007).
    const empty: IdentityInvitation[] = [];
    return { error: null, invitations: empty, expired: empty };
  },
};
