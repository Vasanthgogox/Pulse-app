export type MembershipPolicyRequiredAction =
  | 'LEAVE_ORGANIZATION'
  | 'COMPLETE_SSO'
  | 'VERIFY_CORPORATE_EMAIL'
  | 'VERIFY_PHONE'
  | 'REQUEST_NEW_INVITATION'
  | 'CONTRACTOR_APPROVAL'
  | 'HR_APPROVAL'
  | 'CONTACT_ADMIN';

export type PolicyEvaluatorId =
  | 'person_status_v1'
  | 'employment_v1'
  | 'organization_status_v1'
  | 'identity_provider_v1'
  | 'invitation_v1'
  | 'compliance_v1'
  | 'geographic_v1'
  | 'licensing_v1';

export type PolicyDecisionReason =
  | 'ACTIVE_EMPLOYMENT_EXISTS'
  | 'PERSON_SUSPENDED'
  | 'PERSON_LOCKED'
  | 'PERSON_DELETED'
  | 'ORGANIZATION_SUSPENDED'
  | 'ORGANIZATION_ARCHIVED'
  | 'ORGANIZATION_DELETED'
  | 'ORG_MEMBERSHIP_POLICY'
  | 'SSO_REQUIRED'
  | 'CORPORATE_EMAIL_REQUIRED'
  | 'PHONE_VERIFICATION_REQUIRED'
  | 'INVITATION_EXPIRED'
  | 'INVITATION_ALREADY_ACCEPTED'
  | 'CONTRACTOR_APPROVAL_REQUIRED'
  | 'COMPLIANCE_BLOCKED'
  | 'LICENSE_EXCEEDED';

export type PolicyDecision = {
  evaluatorId: PolicyEvaluatorId;
  allowed: boolean;
  reason?: PolicyDecisionReason;
  message?: string;
  requiredActions?: MembershipPolicyRequiredAction[];
  metadata?: Record<string, unknown>;
};

export type CombinedPolicyResult = {
  version: 'v1';
  allowed: boolean;
  decisions: PolicyDecision[];
  /** First blocking decision, if any. */
  primaryBlock?: PolicyDecision;
};

export function combinePolicyDecisions(decisions: PolicyDecision[]): CombinedPolicyResult {
  const blocking = decisions.find((d) => !d.allowed);
  return {
    version: 'v1',
    allowed: !blocking,
    decisions,
    primaryBlock: blocking,
  };
}

export function policyResultToError(result: CombinedPolicyResult): Error | null {
  if (result.allowed) return null;
  return new Error(result.primaryBlock?.message ?? 'Action not allowed by platform policy.');
}
