import type { ResolvedTeamInvitation } from '@/features/organization/services/teamInvitationResolver.service';

import type { OnboardingDomainContext } from './onboardingDomainContext';
import { domainInvitationsToLegacyResult } from './onboardingDomainContext';

export type OnboardingContextType =
  | 'owner'
  | 'team'
  | 'existing_member'
  | 'multiple_invites'
  | 'no_invitation'
  | 'expired_invites';

export type ResolvedOnboardingContext = {
  type: OnboardingContextType;
  invitations: ReturnType<typeof domainInvitationsToLegacyResult>;
  selectedInvite: ResolvedTeamInvitation | null;
  selectedInviteId: string | null;
  phoneAccountExists: boolean;
  existingAccountEmail: string | null;
  existingAccountMasked: string | null;
  /** V2 domain facts (UI mapper input; V1 screens use `type` only). */
  domain?: OnboardingDomainContext;
};

export type MapDomainContextOptions = {
  isInviteEmailRegistered: (email: string) => Promise<{
    exists: boolean;
    masked_email?: string;
  }>;
};

/**
 * Maps domain facts → V1 UI routing enum. Combinations are expressed via domain,
 * not by growing the enum (e.g. account exists + multiple invites).
 */
export async function mapDomainContextToUi(
  domain: OnboardingDomainContext,
  options: MapDomainContextOptions,
): Promise<ResolvedOnboardingContext> {
  const inviteResult = domainInvitationsToLegacyResult(domain);
  const { active, expired } = inviteResult;
  const phoneAccountExists = domain.account.exists;
  const existingAccountEmail = domain.account.email ?? null;
  const existingAccountMasked = domain.account.maskedEmail ?? null;
  const { entryHint } = domain;
  const { isInviteEmailRegistered } = options;

  const base = {
    invitations: inviteResult,
    phoneAccountExists,
    existingAccountEmail,
    existingAccountMasked,
    domain,
  };

  if (active.length > 1) {
    // Invitation picker: choose which single org to join (not an org switcher).
    // Under maxActiveOrganizations = 1, user accepts one invite → one membership → one active org.
    return {
      ...base,
      type: 'multiple_invites',
      selectedInvite: null,
      selectedInviteId: null,
    };
  }

  if (active.length === 1) {
    const invite = active[0]!;
    const emailCandidate =
      invite.inviteeEmail?.trim() ||
      existingAccountEmail?.trim() ||
      null;

    let accountExists = phoneAccountExists;
    let masked = existingAccountMasked;
    let accountEmail = existingAccountEmail;

    if (emailCandidate) {
      const emailCheck = await isInviteEmailRegistered(emailCandidate);
      if (emailCheck.exists) {
        accountExists = true;
        masked = emailCheck.masked_email ?? masked;
        accountEmail = emailCandidate;
      }
    }

    if (accountExists) {
      return {
        ...base,
        type: 'existing_member',
        selectedInvite: invite,
        selectedInviteId: invite.inviteId,
        existingAccountEmail: accountEmail,
        existingAccountMasked: masked,
      };
    }

    return {
      ...base,
      type: 'team',
      selectedInvite: invite,
      selectedInviteId: invite.inviteId,
    };
  }

  if (expired.length > 0) {
    return {
      ...base,
      type: 'expired_invites',
      selectedInvite: null,
      selectedInviteId: null,
    };
  }

  if (phoneAccountExists) {
    return {
      ...base,
      type: 'existing_member',
      selectedInvite: null,
      selectedInviteId: null,
    };
  }

  if (entryHint === 'team') {
    return {
      ...base,
      type: 'no_invitation',
      selectedInvite: null,
      selectedInviteId: null,
    };
  }

  return {
    ...base,
    type: 'owner',
    selectedInvite: null,
    selectedInviteId: null,
  };
}

/** Map resolver context → legacy UI track/phase (screens unchanged). */
export function onboardingContextToUi(context: ResolvedOnboardingContext): {
  signupTrack: 'owner' | 'invite';
  invitePhase: import('@/features/auth/signup/signupInviteTypes').InvitePhase;
} {
  switch (context.type) {
    case 'owner':
      return { signupTrack: 'owner', invitePhase: 'accept' };
    case 'team':
      return { signupTrack: 'invite', invitePhase: 'accept' };
    case 'existing_member':
      return { signupTrack: 'invite', invitePhase: 'existing_account' };
    case 'multiple_invites':
      return { signupTrack: 'invite', invitePhase: 'picker' };
    case 'no_invitation':
      return { signupTrack: 'invite', invitePhase: 'no_invite' };
    case 'expired_invites':
      return { signupTrack: 'invite', invitePhase: 'expired' };
  }
}

export function onboardingContextAnalyticsEvent(
  type: OnboardingContextType,
): string {
  switch (type) {
    case 'owner':
      return 'owner_signup';
    case 'team':
      return 'invitation_found';
    case 'existing_member':
      return 'existing_account';
    case 'multiple_invites':
      return 'multiple_invitations';
    case 'no_invitation':
      return 'no_invitation';
    case 'expired_invites':
      return 'invitation_expired';
  }
}
