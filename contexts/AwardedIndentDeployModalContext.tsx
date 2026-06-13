import { useOptionalOrganization } from "@/contexts/OrganizationContext";
import { AwardedIndentDeployModal } from "@/features/indents/components/AwardedIndentDeployModal";
import { AwardedIndentDeployPeek } from "@/features/indents/components/AwardedIndentDeployPeek";
import { buildPendingAwardedDeployQueue } from "@/features/indents/utils/pendingAwardedDeploy.util";
import {
  useMarketIndentsQuery,
  useMyDirectQuotesQuery,
} from "@/lib/queries/useIndentsQuery";
import { useTripsQuery } from "@/lib/queries/useTripsQuery";
import {
  isIndentDeployFlowPath,
  parseIndentIdFromDeployFlowPath,
  ROUTES,
} from "@/lib/routes";
import { usePathname, useRouter } from "expo-router";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AppState, type AppStateStatus } from "react-native";

/** Delay before connection-invite modals may appear after minimizing the deploy alert. */
const CONNECTION_INVITE_DEFER_AFTER_MINIMIZE_MS = 3000;

export type AwardedIndentDeployModalContextValue = {
  pendingDeployCount: number;
  /** Awards collapsed to the bottom peek (still in queue). */
  minimizedDeployCount: number;
  /** When true, connection invitation modals must not show (deploy sheet expanded). */
  blocksConnectionInvitations: boolean;
  /** When true, auto-presented invites wait (e.g. shortly after minimizing deploy). */
  deferConnectionInvitations: boolean;
  presentNextDeploy: () => void;
  expandDeployModal: () => void;
};

const AwardedIndentDeployModalContext =
  createContext<AwardedIndentDeployModalContextValue | null>(null);

export function useOptionalAwardedIndentDeployModal(): AwardedIndentDeployModalContextValue | null {
  return useContext(AwardedIndentDeployModalContext);
}

export function AwardedIndentDeployModalProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const org = useOptionalOrganization();
  const orgId = org?.currentOrganization?.id ?? null;

  const { data: myQuotes = [] } = useMyDirectQuotesQuery(orgId);
  const { data: marketIndents = [] } = useMarketIndentsQuery(orgId);
  const { data: trips = [] } = useTripsQuery(orgId);

  const indentIdsWithTrip = useMemo(() => {
    const s = new Set<string>();
    for (const t of trips ?? []) {
      const id = (t.indent_id ?? "").trim();
      if (id) s.add(id);
    }
    return s;
  }, [trips]);

  const pendingQueue = useMemo(
    () =>
      buildPendingAwardedDeployQueue(
        orgId,
        myQuotes,
        marketIndents,
        indentIdsWithTrip,
      ),
    [orgId, myQuotes, marketIndents, indentIdsWithTrip],
  );

  const [sessionSnoozedIds, setSessionSnoozedIds] = useState<Set<string>>(new Set());
  /** Indents the user collapsed — stay on peek until they expand (survives spurious AppState). */
  const [sessionCollapsedIndentIds, setSessionCollapsedIndentIds] = useState<Set<string>>(
    new Set(),
  );
  const [queueViewIndex, setQueueViewIndex] = useState(0);
  const [dismissedForSession, setDismissedForSession] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [inviteDeferralActive, setInviteDeferralActive] = useState(false);
  const inviteDeferralTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  /** Set when user taps Assign — keeps deploy cards hidden until allocation route ends. */
  const [deployFlowIndentId, setDeployFlowIndentId] = useState<string | null>(null);

  const clearInviteDeferral = useCallback(() => {
    if (inviteDeferralTimerRef.current != null) {
      clearTimeout(inviteDeferralTimerRef.current);
      inviteDeferralTimerRef.current = null;
    }
    setInviteDeferralActive(false);
  }, []);

  const startInviteDeferral = useCallback(() => {
    clearInviteDeferral();
    setInviteDeferralActive(true);
    inviteDeferralTimerRef.current = setTimeout(() => {
      inviteDeferralTimerRef.current = null;
      setInviteDeferralActive(false);
    }, CONNECTION_INVITE_DEFER_AFTER_MINIMIZE_MS);
  }, [clearInviteDeferral]);

  useEffect(() => () => clearInviteDeferral(), [clearInviteDeferral]);

  const deployFlowPathIndentId = useMemo(
    () => parseIndentIdFromDeployFlowPath(pathname),
    [pathname],
  );
  const onDeployFlowScreen = isIndentDeployFlowPath(pathname);

  useEffect(() => {
    if (onDeployFlowScreen && deployFlowPathIndentId) {
      setDeployFlowIndentId(deployFlowPathIndentId);
      return;
    }
    if (!onDeployFlowScreen) {
      setDeployFlowIndentId(null);
    }
  }, [onDeployFlowScreen, deployFlowPathIndentId]);

  const visibleQueue = useMemo(
    () => pendingQueue.filter((item) => !sessionSnoozedIds.has(item.indent.id)),
    [pendingQueue, sessionSnoozedIds],
  );

  useEffect(() => {
    if (queueViewIndex >= visibleQueue.length && visibleQueue.length > 0) {
      setQueueViewIndex(0);
    }
  }, [queueViewIndex, visibleQueue.length]);

  const activeItem =
    visibleQueue.length > 0 && !dismissedForSession
      ? visibleQueue[queueViewIndex % visibleQueue.length]
      : null;

  const deployFlowActive = onDeployFlowScreen || deployFlowIndentId != null;

  const activeIndentCollapsed =
    activeItem != null && sessionCollapsedIndentIds.has(activeItem.indent.id);

  const hasPendingDeploy = Boolean(activeItem) && !deployFlowActive;
  const showExpandedDeployModal =
    hasPendingDeploy && !minimized && !activeIndentCollapsed;
  const showMinimizedPeek = hasPendingDeploy && (minimized || activeIndentCollapsed);

  const blocksConnectionInvitations = showExpandedDeployModal;
  const deferConnectionInvitations = inviteDeferralActive;

  useEffect(() => {
    if (!orgId) return;
    const onAppStateChange = (next: AppStateStatus) => {
      const prev = appStateRef.current;
      appStateRef.current = next;
      const becameActive =
        next === "active" && (prev === "background" || prev === "inactive");
      if (!becameActive) return;
      clearInviteDeferral();
      setSessionSnoozedIds(new Set());
      setSessionCollapsedIndentIds(new Set());
      setQueueViewIndex(0);
      setDismissedForSession(false);
      setDeployFlowIndentId(null);
      setMinimized(false);
    };
    const sub = AppState.addEventListener("change", onAppStateChange);
    return () => sub.remove();
  }, [orgId, clearInviteDeferral]);

  useEffect(() => {
    if (!dismissedForSession && pendingQueue.length > 0 && visibleQueue.length > 0) {
      return;
    }
    const hasNewVisibleAward = pendingQueue.some(
      (item) => !sessionSnoozedIds.has(item.indent.id),
    );
    if (hasNewVisibleAward) {
      setDismissedForSession(false);
    }
  }, [dismissedForSession, pendingQueue, sessionSnoozedIds, visibleQueue.length]);

  const handleMinimize = useCallback(() => {
    if (activeItem) {
      const indentId = activeItem.indent.id;
      setSessionCollapsedIndentIds((prev) => new Set(prev).add(indentId));
    }
    setMinimized(true);
    startInviteDeferral();
  }, [activeItem, startInviteDeferral]);

  const handleExpand = useCallback(() => {
    if (activeItem) {
      const indentId = activeItem.indent.id;
      setSessionCollapsedIndentIds((prev) => {
        if (!prev.has(indentId)) return prev;
        const next = new Set(prev);
        next.delete(indentId);
        return next;
      });
    }
    setMinimized(false);
    clearInviteDeferral();
  }, [activeItem, clearInviteDeferral]);

  const handleLater = useCallback(() => {
    if (!activeItem) return;
    const snoozedId = activeItem.indent.id;
    setSessionCollapsedIndentIds((prev) => {
      if (!prev.has(snoozedId)) return prev;
      const next = new Set(prev);
      next.delete(snoozedId);
      return next;
    });
    setMinimized(false);
    setSessionSnoozedIds((prev) => {
      const next = new Set(prev).add(snoozedId);
      const remaining = pendingQueue.filter((item) => !next.has(item.indent.id));
      if (remaining.length === 0) {
        setDismissedForSession(true);
      }
      setQueueViewIndex((i) => Math.max(0, Math.min(i, Math.max(0, remaining.length - 1))));
      return next;
    });
  }, [activeItem, pendingQueue]);

  const handleAssign = useCallback(() => {
    if (!activeItem) return;
    const indentId = activeItem.indent.id;
    setDeployFlowIndentId(indentId);
    router.push(
      ROUTES.indentAllocation(indentId, "vehicle") as import("expo-router").Href,
    );
  }, [activeItem, router]);

  const handleViewLoad = useCallback(() => {
    if (!activeItem) return;
    const indentId = activeItem.indent.id;
    setDeployFlowIndentId(indentId);
    router.push(ROUTES.indentDetail(indentId) as import("expo-router").Href);
  }, [activeItem, router]);

  const presentNextDeploy = useCallback(() => {
    clearInviteDeferral();
    setDismissedForSession(false);
    setSessionSnoozedIds(new Set());
    setSessionCollapsedIndentIds(new Set());
    setQueueViewIndex(0);
    setDeployFlowIndentId(null);
    setMinimized(false);
  }, [clearInviteDeferral]);

  const value = useMemo(
    (): AwardedIndentDeployModalContextValue => ({
      pendingDeployCount: pendingQueue.length,
      minimizedDeployCount: showMinimizedPeek ? visibleQueue.length : 0,
      blocksConnectionInvitations,
      deferConnectionInvitations,
      presentNextDeploy,
      expandDeployModal: handleExpand,
    }),
    [
      blocksConnectionInvitations,
      deferConnectionInvitations,
      handleExpand,
      pendingQueue.length,
      presentNextDeploy,
      showMinimizedPeek,
      visibleQueue.length,
    ],
  );

  return (
    <AwardedIndentDeployModalContext.Provider value={value}>
      {children}
      {visibleQueue.length > 0 ? (
        <>
          <AwardedIndentDeployModal
            visible={showExpandedDeployModal}
            items={visibleQueue}
            pageIndex={queueViewIndex}
            onPageChange={setQueueViewIndex}
            onAssign={handleAssign}
            onLater={handleLater}
            onMinimize={handleMinimize}
            onViewLoad={handleViewLoad}
          />
          {showMinimizedPeek ? (
            <AwardedIndentDeployPeek
              items={visibleQueue}
              pageIndex={queueViewIndex}
              onExpand={handleExpand}
            />
          ) : null}
        </>
      ) : null}
    </AwardedIndentDeployModalContext.Provider>
  );
}
