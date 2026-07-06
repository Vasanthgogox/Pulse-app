import type { OrganizationEmploymentPolicy } from '@/lib/onboarding/organizationEmploymentPolicy';
import { DEFAULT_ORGANIZATION_EMPLOYMENT_POLICY } from '@/lib/onboarding/organizationEmploymentPolicy';
import type { PlatformMembership } from '@/lib/onboarding/platformMembership';
import { activeEmploymentRelationships } from '@/lib/onboarding/platformMembership';
import type { PersonStatus, RelationshipType } from '@/lib/onboarding/membershipTypes';
import { isEmploymentRelationship, isPersonAccessAllowed } from '@/lib/onboarding/membershipTypes';

import type { PolicyDecision } from '../policyDecision';

function dualEmploymentMessage(blocking: PlatformMembership): string {
  const org = blocking.organizationName?.trim() || 'another organization';
  return `You are currently employed by ${org}. Leave that organization before joining another employer.`;
}

export function evaluatePersonStatusPolicyV1(personStatus: PersonStatus): PolicyDecision {
  if (isPersonAccessAllowed(personStatus)) {
    return { evaluatorId: 'person_status_v1', allowed: true };
  }
  const reason =
    personStatus === 'LOCKED'
      ? 'PERSON_LOCKED'
      : personStatus === 'DELETED'
        ? 'PERSON_DELETED'
        : 'PERSON_SUSPENDED';
  return {
    evaluatorId: 'person_status_v1',
    allowed: false,
    reason,
    message: 'Your account cannot accept invitations at this time.',
    requiredActions: ['CONTACT_ADMIN'],
  };
}

export function evaluateEmploymentPolicyV1(input: {
  proposedRelationshipType: RelationshipType;
  proposedOrganizationId?: string;
  existingMemberships: PlatformMembership[];
  organizationEmploymentPolicy?: OrganizationEmploymentPolicy;
}): PolicyDecision {
  if (!isEmploymentRelationship(input.proposedRelationshipType)) {
    return { evaluatorId: 'employment_v1', allowed: true };
  }

  const policy = input.organizationEmploymentPolicy ?? DEFAULT_ORGANIZATION_EMPLOYMENT_POLICY;
  if (policy.allowDualEmployment) {
    return { evaluatorId: 'employment_v1', allowed: true };
  }

  const activeEmployments = activeEmploymentRelationships(input.existingMemberships).filter(
    (m) => m.organizationId !== input.proposedOrganizationId,
  );

  if (activeEmployments.length >= policy.maxActiveEmploymentMemberships) {
    const blocking = activeEmployments[0]!;
    return {
      evaluatorId: 'employment_v1',
      allowed: false,
      reason: 'ACTIVE_EMPLOYMENT_EXISTS',
      message: dualEmploymentMessage(blocking),
      requiredActions: ['LEAVE_ORGANIZATION'],
      metadata: { blockingOrganizationId: blocking.organizationId },
    };
  }

  return { evaluatorId: 'employment_v1', allowed: true };
}
