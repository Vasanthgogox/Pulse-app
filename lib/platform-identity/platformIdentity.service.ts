import type { QueryClient } from '@tanstack/react-query';

import { acceptPendingTeamInvitation } from '@/features/organization/services/teamInvitationResolver.service';
import { acceptTeamInvite, getMyTeamInvites } from '@/features/organization/services/members.service';
import { shadowCheckPlatformIdentity } from '@/features/organization/utils/platformIdentityShadowCheck.util';
import type { SignupEntryIntent } from '@/features/auth/signup/signupEntryIntent';
import type { IdentityInvitation, InvitationIdentity } from '@/lib/onboarding/identityTypes';
import type { OnboardingEntryChannel } from '@/lib/onboarding/onboardingEntryChannels';
import type { OrganizationIdentityPolicy } from '@/lib/onboarding/organizationIdentityPolicy';
import { loadOrganizationIdentityPolicy } from '@/lib/onboarding/organizationIdentityPolicy';
import {
  resolveInvitationsByIdentities,
  type ResolveInvitationsInput,
  type ResolveInvitationsOutput,
} from '@/lib/onboarding/onboardingInvitationResolver';
import { loadActiveMembershipsForPerson } from '@/lib/onboarding/onboardingMembershipResolver';
import { runOnboardingResolverPipeline } from '@/lib/onboarding/onboardingResolverPipeline';
import {
  mapDomainContextToUi,
  type ResolvedOnboardingContext,
} from '@/lib/onboarding/mapDomainContextToUi';
import type { OnboardingContextInput } from '@/lib/onboarding/onboardingContextInput';
import { rebuildIdentityAfterJoin } from '@/lib/onboarding/rebuildIdentityAfterJoin.util';
import type { OrganizationEmploymentPolicy } from '@/lib/onboarding/organizationEmploymentPolicy';
import { loadOrganizationEmploymentPolicy } from '@/lib/onboarding/organizationEmploymentPolicy';
import type { PersonStatus, RelationshipType } from '@/lib/onboarding/membershipTypes';
import { proposedRelationshipTypeFromTeamInvite } from '@/lib/onboarding/membershipTypes';
import type { PlatformMembership } from '@/lib/onboarding/platformMembership';
import { supabase } from '@/lib/supabase';

import { recordPlatformIdentityAudit } from './audit/platformIdentityAudit';
import { evaluateJoinPoliciesV1, type EvaluateJoinInput } from './policy/membershipPolicyEngineV1';
import {
  combinePolicyDecisions,
  policyResultToError,
  type CombinedPolicyResult,
} from './policy/policyDecision';
import type { PlatformWorkspaceContext } from './types/workspace';
import {
  getPlatformWorkspaceStore,
  syncPlatformWorkspaceFromActive,
} from './workspace/workspaceContextStore';

export type AcceptInvitationDeps = {
  refreshSession: () => Promise<void>;
  refreshOrganization: () => Promise<void>;
  refreshWorkspaces: () => Promise<void>;
  switchWorkspace: (workspaceId: string) => Promise<void>;
  queryClient: QueryClient;
  clearPending?: () => Promise<void>;
  loadExistingMemberships?: () => Promise<PlatformMembership[]>;
};

export type AcceptInvitationInput = {
  inviteId?: string | null;
  proposedRelationshipType?: RelationshipType;
  proposedOrganizationId?: string;
  proposedOrganizationName?: string;
  personStatus?: PersonStatus;
  organizationEmploymentPolicy?: OrganizationEmploymentPolicy;
  /** Auto-loaded via loadOrganizationIdentityPolicy() when omitted, same pattern as organizationEmploymentPolicy. */
  organizationIdentityPolicy?: OrganizationIdentityPolicy;
  verifiedIdentities?: InvitationIdentity[];
  /** Invitation lifecycle state — pass the invitation's current status when known. */
  invitationStatus?: IdentityInvitation['status'];
  /** The invitation's assigned role (e.g. a PlatformTeamRole) — carried into the resulting workspace context. */
  role?: string;
};

export type AcceptInvitationResult = {
  error: Error | null;
  organizationId: string | null;
  policy?: CombinedPolicyResult;
};

/**
 * Bounded Platform Identity façade — stable API for onboarding, admin, API, and mobile.
 *
 * Authentication (OTP, SSO, …) produces verified identities.
 * Platform Identity resolves Person, Memberships, Invitations, Policy, Workspace.
 */
