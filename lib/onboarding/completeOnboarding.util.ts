/**
 * @deprecated Use platformIdentityService.acceptInvitation().
 */
import type { QueryClient } from '@tanstack/react-query';

import {
  platformIdentityService,
  type AcceptInvitationDeps,
  type AcceptInvitationInput,
} from '@/lib/platform-identity';

export type CompleteOnboardingDeps = AcceptInvitationDeps & {
  queryClient: QueryClient;
};

export type CompleteOnboardingInput = AcceptInvitationInput & {
  /** @deprecated Use proposedRelationshipType */
  membershipType?: AcceptInvitationInput['proposedRelationshipType'];
};

export type CompleteOnboardingResult = {
  error: Error | null;
  organizationId: string | null;
  blockedReason?: string;
  requiredActions?: import('./membershipPolicyEngine').MembershipPolicyRequiredAction[];
};

export async function completeOnboardingAfterJoin(
  organizationId: string,
  deps: CompleteOnboardingDeps,
): Promise<CompleteOnboardingResult> {
  const result = await platformIdentityService.switchWorkspace({
    organizationId,
    deps,
  });
  if (deps.clearPending) {
    await deps.clearPending();
  }
  return { error: result.error, organizationId: result.error ? null : organizationId };
}

export async function completeOnboarding(
  input: CompleteOnboardingInput,
  deps: CompleteOnboardingDeps,
): Promise<CompleteOnboardingResult> {
  const result = await platformIdentityService.acceptInvitation(
    {
      ...input,
      proposedRelationshipType:
        input.proposedRelationshipType ?? input.membershipType,
    },
    deps,
  );
  return {
    error: result.error,
    organizationId: result.organizationId,
    blockedReason: result.policy?.primaryBlock?.reason,
    requiredActions: result.policy?.primaryBlock?.requiredActions,
  };
}
