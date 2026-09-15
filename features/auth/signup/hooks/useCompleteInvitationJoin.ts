import { useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/contexts/AuthContext';
import { useOptionalActiveWorkspace } from '@/contexts/ActiveWorkspaceContext';
import { useOptionalOrganization } from '@/contexts/OrganizationContext';
import { useOptionalPendingOnboarding } from '@/contexts/PendingOnboardingContext';
import { platformIdentityService } from '@/lib/platform-identity';
import type { IdentityInvitation } from '@/lib/onboarding/identityTypes';

export type CompleteInvitationJoinOptions = {
  invitationStatus?: IdentityInvitation['status'];
  /** The invitation's assigned role (e.g. a PlatformTeamRole) — carried into the resulting workspace context. */
  role?: string;
};

export function useCompleteInvitationJoin() {
  const { refreshSession } = useAuth();
  const orgCtx = useOptionalOrganization();
  const refreshOrganization = orgCtx?.refreshOrganization ?? (async () => {});
  const workspace = useOptionalActiveWorkspace();
  const refreshWorkspaces = workspace?.refresh ?? (async () => {});
  const switchWorkspace = workspace?.switchWorkspace ?? (async () => {});
  const pendingCtx = useOptionalPendingOnboarding();
  const clearPending = pendingCtx?.clearPending ?? (async () => {});
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
    async (
      inviteId: string,
      options?: CompleteInvitationJoinOptions,
    ): Promise<{ error: Error | null; organizationId: string | null }> => {
      return platformIdentityService.acceptInvitation(
        {
          inviteId,
          proposedRelationshipType: 'EMPLOYEE',
          invitationStatus: options?.invitationStatus,
          role: options?.role,
        },
        deps,
      );
    },
    [deps],
  );

  /** Phone invite id when present; otherwise accepts sole membership invite. */
  const completeTeamJoinAfterAuth = useCallback(
    async (
      inviteId?: string | null,
      options?: CompleteInvitationJoinOptions,
    ): Promise<{ error: Error | null; organizationId: string | null }> => {
      return platformIdentityService.acceptInvitation(
        {
          inviteId,
          proposedRelationshipType: 'EMPLOYEE',
          invitationStatus: options?.invitationStatus,
          role: options?.role,
        },
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
