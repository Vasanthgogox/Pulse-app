import { useOptionalOrganization } from "@/contexts/OrganizationContext";
import { AwardedIndentDeployModal } from "@/features/indents/components/AwardedIndentDeployModal";
import { AwardedIndentDeployPeek } from "@/features/indents/components/AwardedIndentDeployPeek";
import { buildPendingAwardedDeployQueue } from "@/features/indents/utils/pendingAwardedDeploy.util";
import {
  clearDeploySnooze,
  decideDeployVisibility,
  loadDeploySnoozes,
  saveDeploySnooze,
} from "@/features/indents/utils/awardedDeploySnooze.util";
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

  const { data: myQuotes = [], isPending: myQuotesLoading } =
    useMyDirectQuotesQuery(orgId);
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
        myQuotesLoading,
      ),
    [orgId, myQuotes, myQuotesLoading, marketIndents, indentIdsWithTrip],
  );

  /** Later-snooze timestamps (ms) persisted across restarts, keyed by indent id. */
  const [snoozeByIndentId, setSnoozeByIndentId] = useState<Record<string, number>>({});
  const [snoozesLoaded, setSnoozesLoaded] = useState(false);
  /** Indents the user collapsed via the drag-to-minimize gesture — an
   *  in-session-only "not now", distinct from the persisted Later snooze. */
  const [sessionCollapsedIndentIds, setSessionCollapsedIndentIds] = useState<Set<string>>(
    new Set(),
  );
  const [queueViewIndex, setQueueViewIndex] = useState(0);
  const [dismissedForSession, setDismissedForSession] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [inviteDeferralActive, setInviteDeferralActive] = useState(false);
  const inviteDeferralTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Set when user taps Assign — keeps deploy cards hidden until allocation route ends. */
  const [deployFlowIndentId, setDeployFlowIndentId] = useState<string | null>(null);
  /** Ticks periodically so a snooze cooldown expiring mid-session re-evaluates
   *  visibility without requiring a data refetch or app foreground. */
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!orgId) {
      setSnoozeByIndentId({});
      setSnoozesLoaded(false);
      return;
    }
    let cancelled = false;
    setSnoozesLoaded(false);
    loadDeploySnoozes(orgId).then((map) => {
      if (cancelled) return;
      setSnoozeByIndentId(map);
      setSnoozesLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  useEffect(() => {
    const interval = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, []);

  // Once a snoozed indent leaves the live queue (trip created, or award
  // withdrawn), drop its snooze record so it doesn't linger in storage.
  useEffect(() => {
    if (!orgId || !snoozesLoaded) return;
    const liveIds = new Set(pendingQueue.map((item) => item.indent.id));
    for (const indentId of Object.keys(snoozeByIndentId)) {
      if (!liveIds.has(indentId)) {
        clearDeploySnooze(orgId, indentId);
        setSnoozeByIndentId((prev) => {
          if (!(indentId in prev)) return prev;
          const next = { ...prev };
          delete next[indentId];
          return next;
        });
      }
    }
  }, [orgId, snoozesLoaded, pendingQueue, snoozeByIndentId]);

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

  // Snoozed items stay in the visible queue — a persisted Later demotes an
  // award to the peek for the cooldown window, it does not hide it outright.
  const visibleQueue = pendingQueue;

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

  // Explicit visibility decision for the active item: a brand-new award (no
  // snooze record) always gets the full modal; a snoozed one only escalates
  // back once the cooldown expires or it has gone severely overdue since the
  // user last saw it. Foreground/background has no bearing on any of this —
  // only pendingQueue contents (data) and nowMs (cooldown expiry) do.
  const activeSnoozeDecision = useMemo(() => {
    if (!activeItem) return "full_modal" as const;
    return decideDeployVisibility({
      snoozedAtMs: snoozeByIndentId[activeItem.indent.id],
      pickupDateIso: activeItem.indent.pickup_date,
      nowMs,
    });
  }, [activeItem, snoozeByIndentId, nowMs]);

  // Tapping the peek to expand is an explicit user action — it should always
  // reveal the full modal, even mid-cooldown, so "expand" never feels stuck.
  const [explicitlyExpandedIndentId, setExplicitlyExpandedIndentId] = useState<string | null>(
    null,
  );
  const activeIndentExplicitlyExpanded =
    activeItem != null && explicitlyExpandedIndentId === activeItem.indent.id;

  const activeIndentSnoozedToPeek =
    activeSnoozeDecision === "peek" && !activeIndentExplicitlyExpanded;

  const hasPendingDeploy = Boolean(activeItem) && !deployFlowActive;
  const showExpandedDeployModal =
    hasPendingDeploy && !minimized && !activeIndentCollapsed && !activeIndentSnoozedToPeek;
  const showMinimizedPeek =
    hasPendingDeploy && (minimized || activeIndentCollapsed || activeIndentSnoozedToPeek);

  const blocksConnectionInvitations = showExpandedDeployModal;
  const deferConnectionInvitations = inviteDeferralActive;

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
      setExplicitlyExpandedIndentId(indentId);
    }
    setMinimized(false);
    clearInviteDeferral();
  }, [activeItem, clearInviteDeferral]);

  const handleLater = useCallback(() => {
    if (!orgId || visibleQueue.length === 0) return;
    const snoozedAtMs = Date.now();
    // One Later dismisses every pending award popup for the cooldown window —
    // otherwise the next queue item immediately reopens the full modal.
    setSnoozeByIndentId((prev) => {
      const next = { ...prev };
      for (const item of visibleQueue) {
        next[item.indent.id] = snoozedAtMs;
      }
      return next;
    });
    for (const item of visibleQueue) {
      saveDeploySnooze(orgId, item.indent.id, snoozedAtMs);
    }
    setSessionCollapsedIndentIds(new Set());
    setMinimized(false);
    setExplicitlyExpandedIndentId(null);
  }, [orgId, visibleQueue]);

  const handleAssign = useCallback(() => {
    if (!activeItem) return;
    const indentId = activeItem.indent.id;
    setDeployFlowIndentId(indentId);
    router.push(
      ROUTES.indentAllocation(indentId) as import("expo-router").Href,
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
    setSessionCollapsedIndentIds(new Set());
    setQueueViewIndex(0);
    setDeployFlowIndentId(null);
    setMinimized(false);
    setExplicitlyExpandedIndentId(null);
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
