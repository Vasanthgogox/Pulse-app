import { useEffect, useRef } from 'react';

import { useAuth } from '@/contexts/AuthContext';
import { useOptionalPendingOnboarding } from '@/contexts/PendingOnboardingContext';
import { useResumePendingTeamInvite } from '@/features/auth/hooks/useResumePendingTeamInvite';
import { getMyTeamInvites } from '@/features/organization/services/members.service';

/**
 * After authentication, complete pending phone invites or single membership invites.
 */
export function PendingInviteResumeGate() {
  const { user, status } = useAuth();
  const pendingCtx = useOptionalPendingOnboarding();
  const { resumePendingTeamInvite, resumeMembershipInvite } = useResumePendingTeamInvite();
  const resumeAttemptedRef = useRef<string | null>(null);

  useEffect(() => {
    const uid = user?.uid;
    if (status !== 'authenticated' || !uid || !pendingCtx?.isHydrated) return;
    if (resumeAttemptedRef.current === uid) return;

    resumeAttemptedRef.current = uid;

    void (async () => {
      const pendingInviteId = pendingCtx.pending?.inviteId;
      if (pendingInviteId) {
        await resumePendingTeamInvite();
        return;
      }

      const { invites, error } = await getMyTeamInvites();
      if (error || invites.length !== 1) return;

      await resumeMembershipInvite(invites[0]!.organization_id);
    })();
  }, [
    pendingCtx?.isHydrated,
    pendingCtx?.pending?.inviteId,
    resumeMembershipInvite,
    resumePendingTeamInvite,
    status,
    user?.uid,
  ]);

  return null;
}
