import { useOptionalOrganization } from "@/contexts/OrganizationContext";
import { AwardedIndentDeployModal } from "@/features/indents/components/AwardedIndentDeployModal";
import { buildPendingAwardedDeployQueue } from "@/features/indents/utils/pendingAwardedDeploy.util";
import {
  useMarketIndentsQuery,
  useMyDirectQuotesQuery,
} from "@/lib/queries/useIndentsQuery";
import { useTripsQuery } from "@/lib/queries";
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
  useState,
  type ReactNode,
} from "react";
import { AppState, type AppStateStatus } from "react-native";

export type AwardedIndentDeployModalContextValue = {
  pendingDeployCount: number;
  /** When true, connection invitation modals should wait. */
  blocksConnectionInvitations: boolean;
  presentNextDeploy: () => void;
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
  const [dismissedForSession, setDismissedForSession] = useState(false);
  /** Set when user taps Assign — keeps deploy cards hidden until allocation route ends. */
  const [deployFlowIndentId, setDeployFlowIndentId] = useState<string | null>(null);

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

  const activeItem =
    visibleQueue.length > 0 && !dismissedForSession ? visibleQueue[0] : null;

  const deployFlowActive = onDeployFlowScreen || deployFlowIndentId != null;

  const showDeployModal = Boolean(activeItem) && !deployFlowActive;

  const blocksConnectionInvitations = showDeployModal;

  const queuePosition = activeItem
    ? pendingQueue.findIndex((item) => item.indent.id === activeItem.indent.id) + 1
    : 0;

  useEffect(() => {
    if (!orgId) return;
    const onAppStateChange = (next: AppStateStatus) => {
      if (next === "active") {
        setSessionSnoozedIds(new Set());
        setDismissedForSession(false);
        setDeployFlowIndentId(null);
      }
    };
    const sub = AppState.addEventListener("change", onAppStateChange);
    return () => sub.remove();
  }, [orgId]);

  useEffect(() => {
    if (pendingQueue.length > 0 && visibleQueue.length > 0) {
      setDismissedForSession(false);
    }
  }, [pendingQueue.length, visibleQueue.length]);

  const handleLater = useCallback(() => {
    if (!activeItem) return;
    const snoozedId = activeItem.indent.id;
    setSessionSnoozedIds((prev) => {
      const next = new Set(prev).add(snoozedId);
      const remaining = pendingQueue.filter((item) => !next.has(item.indent.id));
      if (remaining.length === 0) {
        setDismissedForSession(true);
      }
      return next;
    });
  }, [activeItem, pendingQueue]);

  const handleAssign = useCallback(() => {
    if (!activeItem) return;
    const indentId = activeItem.indent.id;
    setDeployFlowIndentId(indentId);
    router.push(ROUTES.indentAllocation(indentId) as import("expo-router").Href);
  }, [activeItem, router]);

  const handleViewLoad = useCallback(() => {
    if (!activeItem) return;
    const indentId = activeItem.indent.id;
    setDeployFlowIndentId(indentId);
    router.push(ROUTES.indentDetail(indentId) as import("expo-router").Href);
  }, [activeItem, router]);

  const presentNextDeploy = useCallback(() => {
    setDismissedForSession(false);
    setSessionSnoozedIds(new Set());
    setDeployFlowIndentId(null);
  }, []);

  const value = useMemo(
    (): AwardedIndentDeployModalContextValue => ({
      pendingDeployCount: pendingQueue.length,
      blocksConnectionInvitations,
      presentNextDeploy,
    }),
    [blocksConnectionInvitations, pendingQueue.length, presentNextDeploy],
  );

  return (
    <AwardedIndentDeployModalContext.Provider value={value}>
      {children}
      {activeItem ? (
        <AwardedIndentDeployModal
          key={activeItem.indent.id}
          visible={showDeployModal}
          item={activeItem}
          queueIndex={queuePosition > 0 ? queuePosition : 1}
          queueTotal={pendingQueue.length}
          onAssign={handleAssign}
          onLater={handleLater}
          onViewLoad={handleViewLoad}
        />
      ) : null}
    </AwardedIndentDeployModalContext.Provider>
  );
}
