import type { IdentityInvitation, InvitationIdentity } from '../identityTypes';

export type VerifyIdentityInput = {
  identity: InvitationIdentity;
  /** OTP, magic-link token, SAML assertion, etc. */
  credential?: string;
};

export type VerifyIdentityResult = {
  error: Error | null;
  identity: InvitationIdentity | null;
};

export type ResolveProviderInvitationsResult = {
  error: Error | null;
  invitations: IdentityInvitation[];
  expired: IdentityInvitation[];
};

/**
 * Pluggable identity channel — verify + resolve invitations per type.
 * Register new providers (Entra, Okta, …) without changing the resolver pipeline.
 */
export interface IdentityProvider {
  type: InvitationIdentity['type'];
  supports(identity: InvitationIdentity): boolean;
  verify(input: VerifyIdentityInput): Promise<VerifyIdentityResult>;
  resolveInvitations(identity: InvitationIdentity): Promise<ResolveProviderInvitationsResult>;
}
