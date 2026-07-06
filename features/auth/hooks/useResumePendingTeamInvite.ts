import { useCallback } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/contexts/AuthContext';
import { useOptionalActiveWorkspace } from '@/contexts/ActiveWorkspaceContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useOptionalPendingOnboarding } from '@/contexts/PendingOnboardingContext';
import { acceptTeamInvite } from '@/features/organization/services/members.service';
import { useCompleteInvitationJoin } from '@/features/auth/signup/hooks/useCompleteInvitationJoin';
import { rebuildIdentityAfterJoin } from '@/lib/onboarding/rebuildIdentityAfterJoin.util';
import { ROUTES } from '@/lib/routes';

/**
 * After sign-in, complete a pending team invitation stored during signup / invite flow.
 */
export function useResumePendingTeamInvite() {
  const router = useRouter();
  const { refreshSession } = useAuth();
  const { refreshOrganization } = useOrganization();
  const workspace = useOptionalActiveWorkspace();
  const refreshWorkspaces = workspace?.refresh ?? (async () => {});
  const switchWorkspace = workspace?.switchWorkspace ?? (async () => {});
  const queryClient = useQueryClient();
  const pendingCtx = useOptionalPendingOnboarding();
  const { completeInvitationJoin } = useCompleteInvitationJoin();

  const resumePendingTeamInvite = useCallback(async (): Promise<boolean> => {
    const pending = pendingCtx?.pending;
    if (!pending?.inviteId) return false;

    const joinResult = await completeInvitationJoin(pending.inviteId);
    if (joinResult.error) {
      const msg = joinResult.error.message;
      if (/phone number does not match/i.test(msg)) {
        Alert.alert(
          'Phone mismatch',
          'This invite is tied to a different mobile number than your account. Ask your admin to invite your registered email, or update your profile phone to match the invite.',
        );
      } else if (/no longer valid|expired/i.test(msg)) {
        Alert.alert('Invitation expired', 'Ask your workspace admin to send a new invitation.');
      } else {
        Alert.alert('Could not join workspace', msg);
      }
      return false;
    }

    await refreshSession();
    router.replace(ROUTES.TABS.TRIPS as Parameters<typeof router.replace>[0]);
    return true;
  }, [completeInvitationJoin, pendingCtx?.pending, refreshSession, router]);

  const resumeMembershipInvite = useCallback(
    async (organizationId: string): Promise<boolean> => {
      const { error } = await acceptTeamInvite(organizationId);
      if (error) {
        Alert.alert('Could not accept invitation', error.message);
        return false;
      }
      await rebuildIdentityAfterJoin({
        organizationId,
        refreshSession,
        refreshOrganization,
        refreshWorkspaces,
        switchWorkspace,
        queryClient,
      });
      await pendingCtx?.clearPending();
      router.replace(ROUTES.TABS.TRIPS as Parameters<typeof router.replace>[0]);
      return true;
    },
    [
      pendingCtx,
      queryClient,
      refreshOrganization,
      refreshSession,
      refreshWorkspaces,
      router,
      switchWorkspace,
    ],
  );

  return { resumePendingTeamInvite, resumeMembershipInvite };
}
