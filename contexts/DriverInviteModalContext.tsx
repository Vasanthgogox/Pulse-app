import { DriverInviteModal } from '@/components/driver/DriverInviteModal';
import { ThemedConfirmModal } from '@/components/ThemedConfirmModal';
import { useAuth } from '@/contexts/AuthContext';
import type { DriverInviteRow } from '@/features/drivers/services/drivers.service';
import * as driversService from '@/features/drivers/services/drivers.service';
import {
  driverInvitesReceivedQueryKey,
  useDriverInvitesQuery,
} from '@/lib/queries/useDriverInvitesQuery';
import { subscribeSharedPostgresChanges } from '@/lib/realtimeRegistry';
import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Alert, AppState, Platform, type AppStateStatus } from 'react-native';

type DriverInviteModalContextValue = {
  allInvites: DriverInviteRow[];
  pendingCount: number;
  pendingInvites: DriverInviteRow[];
  refreshInvites: () => Promise<void>;
  presentPendingInvite: () => void;
  fleetConnectionRevision: number;
};

const DriverInviteModalContext = createContext<DriverInviteModalContextValue | null>(null);

export function useOptionalDriverInviteModal(): DriverInviteModalContextValue | null {
  return useContext(DriverInviteModalContext);
}

export function useDriverInviteModal(): DriverInviteModalContextValue {
  const ctx = useContext(DriverInviteModalContext);
  if (!ctx) {
    throw new Error('useDriverInviteModal must be used within DriverInviteModalProvider');
  }
  return ctx;
}

