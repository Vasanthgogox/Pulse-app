import { ThemedConfirmModal } from '@/components/ThemedConfirmModal';
import { useOptionalAwardedIndentDeployModal } from '@/contexts/AwardedIndentDeployModalContext';
import { useOptionalOrganization } from '@/contexts/OrganizationContext';
import { BusinessConnectionRequestModal } from '@/features/network/components/BusinessConnectionRequestModal';
import { isConnectionProtocolInvite } from '@/features/network/utils/businessConnectionOffer.util';
import {
  clearAutoPromptRecord,
  inviteAutoPromptKey,
  isAutoPromptEligible,
  loadAutoPromptRecord,
  recordAutoPromptDay,
  saveAutoPromptRecord,
  type ConnectionInviteAutoPromptRecord,
} from '@/lib/connectionInviteAutoPrompt.util';
import type { InboundProtocolInviteItem } from '@/lib/globalSync/inboundProtocol.types';
import { useInboundProtocolInvites } from '@/lib/globalSync/useInboundProtocolInvites';
import { useInboundProtocolInviteActions } from '@/lib/hooks/useInboundProtocolInviteActions';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState, Platform, type AppStateStatus } from 'react-native';

import {
  BusinessConnectionRequestModalContext,
  type BusinessConnectionRequestModalContextValue,
} from '@/contexts/BusinessConnectionRequestModalContext.shared';

// Hook-only consumers must import from the .shared file instead — importing this
// module pulls the modal UI (network + indents features) into their graph.
export {
  useBusinessConnectionRequestModal,
  useOptionalBusinessConnectionRequestModal,
} from '@/contexts/BusinessConnectionRequestModalContext.shared';

