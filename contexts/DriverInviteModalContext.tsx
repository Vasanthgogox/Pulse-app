import { DriverInviteModal } from '@/components/driver/DriverInviteModal';
import { ThemedConfirmModal } from '@/components/ThemedConfirmModal';
import { useAuth } from '@/contexts/AuthContext';
import type { DriverInviteRow } from '@/features/drivers/services/drivers.service';
import { subscribeSharedPostgresChanges } from '@/lib/realtimeRegistry';
import * as driversService from '@/services/driversService';
import { usePathname } from 'expo-router';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Alert, AppState, Platform } from 'react-native';

type DriverInviteModalContextValue = {
  pendingCount: number;
  pendingInvites: DriverInviteRow[];
  refreshInvites: () => Promise<void>;
  /** Re-open the fleet invite popup (clears session "view later" dismissals). */
  presentPendingInvite: () => void;
};

const DriverInviteModalContext = createContext<DriverInviteModalContextValue | null>(null);

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
  const pathname = usePathname();

  const [invites, setInvites] = useState<DriverInviteRow[]>([]);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [declineTarget, setDeclineTarget] = useState<DriverInviteRow | null>(null);
  const refreshInvites = useCallback(async () => {
    if (!uid) {
      setInvites([]);
      return;
    }
    const { error, invites: rows } = await driversService.getDriverInvitesReceived();
    if (error && __DEV__) {
      console.warn('[DriverInviteModal] getDriverInvitesReceived:', error.message);
    }
    setInvites(error ? [] : rows ?? []);
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    void refreshInvites();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshInvites();
    });
    return () => sub.remove();
  }, [uid, refreshInvites]);

  useEffect(() => {
    if (!uid) return;
    void refreshInvites();
  }, [uid, pathname, refreshInvites]);

  /** Realtime: show invite popup when fleet sends or re-opens an invitation. */
  useEffect(() => {
    if (!uid) return;

    const unsubscribe = subscribeSharedPostgresChanges(
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
        const row = payload.new as { id?: string; status?: string } | null;
        const inviteId = row?.id;
        const isPending =
          row != null && String(row.status ?? '').toLowerCase() === 'pending';

        void refreshInvites().then(() => {
          if (isPending) {
            setDismissedIds(new Set());
          } else if (inviteId) {
            setDismissedIds((prev) => {
              if (!prev.has(inviteId)) return prev;
              const next = new Set(prev);
              next.delete(inviteId);
              return next;
            });
          }
        });
      },
    );

    return unsubscribe;
  }, [uid, refreshInvites]);

  /** Poll fallback when Realtime publication is not yet applied on remote. */
  useEffect(() => {
    if (!uid) return;
    const interval = setInterval(() => {
      if (AppState.currentState === 'active') {
        void refreshInvites();
      }
    }, 15000);
    return () => clearInterval(interval);
  }, [uid, refreshInvites]);

  const pendingInvites = useMemo(
    () =>
      invites.filter(
        (i) =>
          String(i.status ?? '').toLowerCase() === 'pending' && !dismissedIds.has(i.id),
      ),
    [invites, dismissedIds],
  );

  const allPendingInvites = useMemo(
    () => invites.filter((i) => String(i.status ?? '').toLowerCase() === 'pending'),
    [invites],
  );

  const activeInvite = pendingInvites[0] ?? null;
  const showModal = !!activeInvite && !declineTarget;

  const presentPendingInvite = useCallback(() => {
    if (allPendingInvites.length === 0) {
      void refreshInvites();
      return;
    }
    setDismissedIds(new Set());
  }, [allPendingInvites.length, refreshInvites]);

  const handleLater = useCallback(() => {
    if (!activeInvite) return;
    setDismissedIds((prev) => new Set(prev).add(activeInvite.id));
  }, [activeInvite]);

  const handleAccept = useCallback(async () => {
    if (!activeInvite) return;
    setBusyId(activeInvite.id);
    const { error } = await driversService.acceptDriverInvite(activeInvite.id);
    setBusyId(null);
    if (error) {
      Alert.alert('Accept failed', error.message ?? 'Could not accept invite. Try again.');
      return;
    }
    setDismissedIds((prev) => {
      const next = new Set(prev);
      next.delete(activeInvite.id);
      return next;
    });
    await refreshInvites();
  }, [activeInvite, refreshInvites]);

  const runDecline = useCallback(
    async (invite: DriverInviteRow) => {
      setBusyId(invite.id);
      const { error } = await driversService.rejectDriverInvite(invite.id);
      setBusyId(null);
      setDeclineTarget(null);
      if (error) {
        Alert.alert('Decline failed', error.message ?? 'Could not decline invite. Try again.');
        return;
      }
      setDismissedIds((prev) => {
        const next = new Set(prev);
        next.delete(invite.id);
        return next;
      });
      await refreshInvites();
    },
    [refreshInvites],
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
      pendingCount: allPendingInvites.length,
      pendingInvites: allPendingInvites,
      refreshInvites,
      presentPendingInvite,
    }),
    [allPendingInvites, refreshInvites, presentPendingInvite],
  );

  return (
    <DriverInviteModalContext.Provider value={value}>
      {children}

      {uid && activeInvite ? (
        <DriverInviteModal
          visible={showModal}
          invite={activeInvite}
          queueIndex={1}
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
