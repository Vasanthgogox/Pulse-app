/**
 * Platform Identity — discriminated identity & invitation primitives (V2 contract).
 * V1 backs phone invites via organization_team_invites; types are channel-agnostic.
 */
import type { RelationshipType } from './membershipTypes';

export interface PhoneIdentity {
  type: 'phone';
  value: string;
  verified: boolean;
}

export interface EmailIdentity {
  type: 'email';
  value: string;
  verified: boolean;
  domain?: string;
}

export interface EmployeeIdentity {
  type: 'employee_id';
  value: string;
  verified: boolean;
}

export type SsoProvider = 'entra' | 'google' | 'okta' | 'auth0' | 'saml';

export interface ExternalIdentity {
  type: 'external_identity';
  provider: SsoProvider;
  subject: string;
  verified: boolean;
}

export type InvitationIdentity =
  | PhoneIdentity
  | EmailIdentity
  | EmployeeIdentity
  | ExternalIdentity;

export type InvitationIdentityType = InvitationIdentity['type'];

/**
 * Channel-agnostic invitation (maps to platform.invitations in V2).
 * Resolver succeeds if any verified identity matches any invitation identity.
 */
export interface IdentityInvitation {
  id: string;
  organizationId: string;
  organizationName: string;
  accepted: boolean;
  /** ISO-8601 (Date at API boundaries in V2). */
  expiresAt: string;
  identities: InvitationIdentity[];
  /**
   * Relationship the invitation will create (roles may be assigned after accept).
   * @deprecated alias — use proposedRelationshipType
   */
  membershipType?: RelationshipType;
  proposedRelationshipType: RelationshipType;
  /** V1 presentation / accept RPC fields */
  inviteeName: string;
  role: string;
  platformRole: string | null;
  platformRoleLabel: string;
  businessUnit?: string | null;
  department?: string | null;
  invitedByName: string;
  createdAt: string;
  status: 'pending' | 'expired' | 'accepted';
}

export type IdentityInvitationSet = {
  active: IdentityInvitation[];
  expired: IdentityInvitation[];
};

export function phoneIdentity(value: string, verified = false): PhoneIdentity {
  return { type: 'phone', value, verified };
}

export function emailIdentity(
  value: string,
  verified = false,
  domain?: string,
): EmailIdentity {
  const normalized = value.trim().toLowerCase();
  return {
    type: 'email',
    value: normalized,
    verified,
    domain: domain ?? emailDomain(normalized),
  };
}

export function employeeIdentity(value: string, verified = false): EmployeeIdentity {
  return { type: 'employee_id', value: value.trim(), verified };
}

export function externalIdentity(
  provider: SsoProvider,
  subject: string,
  verified = false,
): ExternalIdentity {
  return { type: 'external_identity', provider, subject, verified };
}

export function emailDomain(email: string): string | undefined {
  const at = email.indexOf('@');
  return at > 0 ? email.slice(at + 1).toLowerCase() : undefined;
}

export function isIdentityVerified(identity: InvitationIdentity): boolean {
  return identity.verified === true;
}

export function identityMatchKey(identity: InvitationIdentity): string {
  switch (identity.type) {
    case 'phone':
      return `phone:${identity.value}`;
    case 'email':
      return `email:${identity.value}`;
    case 'employee_id':
      return `employee_id:${identity.value}`;
    case 'external_identity':
      return `external:${identity.provider}:${identity.subject}`;
  }
}

/** True when a verified user identity matches any identity on the invitation. */
export function invitationMatchesVerifiedIdentities(
  invitation: IdentityInvitation,
  verified: InvitationIdentity[],
): boolean {
  const verifiedKeys = new Set(
    verified.filter(isIdentityVerified).map(identityMatchKey),
  );
  return invitation.identities.some((i) => verifiedKeys.has(identityMatchKey(i)));
}
