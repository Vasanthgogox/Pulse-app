import { ThemedConfirmModal } from '@/components/ThemedConfirmModal';
import { useOptionalOrganization } from '@/contexts/OrganizationContext';
import { BusinessConnectionRequestModal } from '@/features/network/components/BusinessConnectionRequestModal';
import { isConnectionProtocolInvite } from '@/features/network/utils/businessConnectionOffer.util';
import type { InboundProtocolInviteItem } from '@/lib/globalSync/inboundProtocol.types';
import { useInboundProtocolInvites } from '@/lib/globalSync/useInboundProtocolInvites';
import { useInboundProtocolInviteActions } from '@/lib/hooks/useInboundProtocolInviteActions';
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

type BusinessConnectionRequestModalContextValue = {
  pendingConnectionCount: number;
  pendingConnectionInvites: InboundProtocolInviteItem[];
  presentPendingConnectionRequest: () => void;
  refreshConnectionRequests: () => Promise<void>;
};

const BusinessConnectionRequestModalContext =
  createContext<BusinessConnectionRequestModalContextValue | null>(null);

export function useOptionalBusinessConnectionRequestModal(): BusinessConnectionRequestModalContextValue | null {
  return useContext(BusinessConnectionRequestModalContext);
}

export function useBusinessConnectionRequestModal(): BusinessConnectionRequestModalContextValue {
  const ctx = useContext(BusinessConnectionRequestModalContext);
  if (!ctx) {
    throw new Error(
      'useBusinessConnectionRequestModal must be used within BusinessConnectionRequestModalProvider',
    );
  }
  return ctx;
}

export function BusinessConnectionRequestModalProvider({ children }: { children: ReactNode }) {
  const org = useOptionalOrganization();
  const orgId = org?.currentOrganization?.id ?? null;

  const { receivedItems, refreshInboundProtocol } = useInboundProtocolInvites(orgId);
  const { inviteActionId, handleInviteAction } = useInboundProtocolInviteActions(orgId);

  const pendingConnectionInvites = useMemo(
    () => receivedItems.filter(isConnectionProtocolInvite),
    [receivedItems],
  );

  const [sessionSnoozedIds, setSessionSnoozedIds] = useState<Set<string>>(new Set());
  const [queueViewIndex, setQueueViewIndex] = useState(0);
  const [declineTarget, setDeclineTarget] = useState<InboundProtocolInviteItem | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  const clearSessionSnooze = useCallback(() => {
    setSessionSnoozedIds(new Set());
    setQueueViewIndex(0);
  }, []);

  const refreshConnectionRequests = useCallback(async () => {
    await refreshInboundProtocol();
  }, [refreshInboundProtocol]);

  useEffect(() => {
    if (!orgId) return;

    const onAppStateChange = (nextState: AppStateStatus) => {
      const prev = appStateRef.current;
      appStateRef.current = nextState;
      const becameActive =
        nextState === 'active' && (prev === 'background' || prev === 'inactive');
      if (becameActive) {
        clearSessionSnooze();
        void refreshInboundProtocol();
      }
    };

    const sub = AppState.addEventListener('change', onAppStateChange);
    return () => sub.remove();
  }, [orgId, clearSessionSnooze, refreshInboundProtocol]);

  const visiblePendingInvites = useMemo(
    () => pendingConnectionInvites.filter((i) => !sessionSnoozedIds.has(i.id)),
    [pendingConnectionInvites, sessionSnoozedIds],
  );

  useEffect(() => {
    if (queueViewIndex >= visiblePendingInvites.length && visiblePendingInvites.length > 0) {
      setQueueViewIndex(0);
    }
  }, [queueViewIndex, visiblePendingInvites.length]);

  const activeInvite =
    visiblePendingInvites.length > 0
      ? visiblePendingInvites[queueViewIndex % visiblePendingInvites.length]
      : null;

  const showModal = !!activeInvite && !declineTarget;

  const presentPendingConnectionRequest = useCallback(() => {
    clearSessionSnooze();
    if (pendingConnectionInvites.length === 0) void refreshInboundProtocol();
  }, [clearSessionSnooze, pendingConnectionInvites.length, refreshInboundProtocol]);

  const handleLater = useCallback(() => {
    if (!activeInvite) return;
    setSessionSnoozedIds((prev) => new Set(prev).add(activeInvite.id));
  }, [activeInvite]);

  const handleNext = useCallback(() => {
    if (visiblePendingInvites.length <= 1) return;
    setQueueViewIndex((i) => (i + 1) % visiblePendingInvites.length);
  }, [visiblePendingInvites.length]);

  const handleAccept = useCallback(async () => {
    if (!activeInvite) return;
    await handleInviteAction(activeInvite, 'approve');
    setSessionSnoozedIds((prev) => {
      const next = new Set(prev);
      next.delete(activeInvite.id);
      return next;
    });
    setQueueViewIndex(0);
  }, [activeInvite, handleInviteAction]);

  const runDecline = useCallback(
    async (item: InboundProtocolInviteItem) => {
      await handleInviteAction(item, 'reject');
      setDeclineTarget(null);
      setSessionSnoozedIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
      setQueueViewIndex(0);
    },
    [handleInviteAction],
  );

  const handleDeclinePress = useCallback(() => {
    if (!activeInvite) return;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const ok = window.confirm(
        'Decline connection request?\n\nYou will reject this business connection invitation.',
      );
      if (ok) void runDecline(activeInvite);
      return;
    }
    setDeclineTarget(activeInvite);
  }, [activeInvite, runDecline]);

  const value = useMemo(
    (): BusinessConnectionRequestModalContextValue => ({
      pendingConnectionCount: pendingConnectionInvites.length,
      pendingConnectionInvites,
      presentPendingConnectionRequest,
      refreshConnectionRequests,
    }),
    [
      pendingConnectionInvites,
      presentPendingConnectionRequest,
      refreshConnectionRequests,
    ],
  );

  const queueIndex =
    activeInvite != null
      ? visiblePendingInvites.findIndex((i) => i.id === activeInvite.id) + 1 || 1
      : 1;

  return (
    <BusinessConnectionRequestModalContext.Provider value={value}>
      {children}

      {orgId && activeInvite ? (
        <BusinessConnectionRequestModal
          key={activeInvite.id}
          visible={showModal}
          invite={activeInvite}
          queueIndex={queueIndex}
          queueTotal={visiblePendingInvites.length}
          busy={inviteActionId === activeInvite.id}
          onAccept={() => void handleAccept()}
          onDecline={handleDeclinePress}
          onLater={handleLater}
          onNext={visiblePendingInvites.length > 1 ? handleNext : undefined}
        />
      ) : null}

      <ThemedConfirmModal
        visible={!!declineTarget}
        title="Decline connection request?"
        message="You will reject this business connection invitation."
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
    </BusinessConnectionRequestModalContext.Provider>
  );
}
