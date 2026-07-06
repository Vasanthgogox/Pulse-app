import {
  isOrganizationJoinable,
  loadOrganizationStatus,
  organizationStatusBlockedMessage,
  type OrganizationStatus,
} from '../../types/organizationStatus';
import type { PolicyDecision } from '../policyDecision';

export function evaluateOrganizationStatusPolicyV1(input: {
  organizationId?: string;
  organizationName?: string;
  organizationStatus?: OrganizationStatus;
}): PolicyDecision {
  if (!input.organizationId) {
    return { evaluatorId: 'organization_status_v1', allowed: true };
  }

  const status = input.organizationStatus ?? 'ACTIVE';
  if (isOrganizationJoinable(status)) {
    return { evaluatorId: 'organization_status_v1', allowed: true };
  }

  const name = input.organizationName?.trim() || 'This organization';
  const reason =
    status === 'SUSPENDED'
      ? 'ORGANIZATION_SUSPENDED'
      : status === 'ARCHIVED'
        ? 'ORGANIZATION_ARCHIVED'
        : 'ORGANIZATION_DELETED';

  return {
    evaluatorId: 'organization_status_v1',
    allowed: false,
    reason,
    message: organizationStatusBlockedMessage(name, status),
    requiredActions: ['CONTACT_ADMIN'],
    metadata: { organizationId: input.organizationId, status },
  };
}

export async function evaluateOrganizationStatusPolicyV1Async(input: {
  organizationId?: string;
  organizationName?: string;
}): Promise<PolicyDecision> {
  if (!input.organizationId) {
    return { evaluatorId: 'organization_status_v1', allowed: true };
  }
  const org = await loadOrganizationStatus(input.organizationId);
  return evaluateOrganizationStatusPolicyV1({
    organizationId: input.organizationId,
    organizationName: input.organizationName ?? org?.name,
    organizationStatus: org?.status,
  });
}
