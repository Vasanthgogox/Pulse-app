import type { OrganizationEmploymentPolicy } from '@/lib/onboarding/organizationEmploymentPolicy';
import type { OrganizationIdentityPolicy } from '@/lib/onboarding/organizationIdentityPolicy';
import type { InvitationIdentity, IdentityInvitation } from '@/lib/onboarding/identityTypes';
import type { PlatformMembership } from '@/lib/onboarding/platformMembership';
import type { PersonStatus, RelationshipType } from '@/lib/onboarding/membershipTypes';
import type { OrganizationStatus } from '../types/organizationStatus';

import {
  evaluateEmploymentPolicyV1,
  evaluatePersonStatusPolicyV1,
} from './evaluators/employmentPolicyEvaluator';
import {
  evaluateOrganizationStatusPolicyV1,
  evaluateOrganizationStatusPolicyV1Async,
} from './evaluators/organizationStatusEvaluator';
import { evaluateIdentityProviderPolicyV1 } from './evaluators/identityProviderPolicyEvaluator';
import { evaluateInvitationPolicyV1 } from './evaluators/invitationPolicyEvaluator';
import { combinePolicyDecisions, type CombinedPolicyResult } from './policyDecision';

export type EvaluateJoinInput = {
  personStatus?: PersonStatus;
  proposedRelationshipType: RelationshipType;
  proposedOrganizationId?: string;
  proposedOrganizationName?: string;
  organizationStatus?: OrganizationStatus;
  existingMemberships: PlatformMembership[];
  organizationEmploymentPolicy?: OrganizationEmploymentPolicy;
  /** Identity requirements (SSO / corporate email / phone), checked against verifiedIdentities. */
  organizationIdentityPolicy?: OrganizationIdentityPolicy;
  verifiedIdentities?: InvitationIdentity[];
  /** Invitation lifecycle state, present when joining via an invitation. */
  invitationStatus?: IdentityInvitation['status'];
};

/**
 * MembershipPolicyEngine v1 — composable evaluators → combined PolicyDecision.
 * Add compliance, geographic, licensing evaluators without breaking callers.
 */
export async function evaluateJoinPoliciesV1(
  input: EvaluateJoinInput,
): Promise<CombinedPolicyResult> {
  const personStatus = input.personStatus ?? 'ACTIVE';

  const decisions = [
    evaluatePersonStatusPolicyV1(personStatus),
    evaluateEmploymentPolicyV1({
      proposedRelationshipType: input.proposedRelationshipType,
      proposedOrganizationId: input.proposedOrganizationId,
      existingMemberships: input.existingMemberships,
      organizationEmploymentPolicy: input.organizationEmploymentPolicy,
    }),
    input.organizationStatus !== undefined
      ? evaluateOrganizationStatusPolicyV1({
          organizationId: input.proposedOrganizationId,
          organizationName: input.proposedOrganizationName,
          organizationStatus: input.organizationStatus,
        })
      : await evaluateOrganizationStatusPolicyV1Async({
          organizationId: input.proposedOrganizationId,
          organizationName: input.proposedOrganizationName,
        }),
    evaluateIdentityProviderPolicyV1({
      organizationIdentityPolicy: input.organizationIdentityPolicy,
      verifiedIdentities: input.verifiedIdentities,
    }),
    evaluateInvitationPolicyV1({
      invitationStatus: input.invitationStatus,
    }),
  ];

  return combinePolicyDecisions(decisions);
}

/** @deprecated Use evaluateJoinPoliciesV1 */
export async function evaluateMembershipPolicyV1(
  input: EvaluateJoinInput,
): Promise<CombinedPolicyResult> {
  return evaluateJoinPoliciesV1(input);
}