export function BusinessConnectionRequestModalProvider({ children }: { children: ReactNode }) {
  const org = useOptionalOrganization();
  const orgId = org?.currentOrganization?.id ?? null;
  const deployGate = useOptionalAwardedIndentDeployModal();

  const { receivedItems, refreshInboundProtocol } = useInboundProtocolInvites(orgId);
  const { inviteActionId, handleInviteAction } = useInboundProtocolInviteActions(orgId);

  const pendingConnectionInvites = useMemo(
    () => (receivedItems ?? []).filter(isConnectionProtocolInvite),
    [receivedItems],
  );

  const [sessionSnoozedIds, setSessionSnoozedIds] = useState<Set<string>>(new Set());
  const [queueViewIndex, setQueueViewIndex] = useState(0);
  const [focusedInviteId, setFocusedInviteId] = useState<string | null>(null);
  const [declineTarget, setDeclineTarget] = useState<InboundProtocolInviteItem | null>(null);
  const [promptByPartnerKey, setPromptByPartnerKey] = useState<
    Record<string, ConnectionInviteAutoPromptRecord>
  >({});
  const [promptScheduleLoaded, setPromptScheduleLoaded] = useState(false);
  /** Keeps the auto-prompt modal open until the user dismisses or acts. */
  const [autoPresentedInviteId, setAutoPresentedInviteId] = useState<string | null>(null);
  const recordedAutoPromptRef = useRef<Set<string>>(new Set());
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  const pendingPartnerKeys = useMemo(() => {
    const keys = new Set(pendingConnectionInvites.map(inviteAutoPromptKey));
    return Array.from(keys).sort().join('|');
  }, [pendingConnectionInvites]);

  const clearSessionSnooze = useCallback(() => {
    setSessionSnoozedIds(new Set());
    setQueueViewIndex(0);
    setFocusedInviteId(null);
    setAutoPresentedInviteId(null);
  }, []);

  const refreshConnectionRequests = useCallback(async () => {
    await refreshInboundProtocol();
  }, [refreshInboundProtocol]);

  useEffect(() => {
    if (!orgId) {
      setPromptScheduleLoaded(true);
      return;
    }
    if (pendingPartnerKeys.length === 0) {
      setPromptScheduleLoaded(true);
      return;
    }

    let cancelled = false;
    const partnerKeys = pendingPartnerKeys.split('|').filter(Boolean);

    void (async () => {
      const entries = await Promise.all(
        partnerKeys.map(async (partnerKey) => {
          const record = await loadAutoPromptRecord(orgId, partnerKey);
          return [partnerKey, record] as const;
        }),
      );
      if (cancelled) return;
      setPromptByPartnerKey((prev) => {
        const merged: Record<string, ConnectionInviteAutoPromptRecord> = { ...prev };
        for (const [partnerKey, record] of entries) {
          const existing = merged[partnerKey] ?? { shownDates: [] };
          const dates = [
            ...new Set([...existing.shownDates, ...record.shownDates]),
          ].slice(0, 3);
          merged[partnerKey] = { shownDates: dates };
        }
        return merged;
      });
      setPromptScheduleLoaded(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [orgId, pendingPartnerKeys]);

  const persistAutoPromptDay = useCallback(
    (invite: InboundProtocolInviteItem) => {
      if (!orgId) return;
      const partnerKey = inviteAutoPromptKey(invite);
      setPromptByPartnerKey((prev) => {
        const current = prev[partnerKey] ?? { shownDates: [] };
        const next = recordAutoPromptDay(current);
        void saveAutoPromptRecord(orgId, partnerKey, next);
        return { ...prev, [partnerKey]: next };
      });
    },
    [orgId],
  );

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

  const sessionEligibleInvites = useMemo(
    () => pendingConnectionInvites.filter((i) => !sessionSnoozedIds.has(i.id)),
    [pendingConnectionInvites, sessionSnoozedIds],
  );

  const autoPromptEligibleInvites = useMemo(() => {
    if (!promptScheduleLoaded) return [];
    return sessionEligibleInvites.filter((invite) => {
      const partnerKey = inviteAutoPromptKey(invite);
      const record = promptByPartnerKey[partnerKey] ?? { shownDates: [] };
      return isAutoPromptEligible(record);
    });
  }, [sessionEligibleInvites, promptByPartnerKey, promptScheduleLoaded]);

  useEffect(() => {
    if (
      queueViewIndex >= autoPromptEligibleInvites.length &&
      autoPromptEligibleInvites.length > 0
    ) {
      setQueueViewIndex(0);
    }
  }, [queueViewIndex, autoPromptEligibleInvites.length]);

  const activeInvite = useMemo(() => {
    if (focusedInviteId) {
      return (
        pendingConnectionInvites.find((invite) => invite.id === focusedInviteId) ?? null
      );
    }
    if (autoPresentedInviteId) {
      return (
        pendingConnectionInvites.find((invite) => invite.id === autoPresentedInviteId) ?? null
      );
    }
    if (!promptScheduleLoaded || autoPromptEligibleInvites.length === 0) return null;
    return autoPromptEligibleInvites[queueViewIndex % autoPromptEligibleInvites.length];
  }, [
    focusedInviteId,
    autoPresentedInviteId,
    pendingConnectionInvites,
    autoPromptEligibleInvites,
    promptScheduleLoaded,
    queueViewIndex,
  ]);

  const userOpenedInvite = focusedInviteId != null;
  const blockedByDeploy =
    Boolean(deployGate?.blocksConnectionInvitations) ||
    (Boolean(deployGate?.deferConnectionInvitations) && !userOpenedInvite);

  const showModal = !!activeInvite && !declineTarget && !blockedByDeploy;

  useEffect(() => {
    if (!showModal || !activeInvite || userOpenedInvite) return;
    setAutoPresentedInviteId((prev) => prev ?? activeInvite.id);
    const partnerKey = inviteAutoPromptKey(activeInvite);
    if (recordedAutoPromptRef.current.has(partnerKey)) return;
    recordedAutoPromptRef.current.add(partnerKey);
    persistAutoPromptDay(activeInvite);
  }, [showModal, activeInvite?.id, userOpenedInvite, persistAutoPromptDay]);

  const presentConnectionInvite = useCallback(
    (item: InboundProtocolInviteItem) => {
      if (!isConnectionProtocolInvite(item)) return;
      setAutoPresentedInviteId(null);
      setSessionSnoozedIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
      setFocusedInviteId(item.id);
      const idx = pendingConnectionInvites.findIndex((invite) => invite.id === item.id);
      if (idx >= 0) setQueueViewIndex(idx);
    },
    [pendingConnectionInvites],
  );

  const presentPendingConnectionRequest = useCallback(() => {
    clearSessionSnooze();
    if (pendingConnectionInvites.length === 0) void refreshInboundProtocol();
  }, [clearSessionSnooze, pendingConnectionInvites.length, refreshInboundProtocol]);

  const handleLater = useCallback(() => {
    if (!activeInvite) return;
    if (!userOpenedInvite) {
      const partnerKey = inviteAutoPromptKey(activeInvite);
      if (!recordedAutoPromptRef.current.has(partnerKey)) {
        recordedAutoPromptRef.current.add(partnerKey);
        persistAutoPromptDay(activeInvite);
      }
    }
    setAutoPresentedInviteId(null);
    setFocusedInviteId(null);
    setSessionSnoozedIds((prev) => new Set(prev).add(activeInvite.id));
  }, [activeInvite, persistAutoPromptDay, userOpenedInvite]);

  const handleNext = useCallback(() => {
    if (autoPromptEligibleInvites.length <= 1) return;
    setQueueViewIndex((i) => (i + 1) % autoPromptEligibleInvites.length);
  }, [autoPromptEligibleInvites.length]);

  const clearInvitePromptSchedule = useCallback(
    (invite: InboundProtocolInviteItem) => {
      if (!orgId) return;
      const partnerKey = inviteAutoPromptKey(invite);
      void clearAutoPromptRecord(orgId, partnerKey);
      recordedAutoPromptRef.current.delete(partnerKey);
      setPromptByPartnerKey((prev) => {
        if (!(partnerKey in prev)) return prev;
        const next = { ...prev };
        delete next[partnerKey];
        return next;
      });
    },
    [orgId],
  );

  const handleAccept = useCallback(async () => {
    if (!activeInvite) return;
    await handleInviteAction(activeInvite, 'approve');
    clearInvitePromptSchedule(activeInvite);
    setSessionSnoozedIds((prev) => {
      const next = new Set(prev);
      next.delete(activeInvite.id);
      return next;
    });
    setAutoPresentedInviteId(null);
    setFocusedInviteId(null);
    setQueueViewIndex(0);
  }, [activeInvite, clearInvitePromptSchedule, handleInviteAction]);

  const runDecline = useCallback(
    async (item: InboundProtocolInviteItem) => {
      await handleInviteAction(item, 'reject');
      clearInvitePromptSchedule(item);
      setDeclineTarget(null);
      setAutoPresentedInviteId(null);
      setFocusedInviteId(null);
      setSessionSnoozedIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
      setQueueViewIndex(0);
    },
    [clearInvitePromptSchedule, handleInviteAction],
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
      presentConnectionInvite,
      refreshConnectionRequests,
    }),
    [
      pendingConnectionInvites,
      presentPendingConnectionRequest,
      presentConnectionInvite,
      refreshConnectionRequests,
    ],
  );

  const queueIndex =
    activeInvite != null
      ? pendingConnectionInvites.findIndex((i) => i.id === activeInvite.id) + 1 || 1
      : 1;
  const queueTotal = pendingConnectionInvites.length;

  return (
    <BusinessConnectionRequestModalContext.Provider value={value}>
      {children}

      {orgId && activeInvite ? (
        <BusinessConnectionRequestModal
          visible={showModal}
          invite={activeInvite}
          queueIndex={queueIndex}
          queueTotal={queueTotal}
          busy={inviteActionId === activeInvite.id}
          onAccept={() => void handleAccept()}
          onDecline={handleDeclinePress}
          onLater={handleLater}
          onNext={
            !focusedInviteId && autoPromptEligibleInvites.length > 1 ? handleNext : undefined
          }
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
