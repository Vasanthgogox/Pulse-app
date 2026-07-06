import type { ExternalIdentity, IdentityInvitation } from '../identityTypes';

import type {
  IdentityProvider,
  ResolveProviderInvitationsResult,
  VerifyIdentityInput,
  VerifyIdentityResult,
} from './identityProvider.types';

/** V2 — Microsoft Entra, Google Workspace, Okta, Auth0, SAML. */
export const ssoIdentityProvider: IdentityProvider = {
  type: 'external_identity',

  supports(identity): identity is ExternalIdentity {
    return identity.type === 'external_identity';
  },

  async verify(input: VerifyIdentityInput): Promise<VerifyIdentityResult> {
    if (input.identity.type !== 'external_identity') {
      return { error: new Error('Not an external identity'), identity: null };
    }
    if (input.identity.verified) {
      return { error: null, identity: input.identity };
    }
    return { error: new Error('SSO verification not implemented'), identity: null };
  },

  async resolveInvitations(identity): Promise<ResolveProviderInvitationsResult> {
    void identity;
    const empty: IdentityInvitation[] = [];
    return { error: null, invitations: empty, expired: empty };
  },
};
