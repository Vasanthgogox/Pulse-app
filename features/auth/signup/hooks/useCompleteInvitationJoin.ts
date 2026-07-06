import { useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/contexts/AuthContext';
import { useActiveWorkspace } from '@/contexts/ActiveWorkspaceContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { usePendingOnboarding } from '@/contexts/PendingOnboardingContext';
import { platformIdentityService } from '@/lib/platform-identity';

export function useCompleteInvitationJoin() {
  const { refreshSession } = useAuth();
  const { refreshOrganization } = useOrganization();
  const { refresh: refreshWorkspaces, switchWorkspace } = useActiveWorkspace();
  const { clearPending } = usePendingOnboarding();
  const queryClient = useQueryClient();

  const deps = useMemo(
    () => ({
      refreshSession,
      refreshOrganization,
      refreshWorkspaces,
      switchWorkspace,
      queryClient,
      clearPending,
    }),
    [
      clearPending,
      queryClient,
      refreshOrganization,
      refreshSession,
      refreshWorkspaces,
      switchWorkspace,
    ],
  );

  const completeInvitationJoin = useCallback(
    async (inviteId: string): Promise<{ error: Error | null; organizationId: string | null }> => {
      return platformIdentityService.acceptInvitation(
        { inviteId, proposedRelationshipType: 'EMPLOYEE' },
        deps,
      );
    },
    [deps],
  );

  /** Phone invite id when present; otherwise accepts sole membership invite. */
  const completeTeamJoinAfterAuth = useCallback(
    async (
      inviteId?: string | null,
    ): Promise<{ error: Error | null; organizationId: string | null }> => {
      return platformIdentityService.acceptInvitation(
        { inviteId, proposedRelationshipType: 'EMPLOYEE' },
        deps,
      );
    },
    [deps],
  );

  const completeOnboardingAfterJoin = useCallback(
    async (organizationId: string) => {
      return platformIdentityService.switchWorkspace({ organizationId, deps });
    },
    [deps],
  );

  return { completeInvitationJoin, completeTeamJoinAfterAuth, completeOnboardingAfterJoin };
}
