import type { OrganizationEmploymentPolicy } from './organizationEmploymentPolicy';
import { DEFAULT_ORGANIZATION_EMPLOYMENT_POLICY } from './organizationEmploymentPolicy';
import { evaluateJoinPoliciesV1 } from '@/lib/platform-identity/policy/membershipPolicyEngineV1';
import type { PlatformMembership } from './platformMembership';
import type { PersonStatus, RelationshipType } from './membershipTypes';

export type MembershipPolicyBlockReason =
  | 'ACTIVE_EMPLOYMENT_EXISTS'
  | 'PERSON_SUSPENDED'
  | 'PERSON_LOCKED'
  | 'PERSON_DELETED'
  | 'ORG_MEMBERSHIP_POLICY'
  | 'ORGANIZATION_SUSPENDED'
  | 'ORGANIZATION_ARCHIVED'
  | 'ORGANIZATION_DELETED';

export type MembershipPolicyRequiredAction =
  | 'LEAVE_ORGANIZATION'
  | 'COMPLETE_SSO'
  | 'VERIFY_CORPORATE_EMAIL'
  | 'VERIFY_PHONE'
  | 'REQUEST_NEW_INVITATION'
  | 'CONTRACTOR_APPROVAL'
  | 'HR_APPROVAL'
  | 'CONTACT_ADMIN';

export type MembershipPolicyEvaluation = {
  allowed: boolean;
  reason?: MembershipPolicyBlockReason;
  message?: string;
  blockingMembership?: PlatformMembership;
  requiredActions?: MembershipPolicyRequiredAction[];
};

export type EvaluateMembershipPolicyInput = {
  personStatus?: PersonStatus;
  proposedRelationshipType: RelationshipType;
  proposedOrganizationId?: string;
  proposedOrganizationName?: string;
  existingMemberships: PlatformMembership[];
  organizationEmploymentPolicy?: OrganizationEmploymentPolicy;
};

/**
 * @deprecated Use platformIdentityService.evaluateJoin() or evaluateJoinPoliciesV1().
 */
export async function evaluateMembershipPolicy(
  input: EvaluateMembershipPolicyInput,
): Promise<MembershipPolicyEvaluation> {
  const combined = await evaluateJoinPoliciesV1({
    personStatus: input.personStatus,
    proposedRelationshipType: input.proposedRelationshipType,
    proposedOrganizationId: input.proposedOrganizationId,
    proposedOrganizationName: input.proposedOrganizationName,
    existingMemberships: input.existingMemberships,
    organizationEmploymentPolicy:
      input.organizationEmploymentPolicy ?? DEFAULT_ORGANIZATION_EMPLOYMENT_POLICY,
  });

  const block = combined.primaryBlock;
  if (!block || combined.allowed) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: block.reason as MembershipPolicyBlockReason | undefined,
    message: block.message,
    requiredActions: block.requiredActions,
    blockingMembership: block.metadata?.blockingOrganizationId
      ? input.existingMemberships.find(
          (m) => m.organizationId === block.metadata?.blockingOrganizationId,
        )
      : undefined,
  };
}
