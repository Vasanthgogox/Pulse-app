import type { SignupEntryIntent } from '@/features/auth/signup/signupEntryIntent';
import type { InvitationResolverResult } from '@/features/organization/services/teamInvitationResolver.service';

import type { OnboardingEntryChannel } from './onboardingEntryChannels';
import {
  buildOnboardingDomainContext,
  type OnboardingAccountSummary,
  type OnboardingDomainContext,
} from './onboardingDomainContext';
import type { InvitationIdentity } from './identityTypes';
import { resolveMembershipsByIdentities } from './onboardingMembershipResolver';
import { resolveInvitationsByIdentities } from './onboardingInvitationResolver';
import {
  loadOrganizationIdentityPolicy,
  mergeIdentityPolicies,
  type OrganizationIdentityPolicy,
} from './organizationIdentityPolicy';
import { loadMembershipPolicy } from './membershipPolicy';

export type OnboardingResolverPipelineInput = {
  verifiedIdentities: InvitationIdentity[];
  entryHint: SignupEntryIntent;
  entryChannel?: OnboardingEntryChannel;
  account: OnboardingAccountSummary;
  /** V1 shortcut — skip provider resolve when invites already fetched. */
  inviteResult?: InvitationResolverResult;
};

/**
 * Full resolver pipeline (identity-channel agnostic):
 *
 * verified identities → resolve invitations → resolve memberships
 *   → load org identity policy → domain context
 */
export async function runOnboardingResolverPipeline(
  input: OnboardingResolverPipelineInput,
): Promise<OnboardingDomainContext> {
  const { verifiedIdentities, entryHint, entryChannel, account, inviteResult: preResolved } =
    input;

  const resolved = preResolved
    ? null
    : await resolveInvitationsByIdentities({ identities: verifiedIdentities });

  const inviteResult =
    preResolved ??
    resolved!.result;

  const nativeInvitations = resolved?.invitations;
  const nativeExpired = resolved?.expiredInvitations;

  const { memberships } = await resolveMembershipsByIdentities(verifiedIdentities);

  const orgIds = [
    ...new Set([
      ...inviteResult.active.map((i) => i.organizationId),
      ...memberships.map((m) => m.organizationId),
    ]),
  ];

  const policies: OrganizationIdentityPolicy[] = await Promise.all(
    orgIds.map((id) => loadOrganizationIdentityPolicy(id)),
  );
  const identityPolicy =
    policies.length > 0 ? mergeIdentityPolicies(policies) : await loadOrganizationIdentityPolicy();

  const membershipPolicy = await loadMembershipPolicy({
    organizationId: orgIds[0],
  });

  const phoneValue = verifiedIdentities.find((i) => i.type === 'phone')?.value;

  return buildOnboardingDomainContext({
    verifiedIdentities,
    inviteResult,
    nativeInvitations,
    nativeExpired,
    entryHint,
    entryChannel,
    account,
    memberships,
    identityPolicy,
    membershipPolicy,
    phoneForLegacyMapping: phoneValue,
  });
}
