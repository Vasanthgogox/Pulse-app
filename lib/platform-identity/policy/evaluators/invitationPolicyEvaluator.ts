import type { IdentityInvitation } from '@/lib/onboarding/identityTypes';

import type { PolicyDecision } from '../policyDecision';

export function evaluateInvitationPolicyV1(input: {
  invitationStatus?: IdentityInvitation['status'];
}): PolicyDecision {
  if (input.invitationStatus === 'accepted') {
    return {
      evaluatorId: 'invitation_v1',
      allowed: false,
      reason: 'INVITATION_ALREADY_ACCEPTED',
      message: 'This invitation has already been accepted.',
    };
  }

  if (input.invitationStatus === 'expired') {
    return {
      evaluatorId: 'invitation_v1',
      allowed: false,
      reason: 'INVITATION_EXPIRED',
      message: 'This invitation has expired. Ask your workspace admin to send a new one.',
      requiredActions: ['REQUEST_NEW_INVITATION'],
    };
  }

  return { evaluatorId: 'invitation_v1', allowed: true };
}
