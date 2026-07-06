/**
 * Persists invitation selection across signup steps, auth, and app restarts.
 * Enables resumable member onboarding (deep links, email invites, reconnect).
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import type { InvitePhase } from '@/features/auth/signup/signupInviteTypes';
import type {
  InvitationResolverResult,
  ResolvedTeamInvitation,
} from '@/features/organization/services/teamInvitationResolver.service';
import {
  clearPendingMemberInvitation,
  loadPendingMemberInvitation,
  savePendingMemberInvitation,
  type PendingMemberInvitation,
} from '@/lib/onboarding/pendingOnboardingStorage.util';

type PendingOnboardingState = {
  pending: PendingMemberInvitation | null;
  isHydrated: boolean;
  setPendingInvitation: (input: {
    phone: string;
    resolved: InvitationResolverResult;
    phase: InvitePhase;
    inviteId: string | null;
    invitation: ResolvedTeamInvitation | null;
  }) => Promise<void>;
  clearPending: () => Promise<void>;
};

const PendingOnboardingContext = createContext<PendingOnboardingState | undefined>(
  undefined,
);

export function PendingOnboardingProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingMemberInvitation | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const stored = await loadPendingMemberInvitation();
      if (!cancelled) {
        setPending(stored);
        setIsHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setPendingInvitation = useCallback(
    async (input: {
      phone: string;
      resolved: InvitationResolverResult;
      phase: InvitePhase;
      inviteId: string | null;
      invitation: ResolvedTeamInvitation | null;
    }) => {
      const next: PendingMemberInvitation = {
        version: 1,
        phone: input.phone,
        inviteId: input.inviteId,
        invitation: input.invitation,
        resolved: input.resolved,
        phase: input.phase,
        savedAt: new Date().toISOString(),
      };
      setPending(next);
      await savePendingMemberInvitation(next);
    },
    [],
  );

  const clearPending = useCallback(async () => {
    setPending(null);
    await clearPendingMemberInvitation();
  }, []);

  const value = useMemo(
    () => ({ pending, isHydrated, setPendingInvitation, clearPending }),
    [pending, isHydrated, setPendingInvitation, clearPending],
  );

  return (
    <PendingOnboardingContext.Provider value={value}>
      {children}
    </PendingOnboardingContext.Provider>
  );
}

export function usePendingOnboarding(): PendingOnboardingState {
  const ctx = useContext(PendingOnboardingContext);
  if (!ctx) {
    throw new Error('usePendingOnboarding must be used within PendingOnboardingProvider');
  }
  return ctx;
}

export function useOptionalPendingOnboarding(): PendingOnboardingState | undefined {
  return useContext(PendingOnboardingContext);
}