export function DriverInviteModalProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const uid = profile?.uid ?? null;
  const queryClient = useQueryClient();

  const {
    allInvites,
    pendingInvites,
    pendingCount,
    refreshInvites,
    isError,
    error,
  } = useDriverInvitesQuery(uid);

  const [sessionSnoozedIds, setSessionSnoozedIds] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [declineTarget, setDeclineTarget] = useState<DriverInviteRow | null>(null);
  const [fleetConnectionRevision, setFleetConnectionRevision] = useState(0);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  const bumpFleetConnectionRevision = useCallback(() => {
    setFleetConnectionRevision((n) => n + 1);
  }, []);

  const invalidateInvites = useCallback(() => {
    if (!uid) return;
    void queryClient.invalidateQueries({
      queryKey: driverInvitesReceivedQueryKey(uid),
    });
  }, [queryClient, uid]);

  const clearSessionSnooze = useCallback(() => {
    setSessionSnoozedIds(new Set());
  }, []);

  useEffect(() => {
    if (!isError || !__DEV__ || !error) return;
    const msg = error instanceof Error ? error.message : String(error);
    console.warn('[DriverInviteModal] invites query:', msg);
  }, [isError, error]);

  /** Foreground resume: show snoozed invites again + one cache invalidation (no pathname / setInterval). */
  useEffect(() => {
    if (!uid) return;

    const onAppStateChange = (nextState: AppStateStatus) => {
      const prev = appStateRef.current;
      appStateRef.current = nextState;
      const becameActive =
        nextState === 'active' && (prev === 'background' || prev === 'inactive');
      if (becameActive) {
        clearSessionSnooze();
        invalidateInvites();
      }
    };

    const sub = AppState.addEventListener('change', onAppStateChange);
    return () => sub.remove();
  }, [uid, clearSessionSnooze, invalidateInvites]);

  /** Event-driven refresh when fleet sends or updates an invitation. */
  useEffect(() => {
    if (!uid) return;

    return subscribeSharedPostgresChanges(
      `driver-invites-received-${uid}`,
      [
        {
          event: 'INSERT',
          schema: 'public',
          table: 'driver_invites',
          filter: `to_user_id=eq.${uid}`,
        },
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'driver_invites',
          filter: `to_user_id=eq.${uid}`,
        },
      ],
      (payload) => {
        const row = payload.new as { status?: string } | null;
        const isPending =
          row != null && String(row.status ?? '').toLowerCase() === 'pending';
        invalidateInvites();
        if (isPending) clearSessionSnooze();
      },
    );
  }, [uid, invalidateInvites, clearSessionSnooze]);

  const visiblePendingInvites = useMemo(
    () => pendingInvites.filter((i) => !sessionSnoozedIds.has(i.id)),
    [pendingInvites, sessionSnoozedIds],
  );

  const activeInvite = visiblePendingInvites[0] ?? null;
  const showModal = !!activeInvite && !declineTarget;

  const presentPendingInvite = useCallback(() => {
    clearSessionSnooze();
    if (pendingCount === 0) void refreshInvites();
  }, [pendingCount, refreshInvites, clearSessionSnooze]);

  const handleLater = useCallback(() => {
    if (!activeInvite) return;
    setSessionSnoozedIds((prev) => new Set(prev).add(activeInvite.id));
  }, [activeInvite]);

  const handleAccept = useCallback(async () => {
    if (!activeInvite) return;
    setBusyId(activeInvite.id);
    const { error: acceptError } = await driversService.acceptDriverInvite(activeInvite.id);
    setBusyId(null);
    if (acceptError) {
      Alert.alert('Accept failed', acceptError.message ?? 'Could not accept invite. Try again.');
      return;
    }
    setSessionSnoozedIds((prev) => {
      const next = new Set(prev);
      next.delete(activeInvite.id);
      return next;
    });
    invalidateInvites();
    bumpFleetConnectionRevision();
  }, [activeInvite, invalidateInvites, bumpFleetConnectionRevision]);

  const runDecline = useCallback(
    async (invite: DriverInviteRow) => {
      setBusyId(invite.id);
      const { error: declineError } = await driversService.rejectDriverInvite(invite.id);
      setBusyId(null);
      setDeclineTarget(null);
      if (declineError) {
        Alert.alert('Decline failed', declineError.message ?? 'Could not decline invite. Try again.');
        return;
      }
      setSessionSnoozedIds((prev) => {
        const next = new Set(prev);
        next.delete(invite.id);
        return next;
      });
      invalidateInvites();
      bumpFleetConnectionRevision();
    },
    [invalidateInvites, bumpFleetConnectionRevision],
  );

  const handleDeclinePress = useCallback(() => {
    if (!activeInvite) return;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const ok = window.confirm(
        'Decline invitation?\n\nYou will reject this fleet connection invitation.',
      );
      if (ok) void runDecline(activeInvite);
      return;
    }
    setDeclineTarget(activeInvite);
  }, [activeInvite, runDecline]);

  const value = useMemo(
    (): DriverInviteModalContextValue => ({
      allInvites,
      pendingCount,
      pendingInvites,
      refreshInvites,
      presentPendingInvite,
      fleetConnectionRevision,
    }),
    [
      allInvites,
      pendingCount,
      pendingInvites,
      refreshInvites,
      presentPendingInvite,
      fleetConnectionRevision,
    ],
  );

  return (
    <DriverInviteModalContext.Provider value={value}>
      {children}

      {uid && activeInvite ? (
        <DriverInviteModal
          visible={showModal}
          invite={activeInvite}
          queueIndex={
            pendingInvites.findIndex((i) => i.id === activeInvite.id) + 1 || 1
          }
          queueTotal={pendingInvites.length}
          busy={busyId === activeInvite.id}
          onAccept={() => void handleAccept()}
          onDecline={handleDeclinePress}
          onLater={handleLater}
        />
      ) : null}

      <ThemedConfirmModal
        visible={!!declineTarget}
        title="Decline invitation?"
        message="You will reject this fleet connection invitation."
        cancelText="Cancel"
        confirmText="Decline"
        variant="warning"
        confirmVariant="destructive"
        onCancel={() => setDeclineTarget(null)}
        onConfirm={() => {
          if (declineTarget) void runDecline(declineTarget);
        }}
        onRequestClose={() => setDeclineTarget(null)}
      />
    </DriverInviteModalContext.Provider>
  );
}