export const platformIdentityService = {
  /** Policy engine v1 — join / accept / switch guards. */
  async evaluateJoin(input: EvaluateJoinInput): Promise<CombinedPolicyResult> {
    const result = await evaluateJoinPoliciesV1(input);
    recordPlatformIdentityAudit({
      type: 'policy.evaluated',
      organizationId: input.proposedOrganizationId,
      metadata: {
        allowed: result.allowed,
        reason: result.primaryBlock?.reason,
        evaluatorIds: result.decisions.map((d) => d.evaluatorId),
      },
    });
    return result;
  },

  /** Resolve pending invitations for verified identities (all providers). */
  async resolveInvitations(input: ResolveInvitationsInput): Promise<ResolveInvitationsOutput> {
    return resolveInvitationsByIdentities(input);
  },

  /** Post-auth onboarding context — onboarding is a client, not owner of rules. */
  async resolveOnboardingContext(
    input: OnboardingContextInput,
  ): Promise<ResolvedOnboardingContext> {
    const {
      entryHint,
      entryChannel,
      verifiedIdentities = [],
      inviteResult: preResolved,
      phoneAccountExists,
      existingAccountEmail,
      existingAccountMasked,
      isInviteEmailRegistered,
    } = input;

    const domain = await runOnboardingResolverPipeline({
      verifiedIdentities,
      entryHint,
      entryChannel,
      inviteResult: preResolved,
      account: {
        exists: phoneAccountExists,
        email: existingAccountEmail ?? null,
        maskedEmail: existingAccountMasked ?? null,
      },
    });

    return mapDomainContextToUi(domain, { isInviteEmailRegistered });
  },

  async listMemberships(
    loadExisting?: () => Promise<PlatformMembership[]>,
  ): Promise<{ error: Error | null; memberships: PlatformMembership[] }> {
    if (loadExisting) {
      try {
        return { error: null, memberships: await loadExisting() };
      } catch (e) {
        return {
          error: e instanceof Error ? e : new Error(String(e)),
          memberships: [],
        };
      }
    }
    return loadActiveMembershipsForPerson();
  },

  getCurrentWorkspace(): PlatformWorkspaceContext {
    return getPlatformWorkspaceStore();
  },

  async switchWorkspace(input: {
    organizationId: string;
    personId?: string | null;
    membershipId?: string | null;
    deps: Pick<AcceptInvitationDeps, 'switchWorkspace' | 'refreshWorkspaces' | 'refreshOrganization' | 'refreshSession' | 'queryClient'>;
    relationshipType?: RelationshipType;
    role?: string;
    permissions?: string[];
  }): Promise<{ error: Error | null; workspace: PlatformWorkspaceContext }> {
    const switchPolicy = await evaluateJoinPoliciesV1({
      personStatus: 'ACTIVE',
      proposedRelationshipType: input.relationshipType ?? 'EMPLOYEE',
      proposedOrganizationId: input.organizationId,
      existingMemberships: [],
    });

    const orgOnly = combinePolicyDecisions(
      switchPolicy.decisions.filter((d) => d.evaluatorId === 'organization_status_v1'),
    );
    if (!orgOnly.allowed) {
      return { error: policyResultToError(orgOnly), workspace: getPlatformWorkspaceStore() };
    }

    await rebuildIdentityAfterJoin({
      organizationId: input.organizationId,
      refreshSession: input.deps.refreshSession,
      refreshOrganization: input.deps.refreshOrganization,
      refreshWorkspaces: input.deps.refreshWorkspaces,
      switchWorkspace: input.deps.switchWorkspace,
      queryClient: input.deps.queryClient,
    });

    const current = getPlatformWorkspaceStore();
    const workspace = syncPlatformWorkspaceFromActive({
      personId: input.personId ?? current.personId,
      organizationId: input.organizationId,
      membershipId: input.membershipId ?? null,
      relationshipType: input.relationshipType,
      role: input.role,
      permissions: input.permissions,
    });

    recordPlatformIdentityAudit({
      type: 'workspace.switched',
      personId: input.personId,
      organizationId: input.organizationId,
      membershipId: input.membershipId,
    });

    return { error: null, workspace };
  },

  /** Accept invitation after policy pass → membership → workspace. */
  async acceptInvitation(
    input: AcceptInvitationInput,
    deps: AcceptInvitationDeps,
  ): Promise<AcceptInvitationResult> {
    const proposedRelationshipType =
      input.proposedRelationshipType ?? proposedRelationshipTypeFromTeamInvite();

    const { memberships } = await platformIdentityService.listMemberships(deps.loadExistingMemberships);

    const orgEmploymentPolicy =
      input.organizationEmploymentPolicy ??
      (await loadOrganizationEmploymentPolicy(input.proposedOrganizationId));

    const orgIdentityPolicy =
      input.organizationIdentityPolicy ??
      (await loadOrganizationIdentityPolicy(input.proposedOrganizationId));

    const policy = await platformIdentityService.evaluateJoin({
      personStatus: input.personStatus ?? 'ACTIVE',
      proposedRelationshipType,
      proposedOrganizationId: input.proposedOrganizationId,
      proposedOrganizationName: input.proposedOrganizationName,
      existingMemberships: memberships,
      organizationEmploymentPolicy: orgEmploymentPolicy,
      organizationIdentityPolicy: orgIdentityPolicy,
      verifiedIdentities: input.verifiedIdentities,
      invitationStatus: input.invitationStatus,
    });

    if (!policy.allowed) {
      recordPlatformIdentityAudit({
        type: 'employment.rejected',
        organizationId: input.proposedOrganizationId,
        metadata: { reason: policy.primaryBlock?.reason },
      });
      return {
        error: policyResultToError(policy),
        organizationId: null,
        policy,
      };
    }

    const { inviteId } = input;
    let organizationId: string | null = null;
    let membershipId: string | null = null;

    if (inviteId) {
      const acceptResult = await acceptPendingTeamInvitation(inviteId);
      if (acceptResult.error) {
        return { error: acceptResult.error, organizationId: null, policy };
      }
      organizationId = acceptResult.organizationId;
      membershipId = acceptResult.membershipId;
      if (!organizationId) {
        return {
          error: new Error('Invitation accepted but organization was not returned.'),
          organizationId: null,
          policy,
        };
      }
      recordPlatformIdentityAudit({
        type: 'invitation.accepted',
        organizationId,
        inviteId,
        membershipId: acceptResult.membershipId,
      });
    } else {
      const { invites, error: listErr } = await getMyTeamInvites();
      if (listErr) return { error: listErr, organizationId: null, policy };
      if (invites.length !== 1) {
        return {
          error: new Error(
            invites.length === 0
              ? 'No pending workspace invitation found for this account.'
              : 'Multiple workspace invitations found. Accept one from your account settings.',
          ),
          organizationId: null,
          policy,
        };
      }
      organizationId = invites[0]!.organization_id;
      const { error: acceptErr } = await acceptTeamInvite(organizationId);
      if (acceptErr) return { error: acceptErr, organizationId: null, policy };
      recordPlatformIdentityAudit({
        type: 'invitation.accepted',
        organizationId,
      });
    }

    void shadowCheckPlatformIdentity({
      flow: 'invitation_join',
      legacyOrganizationIds: [organizationId],
    });

    const { data: { session } } = await supabase().auth.getSession();
    const switchResult = await platformIdentityService.switchWorkspace({
      organizationId,
      personId: session?.user?.id ?? null,
      membershipId,
      relationshipType: proposedRelationshipType,
      role: input.role,
      deps,
    });

    if (switchResult.error) {
      return { error: switchResult.error, organizationId: null, policy };
    }

    if (deps.clearPending) {
      await deps.clearPending();
    }

    return { error: null, organizationId, policy };
  },

  recordIdentityVerified(input: {
    personId?: string | null;
    method: import('./types/authentication').AuthenticationMethod;
    identities: InvitationIdentity[];
    entryChannel?: OnboardingEntryChannel;
    entryHint?: SignupEntryIntent;
  }): void {
    recordPlatformIdentityAudit({
      type: 'identity.verified',
      personId: input.personId,
      metadata: {
        method: input.method,
        identityTypes: input.identities.map((i) => i.type),
        entryChannel: input.entryChannel,
        entryHint: input.entryHint,
      },
    });
    if (input.method === 'phone_otp') {
      recordPlatformIdentityAudit({ type: 'identity.phone_verified', personId: input.personId });
    }
  },
};

export type PlatformIdentityService = typeof platformIdentityService;
