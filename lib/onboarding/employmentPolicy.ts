/**
 * @deprecated Use membershipPolicyEngine.evaluateMembershipPolicy() and organizationEmploymentPolicy.
 */
import type { OrganizationEmploymentPolicy } from './organizationEmploymentPolicy';
import {
  DEFAULT_ORGANIZATION_EMPLOYMENT_POLICY,
  loadOrganizationEmploymentPolicy,
} from './organizationEmploymentPolicy';
import {
  evaluateMembershipPolicy,
  type MembershipPolicyEvaluation,
} from './membershipPolicyEngine';
import type { PlatformMembership } from './platformMembership';
import type { RelationshipType } from './membershipTypes';

/** @deprecated Use OrganizationEmploymentPolicy */
export type EmploymentPolicy = Pick<
  OrganizationEmploymentPolicy,
  'maxActiveEmploymentMemberships'
>;

/** @deprecated Use DEFAULT_ORGANIZATION_EMPLOYMENT_POLICY */
export const DEFAULT_EMPLOYMENT_POLICY: EmploymentPolicy = {
  maxActiveEmploymentMemberships:
    DEFAULT_ORGANIZATION_EMPLOYMENT_POLICY.maxActiveEmploymentMemberships,
};

/** @deprecated Use MembershipPolicyEvaluation */
export type InvitationAcceptanceValidation = Omit<MembershipPolicyEvaluation, 'reason'> & {
  reason?:
    | 'DUAL_EMPLOYMENT'
    | 'ORG_MEMBERSHIP_POLICY'
    | MembershipPolicyEvaluation['reason'];
};

/** @deprecated Use evaluateMembershipPolicy */
export function validateInvitationAcceptance(input: {
  proposedMembershipType: RelationshipType;
  proposedOrganizationId?: string;
  proposedOrganizationName?: string;
  existingMemberships: PlatformMembership[];
  employmentPolicy?: EmploymentPolicy;
}): InvitationAcceptanceValidation {
  const evaluation = evaluateMembershipPolicy({
    proposedRelationshipType: input.proposedMembershipType,
    proposedOrganizationId: input.proposedOrganizationId,
    proposedOrganizationName: input.proposedOrganizationName,
    existingMemberships: input.existingMemberships,
    organizationEmploymentPolicy: {
      ...DEFAULT_ORGANIZATION_EMPLOYMENT_POLICY,
      maxActiveEmploymentMemberships:
        input.employmentPolicy?.maxActiveEmploymentMemberships ??
        DEFAULT_ORGANIZATION_EMPLOYMENT_POLICY.maxActiveEmploymentMemberships,
    },
  });

  if (evaluation.reason === 'ACTIVE_EMPLOYMENT_EXISTS') {
    return { ...evaluation, reason: 'DUAL_EMPLOYMENT' };
  }

  return evaluation;
}

/** @deprecated Use loadOrganizationEmploymentPolicy */
export async function loadEmploymentPolicy(
  scope?: { organizationId?: string },
): Promise<EmploymentPolicy> {
  const policy = await loadOrganizationEmploymentPolicy(scope?.organizationId);
  return { maxActiveEmploymentMemberships: policy.maxActiveEmploymentMemberships };
}
