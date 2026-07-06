import type { OrganizationIdentityPolicy } from '@/lib/onboarding/organizationIdentityPolicy';
import { missingRequiredIdentities } from '@/lib/onboarding/organizationIdentityPolicy';
import type { InvitationIdentity } from '@/lib/onboarding/identityTypes';

import type { PolicyDecision } from '../policyDecision';

export function evaluateIdentityProviderPolicyV1(input: {
  organizationIdentityPolicy?: OrganizationIdentityPolicy;
  verifiedIdentities?: InvitationIdentity[];
}): PolicyDecision {
  if (!input.organizationIdentityPolicy) {
    return { evaluatorId: 'identity_provider_v1', allowed: true };
  }

  const missing = missingRequiredIdentities(
    input.organizationIdentityPolicy,
    input.verifiedIdentities ?? [],
  );

  if (missing.includes('entra') || missing.includes('google') || missing.includes('okta')) {
    return {
      evaluatorId: 'identity_provider_v1',
      allowed: false,
      reason: 'SSO_REQUIRED',
      message: 'This organization requires signing in through your company SSO provider.',
      requiredActions: ['COMPLETE_SSO'],
    };
  }

  if (missing.includes('email')) {
    return {
      evaluatorId: 'identity_provider_v1',
      allowed: false,
      reason: 'CORPORATE_EMAIL_REQUIRED',
      message: 'This organization requires a verified corporate email address.',
      requiredActions: ['VERIFY_CORPORATE_EMAIL'],
    };
  }

  if (missing.includes('phone')) {
    return {
      evaluatorId: 'identity_provider_v1',
      allowed: false,
      reason: 'PHONE_VERIFICATION_REQUIRED',
      message: 'This organization requires a verified phone number.',
      requiredActions: ['VERIFY_PHONE'],
    };
  }

  return { evaluatorId: 'identity_provider_v1', allowed: true };
}
