import type { SignupEntryIntent } from '@/features/auth/signup/signupEntryIntent';
import type { InvitationResolverResult } from '@/features/organization/services/teamInvitationResolver.service';

import type { OnboardingEntryChannel } from './onboardingEntryChannels';
import type { IdentityInvitation, IdentityInvitationSet, InvitationIdentity } from './identityTypes';
import {
  identityInvitationToLegacy,
  legacyTeamInviteToIdentityInvitation,
} from './invitationModel.util';
import type { MembershipLifecycleStatus, PersonStatus, RelationshipType } from './membershipTypes';
import type { OrganizationIdentityPolicy } from './organizationIdentityPolicy';
import { DEFAULT_ORGANIZATION_IDENTITY_POLICY } from './organizationIdentityPolicy';
import type { PlatformMembershipPolicy } from './membershipPolicy';
import { DEFAULT_PLATFORM_MEMBERSHIP_POLICY } from './membershipPolicy';
import { buildPlatformPersonDomain } from './platformIdentityDomain';
import type { PlatformMembership } from './platformMembership';
import { platformMembershipFromLegacyRow } from './platformMembership';

export type OnboardingAccountSummary = {
  exists: boolean;
  email?: string | null;
  maskedEmail?: string | null;
  userId?: string | null;
  personStatus?: PersonStatus;
};

export type OnboardingMembershipSummary = {
  organizationId: string;
  organizationName?: string;
  relationshipType?: RelationshipType;
  lifecycleStatus?: MembershipLifecycleStatus;
  role?: string;
};

/**
 * Domain facts after identity verification + full resolver pipeline.
 * Combinations (account + N invites + memberships + policy) live here — not in a single enum.
 */
export type OnboardingDomainContext = {
  verifiedIdentities: InvitationIdentity[];
  account: OnboardingAccountSummary;
  invitations: IdentityInvitationSet;
  memberships: OnboardingMembershipSummary[];
  organizations: { id: string; name: string }[];
  identityPolicy: OrganizationIdentityPolicy;
  membershipPolicy: PlatformMembershipPolicy;
  /** Conceptual person domain snapshot for mapper / analytics. */
  person: ReturnType<typeof buildPlatformPersonDomain>;
  entryHint: SignupEntryIntent;
  entryChannel?: OnboardingEntryChannel;
};

export function buildOnboardingDomainContext(input: {
  verifiedIdentities: InvitationIdentity[];
  inviteResult: InvitationResolverResult;
  nativeInvitations?: IdentityInvitation[];
  nativeExpired?: IdentityInvitation[];
  entryHint: SignupEntryIntent;
  entryChannel?: OnboardingEntryChannel;
  account: OnboardingAccountSummary;
  memberships?: OnboardingMembershipSummary[];
  identityPolicy?: OrganizationIdentityPolicy;
  membershipPolicy?: PlatformMembershipPolicy;
  phoneForLegacyMapping?: string;
}): OnboardingDomainContext {
  const phone = input.phoneForLegacyMapping?.trim();

  let active: IdentityInvitation[];
  let expired: IdentityInvitation[];

  if (input.nativeInvitations && input.nativeExpired) {
    active = input.nativeInvitations;
    expired = input.nativeExpired;
  } else {
    const toIdentity = (row: (typeof input.inviteResult.active)[0], isExpired: boolean) =>
      legacyTeamInviteToIdentityInvitation(
        { ...row, isExpired, status: isExpired ? 'expired' : row.status },
        phone,
      );
    active = input.inviteResult.active.map((r) => toIdentity(r, false));
    expired = input.inviteResult.expired.map((r) => toIdentity(r, true));
  }

  const organizations = [
    ...new Map(
      [...active, ...expired].map((inv) => [inv.organizationId, inv.organizationName] as const),
    ).entries(),
  ].map(([id, name]) => ({ id, name }));

  const memberships: PlatformMembership[] = (input.memberships ?? []).map((m) =>
    platformMembershipFromLegacyRow({
      organizationId: m.organizationId,
      organizationName: m.organizationName,
      relationshipType: m.relationshipType ?? 'EMPLOYEE',
      role: m.role,
      status: m.lifecycleStatus ?? 'ACTIVE',
    }),
  );

  return {
    verifiedIdentities: input.verifiedIdentities,
    account: input.account,
    invitations: { active, expired },
    memberships: input.memberships ?? [],
    organizations,
    identityPolicy: input.identityPolicy ?? DEFAULT_ORGANIZATION_IDENTITY_POLICY,
    membershipPolicy: input.membershipPolicy ?? DEFAULT_PLATFORM_MEMBERSHIP_POLICY,
    person: buildPlatformPersonDomain({
      personId: input.account.userId,
      status: input.account.personStatus ?? 'ACTIVE',
      identities: input.verifiedIdentities,
      memberships,
      activeOrganizationId:
        memberships.find((m) => m.lifecycleStatus === 'ACTIVE')?.organizationId ?? null,
    }),
    entryHint: input.entryHint,
    entryChannel: input.entryChannel,
  };
}

/** Legacy InvitationResolverResult slice for V1 UI components. */
export function domainInvitationsToLegacyResult(
  domain: OnboardingDomainContext,
): InvitationResolverResult {
  return {
    active: domain.invitations.active.map(identityInvitationToLegacy),
    expired: domain.invitations.expired.map(identityInvitationToLegacy),
  };
}
