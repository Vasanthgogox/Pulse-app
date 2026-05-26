/**
 * Load Center — reference UI: Hire Partners | Find Work | Awarded.
 * Header "Load Center" / "Find or Hire Work", three sub-tabs, cards, modals.
 */
import { ContentErrorState } from '@/components/ContentErrorState';
import { HubListPaginationBar } from "@/components/hub/HubListPaginationBar";
import { useHubGridPagination } from "@/components/hub/useHubGridPagination";
import { LoadCardRouteRow } from "@/components/LoadCardRouteRow";
import { LoadCardSpecsRow } from "@/components/LoadCardSpecsRow";
import {
  ClaimedIndentCardActions,
  GetLoadIndentCardActions,
  GiveLoadIndentCardActions,
  LoadCenterIndentCardFooter,
} from "@/features/network/components/LoadCenterIndentCardActions";
import {
  LoadCenterHubMobileIndentCard,
  LoadCenterHubMobileListCanvas,
} from "@/features/network/components/LoadCenterHubMobileIndentCard";
import {
  LOADS_HUB_PAGE_BG,
  LoadCenterHubMobileShell,
} from "@/features/network/components/LoadCenterHubMobileShell";
import { SemanticAddIcon } from "@/components/SemanticAddIcon";
import { getLinkedOrgProfilesBatch } from "@/features/clients/services/clients.service";
import type { ClientRow } from "@/features/clients/services/clients.service";
import {
  giveLoadIndentAvatarProps,
  marketLoadIndentAvatarProps,
} from "@/features/network/utils/indentCardAvatar.util";
import { PartyAvatar } from "@/components/PartyAvatar";
import Layout from "@/constants/Layout";
import { useLayoutInsets } from "@/lib/layoutInsets";
import Theme from "@/constants/Theme";
import Typography from "@/constants/Typography";
import { useOrganization } from "@/contexts/OrganizationContext";
import {
    BidReceivedHammer,
    getIndentDisplayNumber,
    type DirectQuoteRow,
    type IndentRow,
} from "@/features/indents";
import { shareDraftIndent } from "@/features/indents/services/indents.service";
import { indentCanBroadcastToPulseNetwork } from "@/features/network/utils/indentBroadcastEligibility.util";
import {
    formatIndentCardDate,
    giveLoadStatusPillStyles,
    shouldHideGetLoadStatePill,
    STATUS_TABS,
    statusMatchesFilter,
    type LoadSubTab,
    type StatusFilterTab,
} from "@/features/network/utils/loadCenter.model";
import { useAwardQuote } from "@/features/network/hooks/useAwardQuote";
import { useLoadCenterFilters } from "@/features/network/hooks/useLoadCenterFilters";
import { useStaffHandshake } from "@/features/network/hooks/useStaffHandshake";
import { useSuccessToast } from "@/features/network/hooks/useSuccessToast";
import { useTripDeployment } from "@/features/network/hooks/useTripDeployment";
import { AwardModal } from "@/features/network/components/AwardModal";
import { BidModal } from "@/features/network/components/BidModal";
import { StaffHandshakeModal } from "@/features/network/components/StaffHandshakeModal";
import {
    assignmentShellColors,
    assignmentShellStyles,
} from "@/features/trips/styles/assignmentShellShared";
import { useLinkedOrgProfileMap } from "@/lib/useLinkedOrgProfileMap";
import { formatINR } from "@/lib/format";
import {
    useIndentOfferCountsQuery,
    useDriversQuery,
    useIndentsQuery,
    useInvalidateIndents,
    useMarketIndentsQuery,
    useMyDirectQuotesQuery,
    useSuppliersQuery,
    useClientsQuery,
    useTripsQuery,
    useVehiclesQuery,
} from "@/lib/queries";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { FlashList } from "@shopify/flash-list";
import { useQueryClient } from "@tanstack/react-query";
import * as Linking from "expo-linking";
import {
    Building2,
    Package,
    Share2,
    Users,
    Zap,
} from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Animated,
    Easing,
    Image,
    Modal,
    Platform,
    RefreshControl,
    ScrollView,
    Share,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface LoadCenterViewProps {
  /** Top padding (e.g. from parent sub-tab row + safe area). */
  contentTopPadding?: number;
  /** Opens Network → My Network (connections / invitations). */
  onMyNetworkPress?: () => void;
  onCreateIndentPress: () => void;
  onIndentPress: (indent: IndentRow) => void;
  highlightedIndentId?: string | null;
  /** Opens ShareLoadSheet to broadcast this indent to the Pulse network. */
  onShareToNetwork?: (indent: IndentRow) => void;
}

const TESLA_BLACK = "#171A20";

export function LoadCenterView({
  contentTopPadding = 0,
  onMyNetworkPress,
  onCreateIndentPress,
  onIndentPress,
  highlightedIndentId,
  onShareToNetwork,
}: LoadCenterViewProps) {
  const insets = useSafeAreaInsets();
  const layout = useLayoutInsets();
  const { width } = useWindowDimensions();
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id ?? null;

  const scrollRef = useRef<FlashList<IndentRow>>(null);

  const [loadSubTab, setLoadSubTab] = useState<LoadSubTab>("GIVE_LOAD");
  const [loadTabsWrapWidth, setLoadTabsWrapWidth] = useState(0);
  const loadTabsActiveAnim = useRef(new Animated.Value(0)).current;
  const [statusFilterTab, setStatusFilterTab] =
    useState<StatusFilterTab>("OPEN");
  const [searchQuery, setSearchQuery] = useState("");
  const [creatorOrgProfileMap, setCreatorOrgProfileMap] = useState<
    Record<string, { avatarUrl?: string; avatarSeed?: string }>
  >({});
  const [showPostModal, setShowPostModal] = useState(false);
  const { showSuccess, successMsg, trigger: triggerSuccess } = useSuccessToast();
  const [bidLoad, setBidLoad] = useState<IndentRow | null>(null);
  const [localBidHistoryByIndentId, setLocalBidHistoryByIndentId] = useState<
    Record<string, { amount: number; updatedAt: string }[]>
  >({});
  const isSingleRowHeader = Platform.OS === "web" && width >= 1024;
  const isCompactModalLayout = Platform.OS === "web" && width < 920;

  const { data: indents = [], isLoading } = useIndentsQuery(orgId);
  const {
    data: marketIndents = [],
    isLoading: marketLoading,
    isError: marketError,
    isRefetching: marketRefetching,
    refetch: refetchMarketIndents,
  } = useMarketIndentsQuery(orgId);
  const { data: myQuotes = [], refetch: refetchMyQuotes } =
    useMyDirectQuotesQuery(orgId);
  const { data: trips = [] } = useTripsQuery(orgId);
  const { data: drivers = [] } = useDriversQuery(orgId);
  const { data: vehicles = [] } = useVehiclesQuery(orgId);
  const { data: suppliers = [] } = useSuppliersQuery(orgId);
  const { data: clients = [] } = useClientsQuery(orgId);
  const linkedOrgByOrganizationId = useLinkedOrgProfileMap(clients, suppliers);
  const invalidateIndents = useInvalidateIndents();
  const queryClient = useQueryClient();

  const isClaimedTab = loadSubTab === "AWARDED";
  const loadSubTabIndex =
    loadSubTab === "GIVE_LOAD" ? 0 : loadSubTab === "GET_LOAD" ? 1 : 2;
  useEffect(() => {
    Animated.timing(loadTabsActiveAnim, {
      toValue: loadSubTabIndex,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [loadSubTabIndex, loadTabsActiveAnim]);

  /** Desktop web: 5 indent cards per row (mobile <820 uses hub list cards). */
  const useGridLayout = Platform.OS === "web" && width >= 1024;
  const isMobileView = width < 820;
  /** Narrow / grid cards: stack bid meta + actions so CTAs stay aligned and tappable. */
  const compactIndentFooter = width < 520;
  const stackIndentCardFooter = compactIndentFooter || useGridLayout;

  useEffect(() => {
    if (!highlightedIndentId || useGridLayout) return;
    const t = setTimeout(() => {
      scrollRef.current?.scrollToItem({
        animated: true,
        item: { id: highlightedIndentId } as IndentRow,
        viewPosition: 0.5,
      });
    }, 500);
    return () => clearTimeout(t);
  }, [highlightedIndentId, useGridLayout]);

  // ── Filter pipeline ─────────────────────────────────────────────────────────
  // hirePartnerLoads is needed before giveLoadIds so we compute it first.
  const hirePartnerLoadsForIds = useMemo(
    () => indents.filter((i) => i.organization_id === orgId),
    [indents, orgId],
  );
  const giveLoadIds = useMemo(
    () =>
      hirePartnerLoadsForIds
        .filter((i) => {
          const s = (i.status || "").toLowerCase();
          return s !== "awarded" && s !== "completed" && s !== "cancelled";
        })
        .map((l) => l.id),
    [hirePartnerLoadsForIds],
  );
  const { data: quoteCounts = {}, refetch: refetchQuoteCounts } =
    useIndentOfferCountsQuery(orgId, giveLoadIds);

  const filters = useLoadCenterFilters({
    orgId,
    indents,
    marketIndents,
    myQuotes,
    trips,
    quoteCounts,
    loadSubTab,
    statusFilterTab,
    searchQuery,
  });

  const {
    myQuoteByIndentId,
    indentIdsWithTrip,
    hirePartnerLoads,
    awardedLoads,
    findWorkLoads,
    filteredHirePartnerLoads,
    filteredFindWorkList,
    filteredClaimedLoads,
    filteredClaimedDoneLoads,
    statusTabCounts,
  } = filters;

  const displayedClaimedLoads = useMemo(
    () =>
      statusFilterTab === "DONE"
        ? filteredClaimedDoneLoads
        : filteredClaimedLoads,
    [statusFilterTab, filteredClaimedDoneLoads, filteredClaimedLoads],
  );

  const loadGridPaginationResetKey = `${loadSubTab}|${statusFilterTab}|${searchQuery}`;
  const giveLoadGridPagination = useHubGridPagination(
    filteredHirePartnerLoads,
    loadGridPaginationResetKey,
  );
  const findWorkGridPagination = useHubGridPagination(
    filteredFindWorkList,
    loadGridPaginationResetKey,
  );
  const claimedGridPagination = useHubGridPagination(
    displayedClaimedLoads,
    loadGridPaginationResetKey,
  );

  // ── Award Quote hook ────────────────────────────────────────────────────────
  const awardModal = useAwardQuote({ orgId, queryClient, invalidateIndents, onSuccess: triggerSuccess });

  // ── Staff Handshake hook ────────────────────────────────────────────────────
  const handshake = useStaffHandshake({ orgId, myQuotes, onSuccess: triggerSuccess });

  const visiblePartnersForHandshake = useMemo(() => {
    const base = suppliers;
    const subcontractSupplierId = handshake.state.subcontractSupplierId;
    // Never hide the currently selected partner (keeps existing selection stable).
    if (
      subcontractSupplierId &&
      !base.some((s) => s.id === subcontractSupplierId)
    ) {
      const selected = suppliers.find((s) => s.id === subcontractSupplierId);
      if (selected) return [selected, ...base];
    }
    return base;
  }, [suppliers, handshake.state.subcontractSupplierId]);

  // ── Trip Deployment hook ────────────────────────────────────────────────────
  const tripDeployment = useTripDeployment({
    orgId,
    myQuoteByIndentId: filters.myQuoteByIndentId,
    onSuccess: triggerSuccess,
  });

  const clientById = useMemo(() => {
    const map = new Map<string, ClientRow>();
    for (const client of clients) {
      map.set(client.id, client);
    }
    return map;
  }, [clients]);

  const marketCreatorOrgIdsKey = useMemo(() => {
    const ids = new Set<string>();
    for (const load of filteredFindWorkList) {
      const orgIdKey = (load.organization_id ?? "").trim();
      if (orgIdKey) ids.add(orgIdKey);
    }
    for (const load of displayedClaimedLoads) {
      const orgIdKey = (load.organization_id ?? "").trim();
      if (orgIdKey) ids.add(orgIdKey);
    }
    return Array.from(ids).sort().join("|");
  }, [filteredFindWorkList, displayedClaimedLoads]);

  useEffect(() => {
    const ids = marketCreatorOrgIdsKey
      ? marketCreatorOrgIdsKey.split("|").filter(Boolean)
      : [];
    if (ids.length === 0) {
      setCreatorOrgProfileMap((prev) =>
        Object.keys(prev).length === 0 ? prev : {},
      );
      return;
    }
    let cancelled = false;
    void getLinkedOrgProfilesBatch(ids).then((profiles) => {
      if (cancelled) return;
      const next: Record<string, { avatarUrl?: string; avatarSeed?: string }> =
        {};
      for (const [oid, profile] of Object.entries(profiles)) {
        next[oid] = {
          avatarUrl: (profile.avatarUrl ?? "").trim() || undefined,
          avatarSeed: (profile.avatarSeed ?? "").trim() || undefined,
        };
      }
      setCreatorOrgProfileMap((prev) => {
        const prevKeys = Object.keys(prev);
        const nextKeys = Object.keys(next);
        if (
          prevKeys.length === nextKeys.length &&
          nextKeys.every((k) => prev[k]?.avatarUrl === next[k]?.avatarUrl)
        ) {
          return prev;
        }
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [marketCreatorOrgIdsKey]);

  useEffect(() => {
    // Keep status filter valid per role tab to avoid confusing empty views.
    if (loadSubTab === "AWARDED") {
      if (statusFilterTab !== "AWARDED" && statusFilterTab !== "DONE") {
        setStatusFilterTab("AWARDED");
      }
      return;
    }
    // No additional guard needed: Hire Partner and Find Work both support AWARDED now.
  }, [loadSubTab, statusFilterTab]);

  useEffect(() => {
    if (loadSubTab === "AWARDED") refetchMyQuotes();
  }, [loadSubTab, refetchMyQuotes]);

  /** Refetch quote counts when viewing Quoted tab so bids received are up to date. */
  useEffect(() => {
    if (loadSubTab === "GIVE_LOAD" && statusFilterTab === "QUOTED") {
      refetchQuoteCounts();
    }
  }, [loadSubTab, statusFilterTab, refetchQuoteCounts]);


  const handleBroadcastDraft = async (load: IndentRow) => {
    if (!orgId) return;
    const { error } = await shareDraftIndent(load.id);
    if (error) {
      Alert.alert("Could not broadcast", error.message);
      return;
    }
    invalidateIndents(orgId);
    triggerSuccess("Load broadcasted to network");
  };

  const handleShareIndent = async (load: IndentRow) => {
    const routeLabel = `${(load.pickup_area || "—").toUpperCase()} → ${(load.drop_location || "—").toUpperCase()}`;
    const dateLabel = load.pickup_date
      ? new Date(load.pickup_date).toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      : "—";
    const budget = formatINR(Number(load.client_price || 0));
    const indentDisplay = getIndentDisplayNumber(load);
    const webBase =
      process.env.EXPO_PUBLIC_WEB_BASE_URL?.trim().replace(/\/$/, "") || "";
    const deepLink =
      webBase !== ""
        ? `${webBase}/indent/${load.id}`
        : Linking.createURL(`/indent/${load.id}`);
    const message =
      `Load Indent ${indentDisplay}\n` +
      `${routeLabel}\n` +
      `Pickup: ${dateLabel} · Budget: ${budget}\n\n` +
      `Update your bid:\n${deepLink}`;
    try {
      const waUrl = `whatsapp://send?text=${encodeURIComponent(message)}`;
      const canOpen = await Linking.canOpenURL(waUrl);
      if (canOpen) {
        await Linking.openURL(waUrl);
      } else {
        await Share.share({ message });
      }
    } catch {
      await Share.share({ message });
    }
  };


  const activeDrivers = useMemo(
    () => drivers.filter((d) => !d.left_at),
    [drivers],
  );

  /** Keep add-load FAB above the global chat FAB, tab bar, and safe area. */
  const hirePartnerFabBottom = layout.fabBottom({
    stackOffset: Layout.fabStackOffset,
  });
  const paddingBottom = useMemo(() => {
    const base = layout.scrollBottomPadding(36);
    if (isMobileView || loadSubTab !== "GIVE_LOAD") return base;
    return hirePartnerFabBottom + Layout.fabSize + Layout.fabBottomOffset;
  }, [hirePartnerFabBottom, isMobileView, layout, loadSubTab]);
  const statusTabsForRole = useMemo(() => {
    if (!isClaimedTab) return STATUS_TABS;
    return STATUS_TABS.filter((t) => t.id === "AWARDED" || t.id === "DONE");
  }, [isClaimedTab]);

  const mobileStatusTabs = useMemo(
    () =>
      statusTabsForRole.map((tab) => ({
        id: tab.id,
        label:
          loadSubTab === "GIVE_LOAD" && tab.id === "OPEN" ? "Created" : tab.label,
        count: statusTabCounts[tab.id],
      })),
    [statusTabsForRole, loadSubTab, statusTabCounts],
  );

  const renderGiveLoadMobileCard = useCallback(
    (load: IndentRow) => {
      const status = (load.status || "").toLowerCase();
      const bidCount = quoteCounts[load.id] ?? 0;
      const terminalForQuotePill =
        status === "awarded" || statusMatchesFilter(status, "DONE");
      const displayStatus =
        !terminalForQuotePill && bidCount > 0 ? "quoted" : status;
      const vehicleDetail = (load.vehicle_type || "—").toUpperCase();
      const loadTypeDetail = (load.load_type || "General").toUpperCase();
      const clientName = (load.client_name || "—").trim() || "—";
      const avatar = giveLoadIndentAvatarProps(
        load,
        clientById,
        linkedOrgByOrganizationId,
      );
      return (
        <LoadCenterHubMobileIndentCard
          key={load.id}
          indent={load}
          titleName={clientName}
          statusLabel={displayStatus}
          origin={load.pickup_area || "—"}
          dest={load.drop_location || "—"}
          pickupIso={load.pickup_date}
          leftFooterLabel={vehicleDetail}
          rightFooterLabel={
            bidCount > 0
              ? `${bidCount} bid${bidCount === 1 ? "" : "s"}`
              : loadTypeDetail
          }
          avatarUrl={avatar.avatarUrl}
          avatarSeed={avatar.avatarSeed}
          organizationImageUrl={avatar.organizationImageUrl}
          organizationAvatarSeed={avatar.organizationAvatarSeed}
          initialsColorSeed={avatar.initialsColorSeed}
          onPress={() => onIndentPress(load)}
        />
      );
    },
    [clientById, linkedOrgByOrganizationId, onIndentPress, quoteCounts],
  );

  const renderGetLoadMobileCard = useCallback(
    (load: IndentRow) => {
      const existingQuote = myQuoteByIndentId.get(load.id);
      const quoteStatus = (existingQuote?.status ?? "").toLowerCase();
      const isPending = quoteStatus === "pending";
      const isRejected = quoteStatus === "rejected";
      const isAccepted = quoteStatus === "accepted";
      const vehicleDetail = (load.vehicle_type || "—").toUpperCase();
      const loadTypeDetail = (load.load_type || "—").toUpperCase();
      const clientLabel = (
        load.creator_organization_name ||
        load.client_name ||
        "Partner"
      ).trim();
      const statusLabel = isAccepted
        ? "awarded"
        : isRejected
          ? "declined"
          : isPending
            ? "quoted"
            : "open";
      const rightFooter = isPending
        ? `Quote ${formatINR(Number(existingQuote?.amount ?? 0))}`
        : isAccepted
          ? "Awarded"
          : loadTypeDetail;
      const avatar = marketLoadIndentAvatarProps(load, creatorOrgProfileMap);
      return (
        <LoadCenterHubMobileIndentCard
          key={load.id}
          indent={load}
          titleName={clientLabel}
          statusLabel={statusLabel}
          origin={load.pickup_area || "—"}
          dest={load.drop_location || "—"}
          pickupIso={load.pickup_date}
          leftFooterLabel={vehicleDetail}
          rightFooterLabel={rightFooter}
          avatarUrl={avatar.avatarUrl}
          avatarSeed={avatar.avatarSeed}
          organizationImageUrl={avatar.organizationImageUrl}
          organizationAvatarSeed={avatar.organizationAvatarSeed}
          initialsColorSeed={avatar.initialsColorSeed}
          onPress={() => onIndentPress(load)}
        />
      );
    },
    [creatorOrgProfileMap, myQuoteByIndentId, onIndentPress],
  );

  const renderClaimedMobileCard = useCallback(
    (load: IndentRow, isDone: boolean) => {
      const acceptedQuote = myQuotes.find(
        (q) =>
          (q.status || "").toLowerCase() === "accepted" &&
          q.indent_id === load.id,
      );
      const supplierRate =
        acceptedQuote?.amount != null
          ? Number(acceptedQuote.amount)
          : Number(load.client_price || 0);
      const clientLabel = (
        load.creator_organization_name ||
        load.client_name ||
        "Claimed load"
      ).trim();
      const avatar = marketLoadIndentAvatarProps(load, creatorOrgProfileMap);
      return (
        <LoadCenterHubMobileIndentCard
          key={load.id}
          indent={load}
          titleName={clientLabel}
          statusLabel={isDone ? "completed" : "claimed"}
          origin={load.pickup_area || "—"}
          dest={load.drop_location || "—"}
          pickupIso={load.pickup_date}
          leftFooterLabel={(load.vehicle_type || "—").toUpperCase()}
          rightFooterLabel={
            isDone ? "On books" : formatINR(supplierRate)
          }
          avatarUrl={avatar.avatarUrl}
          avatarSeed={avatar.avatarSeed}
          organizationImageUrl={avatar.organizationImageUrl}
          organizationAvatarSeed={avatar.organizationAvatarSeed}
          initialsColorSeed={avatar.initialsColorSeed}
          onPress={() => onIndentPress(load)}
          actions={
            <LoadCenterIndentCardFooter>
              <ClaimedIndentCardActions
                load={load}
                isDone={isDone}
                assigning={tripDeployment.assigningTripId === load.id}
                onIndentPress={onIndentPress}
                onShareIndent={handleShareIndent}
                onAssignDeploy={handshake.open}
              />
            </LoadCenterIndentCardFooter>
          }
        />
      );
    },
    [
      creatorOrgProfileMap,
      handleShareIndent,
      handshake.open,
      myQuotes,
      onIndentPress,
      tripDeployment.assigningTripId,
    ],
  );

  const renderGiveLoadGridCard = useCallback(
    (load: IndentRow) => {
      const status = (load.status || "").toLowerCase();
      const isDraft = status === "draft";
      const isAwardedPendingTrip =
        status === "awarded" && !indentIdsWithTrip.has(load.id);
      const isDone = statusMatchesFilter(status, "DONE");
      const hasDirectSupplier = !!load["assigned_supplier_id"];
      const isAwaitingSupplierDeploy =
        isAwardedPendingTrip || hasDirectSupplier;
      const bidCount = quoteCounts[load.id] ?? 0;
      const terminalForQuotePill =
        status === "awarded" || statusMatchesFilter(status, "DONE");
      const displayStatus =
        !terminalForQuotePill && bidCount > 0 ? "quoted" : status;
      const vehicleDetail = (load.vehicle_type || "—").toUpperCase();
      const loadTypeDetail = (load.load_type || "General").toUpperCase();
      const clientName = (load.client_name || "—").trim() || "—";
      const parseAmount = (value: unknown): number | null => {
        if (value == null) return null;
        if (typeof value === "number") {
          return Number.isFinite(value) ? value : null;
        }
        if (typeof value === "string") {
          const normalized = value.replace(/[^0-9.-]/g, "");
          const parsed = Number(normalized);
          return Number.isFinite(parsed) ? parsed : null;
        }
        return null;
      };
      const awardedAmount =
        parseAmount(load["assigned_supplier_rate"]) ??
        parseAmount(load["awarded_amount"]) ??
        parseAmount(load["supplier_rate"]) ??
        parseAmount(load.supplier_target) ??
        parseAmount(load.client_price);
      const showPulseToNetwork =
        Boolean(onShareToNetwork) &&
        indentCanBroadcastToPulseNetwork(load) &&
        !isDone;

      const avatar = giveLoadIndentAvatarProps(
        load,
        clientById,
        linkedOrgByOrganizationId,
      );

      return (
        <LoadCenterHubMobileIndentCard
          indent={load}
          titleName={clientName}
          statusLabel={displayStatus}
          origin={load.pickup_area || "—"}
          dest={load.drop_location || "—"}
          pickupIso={load.pickup_date}
          leftFooterLabel={vehicleDetail}
          rightFooterLabel={
            bidCount > 0
              ? `${bidCount} bid${bidCount === 1 ? "" : "s"}`
              : loadTypeDetail
          }
          avatarUrl={avatar.avatarUrl}
          avatarSeed={avatar.avatarSeed}
          organizationImageUrl={avatar.organizationImageUrl}
          organizationAvatarSeed={avatar.organizationAvatarSeed}
          initialsColorSeed={avatar.initialsColorSeed}
          onPress={() => onIndentPress(load)}
          dense
          fillGrid
          actions={
            <LoadCenterIndentCardFooter dense>
              <GiveLoadIndentCardActions
                load={load}
                bidCount={bidCount}
                isDone={isDone}
                isDraft={isDraft}
                isAwardedPendingTrip={isAwardedPendingTrip}
                isAwaitingSupplierDeploy={isAwaitingSupplierDeploy}
                showPulseToNetwork={showPulseToNetwork}
                awardedAmountLabel={
                  awardedAmount != null ? formatINR(awardedAmount) : null
                }
                onShareToNetwork={onShareToNetwork}
                onIndentPress={onIndentPress}
                onShareIndent={handleShareIndent}
                onBroadcastDraft={handleBroadcastDraft}
                onOpenAwardModal={awardModal.open}
                dense
              />
            </LoadCenterIndentCardFooter>
          }
        />
      );
    },
    [
      awardModal.open,
      clientById,
      handleBroadcastDraft,
      handleShareIndent,
      indentIdsWithTrip,
      linkedOrgByOrganizationId,
      onIndentPress,
      onShareToNetwork,
      quoteCounts,
    ],
  );

  const renderGetLoadGridCard = useCallback(
    (load: IndentRow) => {
      const existingQuote = myQuoteByIndentId.get(load.id);
      const quoteStatus = (existingQuote?.status ?? "").toLowerCase();
      const isPending = quoteStatus === "pending";
      const isRejected = quoteStatus === "rejected";
      const isAccepted = quoteStatus === "accepted";
      const isDoneOutcome =
        statusMatchesFilter(load.status || "", "DONE") ||
        indentIdsWithTrip.has(load.id);
      const vehicleDetail = (load.vehicle_type || "—").toUpperCase();
      const loadTypeDetail = (load.load_type || "—").toUpperCase();
      const clientLabel = (
        load.creator_organization_name ||
        load.client_name ||
        "Partner"
      ).trim();
      const statusLabel = isAccepted
        ? "awarded"
        : isRejected
          ? "declined"
          : isPending
            ? "quoted"
            : "open";
      const quoteAmount = Number(existingQuote?.amount ?? 0);
      const quoteVariant = isDoneOutcome
        ? "done"
        : isAccepted
          ? "accepted"
          : isRejected
            ? "rejected"
            : isPending
              ? "pending"
              : "open";
      const rightFooter = isAccepted
        ? "Awarded"
        : loadTypeDetail;
      const ctaLabel = isAccepted
        ? isDoneOutcome
          ? "View details"
          : "View claimed"
        : isPending
          ? "Update quote"
          : isRejected
            ? "New quote"
            : "Bid now";

      const avatar = marketLoadIndentAvatarProps(load, creatorOrgProfileMap);

      return (
        <LoadCenterHubMobileIndentCard
          indent={load}
          titleName={clientLabel}
          statusLabel={statusLabel}
          origin={load.pickup_area || "—"}
          dest={load.drop_location || "—"}
          pickupIso={load.pickup_date}
          leftFooterLabel={vehicleDetail}
          rightFooterLabel={rightFooter}
          avatarUrl={avatar.avatarUrl}
          avatarSeed={avatar.avatarSeed}
          organizationImageUrl={avatar.organizationImageUrl}
          organizationAvatarSeed={avatar.organizationAvatarSeed}
          initialsColorSeed={avatar.initialsColorSeed}
          onPress={() => onIndentPress(load)}
          dense
          fillGrid
          actions={
            <LoadCenterIndentCardFooter dense>
              <GetLoadIndentCardActions
                load={load}
                isAccepted={isAccepted}
                isDoneOutcome={isDoneOutcome}
                ctaLabel={ctaLabel}
                quoteVariant={quoteVariant}
                quoteAmount={quoteAmount}
                onIndentPress={onIndentPress}
                onShareIndent={handleShareIndent}
                onOpenBidModal={setBidLoad}
                onGoToClaimed={() => setLoadSubTab("AWARDED")}
                dense
              />
            </LoadCenterIndentCardFooter>
          }
        />
      );
    },
    [
      creatorOrgProfileMap,
      handleShareIndent,
      indentIdsWithTrip,
      myQuoteByIndentId,
      onIndentPress,
      setLoadSubTab,
    ],
  );

  const renderClaimedGridCard = useCallback(
    (load: IndentRow, isDone: boolean) => {
      const acceptedQuote = myQuotes.find(
        (q) =>
          (q.status || "").toLowerCase() === "accepted" &&
          q.indent_id === load.id,
      );
      const supplierRate =
        acceptedQuote?.amount != null
          ? Number(acceptedQuote.amount)
          : Number(load.client_price || 0);
      const clientLabel = (
        load.creator_organization_name ||
        load.client_name ||
        "Claimed load"
      ).trim();

      const avatar = marketLoadIndentAvatarProps(load, creatorOrgProfileMap);

      return (
        <LoadCenterHubMobileIndentCard
          indent={load}
          titleName={clientLabel}
          statusLabel={isDone ? "completed" : "claimed"}
          origin={load.pickup_area || "—"}
          dest={load.drop_location || "—"}
          pickupIso={load.pickup_date}
          leftFooterLabel={(load.vehicle_type || "—").toUpperCase()}
          rightFooterLabel={isDone ? "On books" : formatINR(supplierRate)}
          avatarUrl={avatar.avatarUrl}
          avatarSeed={avatar.avatarSeed}
          organizationImageUrl={avatar.organizationImageUrl}
          organizationAvatarSeed={avatar.organizationAvatarSeed}
          initialsColorSeed={avatar.initialsColorSeed}
          onPress={() => onIndentPress(load)}
          dense
          fillGrid
          actions={
            <LoadCenterIndentCardFooter dense>
              <ClaimedIndentCardActions
                load={load}
                isDone={isDone}
                assigning={tripDeployment.assigningTripId === load.id}
                onIndentPress={onIndentPress}
                onShareIndent={handleShareIndent}
                onAssignDeploy={handshake.open}
                dense
              />
            </LoadCenterIndentCardFooter>
          }
        />
      );
    },
    [
      creatorOrgProfileMap,
      handleShareIndent,
      handshake.open,
      myQuotes,
      onIndentPress,
      tripDeployment.assigningTripId,
    ],
  );

  const renderClaimedLoadCard = (
    load: IndentRow,
    isDone: boolean,
    stretchInGrid = false,
    /** Hide redundant "Claimed" pill when the Claimed sub-tab is already selected */
    hideClaimedContextPill = true,
  ) => {
    const acceptedQuote = myQuotes.find(
      (q) =>
        (q.status || "").toLowerCase() === "accepted" &&
        q.indent_id === load.id,
    );
    const supplierRate =
      acceptedQuote?.amount != null
        ? Number(acceptedQuote.amount)
        : Number(load.client_price || 0);
    const vehicleDetail = load.vehicle_type || "—";
    const weightValue = Number(load.weight);
    const weightDetail =
      Number.isFinite(weightValue) && weightValue > 0
        ? `${weightValue} KG`
        : "—";
    const loadTypeDetail = load.load_type || "—";

    return (
      <TouchableOpacity
        style={[styles.loadCard, stretchInGrid && styles.loadCardGrid]}
        onPress={() => onIndentPress(load)}
        activeOpacity={0.7}
      >
        <View style={[styles.loadCardOrb, { pointerEvents: "none" }]} />
        <View style={styles.loadCardHeroRow}>
          {!hideClaimedContextPill ? (
            <View style={styles.loadPillRow}>
              <View style={styles.loadTypePill}>
                <Text style={styles.loadTypePillText}>CLAIMED</Text>
              </View>
            </View>
          ) : null}
          <Text style={styles.loadCardIdCompact} numberOfLines={1}>
            {getIndentDisplayNumber(load)}
            {load.trip_number ? ` · ${load.trip_number}` : ""}
          </Text>
          <Text style={styles.loadCardDateHero}>
            {formatIndentCardDate(load.pickup_date)}
          </Text>
        </View>
        <LoadCardRouteRow
          origin={load.pickup_area || "—"}
          destination={load.drop_location || "—"}
          compact={stretchInGrid}
        />
        <View style={styles.loadCardSpecsPanel}>
          <LoadCardSpecsRow
            vehicle={vehicleDetail}
            weight={weightDetail}
            loadType={loadTypeDetail}
          />
          <View style={styles.loadCardQuoteHint}>
            <Text style={styles.loadCardQuoteHintText}>
              Agreed rate {formatINR(supplierRate)}
            </Text>
          </View>
        </View>
        <View
          style={[
            styles.loadCardFooter,
            stretchInGrid && styles.loadCardFooterGrid,
            stackIndentCardFooter && styles.loadCardFooterCompact,
          ]}
        >
          <View
            style={[
              styles.loadCardMeta,
              stackIndentCardFooter && styles.loadCardMetaCompact,
            ]}
          >
            <View style={styles.bidMetaWrap}>
              <View
                style={[
                  styles.bidIconCircle,
                  isDone
                    ? styles.bidIconCircleActive
                    : styles.bidIconCircleMuted,
                ]}
              >
                <Package
                  size={16}
                  color={isDone ? Theme.darkGreen : Theme.textMuted}
                  strokeWidth={2.2}
                />
              </View>
              <Text style={styles.loadCardMetaText} numberOfLines={2}>
                {isDone ? "Trip on books" : "Assign staff to deploy"}
              </Text>
            </View>
          </View>
          <View
            style={[
              styles.loadCardActions,
              stackIndentCardFooter && styles.loadCardActionsCompact,
            ]}
          >
            <View
              style={[
                styles.loadCardActionCluster,
                stackIndentCardFooter && styles.loadCardActionClusterStacked,
              ]}
            >
              <TouchableOpacity
                style={styles.shareIndentIconBtn}
                onPress={() => handleShareIndent(load)}
                activeOpacity={0.88}
                accessibilityLabel="Share load"
              >
                <Share2 size={18} color={Theme.textMuted} strokeWidth={2.2} />
              </TouchableOpacity>
              {isDone ? (
                <TouchableOpacity
                  style={styles.reviewBidsBtn}
                  onPress={() => onIndentPress(load)}
                  activeOpacity={0.9}
                >
                  <Text style={styles.reviewBidsBtnText}>View detail</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.reviewBidsBtn}
                  onPress={() => handshake.open(load)}
                  activeOpacity={0.9}
                  disabled={tripDeployment.assigningTripId === load.id}
                >
                  <Text style={styles.reviewBidsBtnText}>
                    {tripDeployment.assigningTripId === load.id
                      ? "Authorizing…"
                      : "Assign & deploy"}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View
      style={[
        styles.container,
        isMobileView && styles.containerMobileHub,
        { paddingTop: contentTopPadding },
      ]}
    >
      {isMobileView ? (
        <LoadCenterHubMobileShell
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          mainTabs={[
            {
              key: "GIVE_LOAD",
              label: "Give load",
              count: hirePartnerLoads.length,
            },
            {
              key: "GET_LOAD",
              label: "Get load",
              count: findWorkLoads.length,
            },
            {
              key: "AWARDED",
              label: "Claimed",
              count: awardedLoads.length,
            },
          ]}
          activeMainTab={loadSubTab}
          onMainTabChange={setLoadSubTab}
          statusTabs={mobileStatusTabs}
          activeStatusTab={statusFilterTab}
          onStatusTabChange={(id) => setStatusFilterTab(id as StatusFilterTab)}
          showStatusTabs={!isClaimedTab}
          onCreateIndentPress={onCreateIndentPress}
        />
      ) : (
      <View
        style={[
          styles.loadDarkHeader,
          isClaimedTab && styles.loadDarkHeaderClaimed,
        ]}
      >
        {/* Sub-tabs: GIVE LOAD | GET LOAD | CLAIMED */}
        <View
          style={[
            styles.loadFilterHeaderRow,
            isSingleRowHeader && styles.loadFilterHeaderRowSingle,
          ]}
        >
          <View
            style={[
              styles.loadSubTabsWrap,
              isSingleRowHeader && styles.loadSubTabsWrapSingle,
            ]}
          >
            <View
              style={styles.loadMainTabsPillWrap}
              onLayout={(e) => setLoadTabsWrapWidth(e.nativeEvent.layout.width)}
            >
              {loadTabsWrapWidth > 0 ? (
                <Animated.View
                  pointerEvents="none"
                  style={[
                    styles.loadMainTabActiveBg,
                    {
                      width: (loadTabsWrapWidth - 8) / 3,
                      transform: [
                        {
                          translateX: loadTabsActiveAnim.interpolate({
                            inputRange: [0, 1, 2],
                            outputRange: [
                              0,
                              (loadTabsWrapWidth - 8) / 3,
                              ((loadTabsWrapWidth - 8) / 3) * 2,
                            ],
                          }),
                        },
                      ],
                    },
                  ]}
                />
              ) : null}
              {[
                {
                  key: "GIVE_LOAD" as const,
                  label: "GIVE LOAD",
                  count: hirePartnerLoads.length,
                },
                {
                  key: "GET_LOAD" as const,
                  label: "GET LOAD",
                  count: findWorkLoads.length,
                },
                {
                  key: "AWARDED" as const,
                  label: "CLAIMED",
                  count: awardedLoads.length,
                },
              ].map((tab) => {
                const active = loadSubTab === tab.key;
                return (
                  <TouchableOpacity
                    key={tab.key}
                    style={[
                      styles.loadMainTabPill,
                      active && styles.loadMainTabPillActive,
                    ]}
                    onPress={() => setLoadSubTab(tab.key)}
                    activeOpacity={0.8}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active }}
                  >
                    <Text
                      style={[
                        styles.loadMainTabPillText,
                        active && styles.loadMainTabPillTextActive,
                      ]}
                      numberOfLines={1}
                    >
                      {tab.label}
                    </Text>
                    {tab.count > 0 ? (
                      <View
                        style={[
                          styles.loadMainTabBadge,
                          active && styles.loadMainTabBadgeActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.loadMainTabBadgeText,
                            active && styles.loadMainTabBadgeTextActive,
                          ]}
                        >
                          {tab.count}
                        </Text>
                      </View>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
          {onMyNetworkPress ? (
            <TouchableOpacity
              style={styles.loadMyNetworkBtn}
              onPress={onMyNetworkPress}
              activeOpacity={0.85}
              accessibilityLabel="My network"
              hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
            >
              <Users size={18} color={Theme.textOnDark} strokeWidth={2.1} />
              <Text style={styles.loadMyNetworkBtnLabel}>Network</Text>
            </TouchableOpacity>
          ) : null}
          {isSingleRowHeader ? (
            <>
              <View
                style={[styles.loadSearchWrap, styles.loadSearchWrapSingle]}
              >
                <FontAwesome
                  name="search"
                  size={15}
                  color={Theme.textSecondary}
                  style={styles.loadSearchIcon}
                />
                <TextInput
                  style={styles.loadSearchInput}
                  placeholder="Search loads by route, load ID, client..."
                  placeholderTextColor={Theme.textSecondary}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
              {statusTabsForRole.length > 0 ? (
                <View style={styles.loadTypeFilterWrap}>
                  {statusTabsForRole.map((tab) => {
                    const count = statusTabCounts[tab.id];
                    const isActive = statusFilterTab === tab.id;
                    const tabLabel =
                      loadSubTab === "GIVE_LOAD" && tab.id === "OPEN"
                        ? "Created"
                        : tab.label;
                    return (
                      <TouchableOpacity
                        key={tab.id}
                        style={[
                          styles.loadTypeFilterChip,
                          isActive && styles.loadTypeFilterChipActive,
                        ]}
                        onPress={() => setStatusFilterTab(tab.id)}
                        activeOpacity={0.8}
                      >
                        <Text
                          style={[
                            styles.loadTypeFilterChipText,
                            isActive && styles.loadTypeFilterChipTextActive,
                          ]}
                        >
                          {tabLabel}
                        </Text>
                        <Text
                          style={[
                            styles.loadTypeFilterChipCount,
                            isActive && styles.loadTypeFilterChipCountActive,
                          ]}
                        >
                          {count}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : null}
            </>
          ) : null}
        </View>
        {/* Search + Status filters (same layout as Manage Network: search + filter chips) */}
        {!isSingleRowHeader ? (
          <View
            style={[
              styles.loadSearchRow,
              isClaimedTab && styles.loadSearchRowClaimed,
            ]}
          >
            <View style={styles.loadSearchWrap}>
              <FontAwesome
                name="search"
                size={15}
                color={Theme.textSecondary}
                style={styles.loadSearchIcon}
              />
              <TextInput
                style={styles.loadSearchInput}
                placeholder="Search loads by route, load ID, client..."
                placeholderTextColor={Theme.textSecondary}
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            {statusTabsForRole.length > 0 ? (
              <View style={styles.loadTypeFilterWrap}>
                {statusTabsForRole.map((tab) => {
                  const count = statusTabCounts[tab.id];
                  const isActive = statusFilterTab === tab.id;
                  const tabLabel =
                    loadSubTab === "GIVE_LOAD" && tab.id === "OPEN"
                      ? "Created"
                      : tab.label;
                  return (
                    <TouchableOpacity
                      key={tab.id}
                      style={[
                        styles.loadTypeFilterChip,
                        isActive && styles.loadTypeFilterChipActive,
                      ]}
                      onPress={() => setStatusFilterTab(tab.id)}
                      activeOpacity={0.8}
                    >
                      <Text
                        style={[
                          styles.loadTypeFilterChipText,
                          isActive && styles.loadTypeFilterChipTextActive,
                        ]}
                      >
                        {tabLabel}
                      </Text>
                      <Text
                        style={[
                          styles.loadTypeFilterChipCount,
                          isActive && styles.loadTypeFilterChipCountActive,
                        ]}
                      >
                        {count}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
      )}

      {/* Content area: rounded top, light bg — reference overlap */}
      <View
        style={[
          styles.loadContentWrap,
          isClaimedTab && styles.loadContentWrapClaimed,
          isMobileView && styles.loadContentWrapMobileHub,
        ]}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            isClaimedTab && styles.scrollContentClaimed,
            isMobileView && styles.scrollContentMobileHub,
            { paddingBottom },
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            loadSubTab === "GET_LOAD" ? (
              <RefreshControl
                refreshing={marketRefetching && !marketLoading}
                onRefresh={() => refetchMarketIndents()}
                tintColor={Theme.primary}
              />
            ) : undefined
          }
        >
          {loadSubTab === "GIVE_LOAD" && (
            <>
              {isLoading ? (
                <View style={styles.loadingWrap}>
                  <ActivityIndicator size="small" color={Theme.primary} />
                  <Text style={styles.loadingText}>Loading…</Text>
                </View>
              ) : filteredHirePartnerLoads.length === 0 ? (
                <View style={styles.emptyWrap}>
                  <View style={styles.emptyIconWrapMuted}>
                    <FontAwesome
                      name="trophy"
                      size={56}
                      color={Theme.textMuted}
                    />
                  </View>
                  <Text style={styles.emptyTitle}>
                    {statusFilterTab === "OPEN"
                      ? loadSubTab === "GIVE_LOAD"
                        ? "Created"
                        : "Open"
                      : statusFilterTab === "QUOTED"
                        ? "Quoted"
                        : statusFilterTab === "AWARDED"
                          ? "Awarded"
                          : "Done"}
                  </Text>
                  <Text style={styles.emptySub}>
                    {statusFilterTab === "OPEN"
                      ? loadSubTab === "GIVE_LOAD"
                        ? "Created loads will appear here."
                        : "Open loads will appear here."
                      : statusFilterTab === "QUOTED"
                        ? "Quoted loads will appear here."
                        : statusFilterTab === "DONE"
                          ? "Done loads will appear here."
                          : "Awarded loads will appear here."}
                  </Text>
                </View>
              ) : isMobileView ? (
                <LoadCenterHubMobileListCanvas>
                  {filteredHirePartnerLoads.map((load) =>
                    renderGiveLoadMobileCard(load),
                  )}
                </LoadCenterHubMobileListCanvas>
              ) : (
                <View style={useGridLayout ? styles.gridList : undefined}>
                  <View style={styles.loadSectionHeaderBlock}>
                    <View style={styles.loadSectionRow}>
                      <Text style={styles.loadSectionTitle}>
                        Your active indents
                      </Text>
                      <View style={styles.loadSectionPill}>
                        <Text style={styles.loadSectionPillText}>Live</Text>
                      </View>
                    </View>
                    {onShareToNetwork ? (
                      <Text style={styles.loadSectionSub}>
                        Indents not yet awarded: use Pulse to broadcast a 24h
                        story to your network.
                      </Text>
                    ) : null}
                  </View>
                  {useGridLayout
                    ? giveLoadGridPagination.paginatedItems.map((load) => (
                        <View
                          key={load.id}
                          style={[
                            styles.gridCardWrap,
                            highlightedIndentId === load.id &&
                              styles.highlightedIndentCard,
                          ]}
                        >
                          {renderGiveLoadGridCard(load)}
                        </View>
                      ))
                    : filteredHirePartnerLoads.map((load) => {
                    const status = (load.status || "").toLowerCase();
                    const isDraft = status === "draft";
                    const isAwardedPendingTrip =
                      status === "awarded" && !indentIdsWithTrip.has(load.id);
                    const isDone = statusMatchesFilter(status, "DONE");
                    const vehicleDetail = load.vehicle_type || "—";
                    const weightValue = Number(load.weight);
                    const weightDetail =
                      Number.isFinite(weightValue) && weightValue > 0
                        ? `${weightValue} KG`
                        : "—";
                    const loadTypeDetail = load.load_type || "—";
                    // Indent was assigned a supplier directly (no quote needed).
                    const hasDirectSupplier = !!load["assigned_supplier_id"];
                    // Shipper view: never show "Create Trip". The supplier creates the trip from
                    // Claimed (Assign Staff & Deploy). When awarded but no trip yet, supplier
                    // is assigned (from accepted quote or assigned_supplier_id); status stays
                    // "awarded" until supplier deploys.
                    const isAwaitingSupplierDeploy =
                      isAwardedPendingTrip || hasDirectSupplier;
                    const parseAmount = (value: unknown): number | null => {
                      if (value == null) return null;
                      if (typeof value === "number") {
                        return Number.isFinite(value) ? value : null;
                      }
                      if (typeof value === "string") {
                        const normalized = value.replace(/[^0-9.-]/g, "");
                        const parsed = Number(normalized);
                        return Number.isFinite(parsed) ? parsed : null;
                      }
                      return null;
                    };
                    const awardedAmount =
                      parseAmount(load["assigned_supplier_rate"]) ??
                      parseAmount(load["awarded_amount"]) ??
                      parseAmount(load["supplier_rate"]) ??
                      parseAmount(load.supplier_target) ??
                      parseAmount(load.client_price);
                    const bidCount = quoteCounts[load.id] ?? 0;
                    const terminalForQuotePill =
                      status === "awarded" ||
                      statusMatchesFilter(status, "DONE");
                    const displayStatus =
                      !terminalForQuotePill && bidCount > 0 ? "quoted" : status;
                    const statusPill = giveLoadStatusPillStyles(displayStatus);
                    const showPulseToNetwork =
                      Boolean(onShareToNetwork) &&
                      indentCanBroadcastToPulseNetwork(load) &&
                      !isDone;
                    return (
                      <View key={load.id}>
                        <TouchableOpacity
                          style={styles.loadCard}
                          onPress={() => onIndentPress(load)}
                          activeOpacity={0.7}
                        >
                          <View
                            style={[
                              styles.loadCardOrb,
                              { pointerEvents: "none" },
                            ]}
                          />
                          <View style={styles.loadCardHeroRow}>
                            <View style={styles.loadPillRow}>
                              <View
                                style={[styles.loadStatePill, statusPill.pill]}
                              >
                                <Text
                                  style={[
                                    styles.loadStatePillText,
                                    statusPill.text,
                                  ]}
                                >
                                  {displayStatus.toUpperCase()}
                                </Text>
                              </View>
                            </View>
                            <Text style={styles.loadCardDateHero}>
                              {formatIndentCardDate(load.pickup_date)}
                            </Text>
                          </View>
                          <LoadCardRouteRow
                            origin={load.pickup_area || "—"}
                            destination={load.drop_location || "—"}
                          />
                          <Text
                            style={styles.loadCardIdCompact}
                            numberOfLines={1}
                          >
                            {getIndentDisplayNumber(load)}
                          </Text>
                          <View style={styles.loadCardSpecsPanel}>
                            <LoadCardSpecsRow
                              vehicle={vehicleDetail}
                              weight={weightDetail}
                              loadType={loadTypeDetail}
                            />
                            {(isAwaitingSupplierDeploy ||
                              status === "awarded") &&
                            awardedAmount != null ? (
                              <View style={styles.loadCardQuoteHint}>
                                <Text style={styles.loadCardQuoteHintText}>
                                  Awarded amount {formatINR(awardedAmount)}
                                </Text>
                              </View>
                            ) : null}
                          </View>
                          <View
                            style={[
                              styles.loadCardFooter,
                              stackIndentCardFooter && styles.loadCardFooterCompact,
                            ]}
                          >
                            <View
                              style={[
                                styles.loadCardMeta,
                                stackIndentCardFooter &&
                                  styles.loadCardMetaCompact,
                              ]}
                            >
                              {isDone ? (
                                <View style={styles.bidMetaWrap}>
                                  <View
                                    style={[
                                      styles.bidIconCircle,
                                      styles.bidIconCircleMuted,
                                    ]}
                                  >
                                    <FontAwesome
                                      name="check-circle"
                                      size={16}
                                      color={
                                        status === "cancelled"
                                          ? Theme.textMuted
                                          : Theme.positive
                                      }
                                    />
                                  </View>
                                  <Text style={styles.loadCardMetaText}>
                                    {status === "cancelled"
                                      ? "Cancelled"
                                      : "Completed"}
                                  </Text>
                                </View>
                              ) : isAwardedPendingTrip ? (
                                <View style={styles.bidMetaWrap}>
                                  <View
                                    style={[
                                      styles.bidIconCircle,
                                      styles.bidIconCircleActive,
                                    ]}
                                  >
                                    <FontAwesome
                                      name="trophy"
                                      size={16}
                                      color={Theme.driverGold}
                                    />
                                  </View>
                                  <Text style={styles.loadCardMetaText}>
                                    Supplier claimed
                                    {awardedAmount != null
                                      ? ` · ${formatINR(awardedAmount)}`
                                      : ""}
                                  </Text>
                                </View>
                              ) : (
                                <View style={styles.bidMetaWrap}>
                                  <View
                                    style={[
                                      styles.bidIconCircle,
                                      bidCount > 0
                                        ? styles.bidIconCircleActive
                                        : styles.bidIconCircleMuted,
                                    ]}
                                  >
                                    {bidCount > 0 ? (
                                      <BidReceivedHammer
                                        visible={true}
                                        size={16}
                                      />
                                    ) : (
                                      <FontAwesome
                                        name="gavel"
                                        size={16}
                                        color={Theme.textMuted}
                                      />
                                    )}
                                  </View>
                                  <Text
                                    style={styles.loadCardMetaText}
                                    numberOfLines={1}
                                  >
                                    {bidCount} bids received
                                  </Text>
                                </View>
                              )}
                            </View>
                            <View
                              style={[
                                styles.loadCardActions,
                                stackIndentCardFooter &&
                                  styles.loadCardActionsCompact,
                              ]}
                            >
                              <View
                                style={[
                                  styles.loadCardActionCluster,
                                  stackIndentCardFooter &&
                                    styles.loadCardActionClusterStacked,
                                ]}
                              >
                                <TouchableOpacity
                                  style={styles.shareIndentIconBtn}
                                  onPress={() =>
                                    isDone || isAwardedPendingTrip
                                      ? onIndentPress(load)
                                      : handleShareIndent(load)
                                  }
                                  activeOpacity={0.88}
                                  accessibilityLabel={
                                    isDone || isAwardedPendingTrip
                                      ? "View detail"
                                      : "Share indent"
                                  }
                                >
                                  <Share2
                                    size={18}
                                    color={Theme.textMuted}
                                    strokeWidth={2.2}
                                  />
                                </TouchableOpacity>
                                {showPulseToNetwork && onShareToNetwork ? (
                                  <TouchableOpacity
                                    style={styles.broadcastNetworkBtn}
                                    onPress={() => onShareToNetwork(load)}
                                    activeOpacity={0.85}
                                    accessibilityLabel="Broadcast indent to Pulse network as story"
                                  >
                                    <Zap size={13} color="#fff" fill="#fff" />
                                    <Text
                                      style={styles.broadcastNetworkBtnText}
                                    >
                                      Pulse
                                    </Text>
                                  </TouchableOpacity>
                                ) : null}
                                {isDone ? null : isAwaitingSupplierDeploy ? (
                                  <View style={styles.deployPendingWrap}>
                                    <Text style={styles.deployPendingText}>
                                      Pending
                                    </Text>
                                  </View>
                                ) : (
                                  <TouchableOpacity
                                    style={styles.reviewBidsBtn}
                                    onPress={() => {
                                      if (isDraft) {
                                        handleBroadcastDraft(load);
                                        return;
                                      }
                                      awardModal.open(load);
                                    }}
                                    activeOpacity={0.9}
                                  >
                                    <Text style={styles.reviewBidsBtnText}>
                                      {isDraft ? "Broadcast" : "Review Hub"}
                                    </Text>
                                  </TouchableOpacity>
                                )}
                              </View>
                            </View>
                          </View>
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                  {useGridLayout && giveLoadGridPagination.totalItems > 0 ? (
                    <View style={styles.gridPaginationWrap}>
                      <HubListPaginationBar
                        page={giveLoadGridPagination.page}
                        totalPages={giveLoadGridPagination.totalPages}
                        totalItems={giveLoadGridPagination.totalItems}
                        pageSize={giveLoadGridPagination.pageSize}
                        onPageSizeChange={giveLoadGridPagination.setPageSize}
                        itemLabel="loads"
                        onPrev={() =>
                          giveLoadGridPagination.setPage((p) =>
                            Math.max(0, p - 1),
                          )
                        }
                        onNext={() =>
                          giveLoadGridPagination.setPage((p) =>
                            Math.min(
                              giveLoadGridPagination.totalPages - 1,
                              p + 1,
                            ),
                          )
                        }
                      />
                    </View>
                  ) : null}
                </View>
              )}
            </>
          )}

          {loadSubTab === "GET_LOAD" &&
            (marketLoading ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator size="small" color={Theme.primary} />
                <Text style={styles.loadingText}>Loading…</Text>
              </View>
            ) : marketError ? (
              <ContentErrorState
                variant="loads"
                layout="embedded"
                onRetry={() => void refetchMarketIndents()}
                retrying={marketRefetching}
              />
            ) : filteredFindWorkList.length === 0 ? (
              <View style={styles.emptyWrap}>
                <View style={styles.emptyIconWrapMuted}>
                  <FontAwesome
                    name="trophy"
                    size={56}
                    color={Theme.textMuted}
                  />
                </View>
                <Text style={styles.emptyTitle}>Get Load</Text>
                <Text style={styles.emptySub}>
                  Loads shared with you by partners will appear here. Connect as
                  an integrated supplier to see loads from shippers.
                </Text>
              </View>
            ) : isMobileView ? (
              <LoadCenterHubMobileListCanvas>
                {filteredFindWorkList.map((load) =>
                  renderGetLoadMobileCard(load),
                )}
              </LoadCenterHubMobileListCanvas>
            ) : (
              <View style={useGridLayout ? styles.gridList : undefined}>
                <View style={styles.loadSectionRow}>
                  <Text style={styles.loadSectionTitle}>
                    Market opportunities
                  </Text>
                  <View style={styles.loadSectionPill}>
                    <Text style={styles.loadSectionPillText}>Live</Text>
                  </View>
                </View>
                {useGridLayout
                  ? findWorkGridPagination.paginatedItems.map((load) => (
                      <View
                        key={load.id}
                        style={[
                          styles.gridCardWrap,
                          highlightedIndentId === load.id &&
                            styles.highlightedIndentCard,
                        ]}
                      >
                        {renderGetLoadGridCard(load)}
                      </View>
                    ))
                  : filteredFindWorkList.map((load) => {
                  const existingQuote = myQuoteByIndentId.get(load.id);
                  const quoteStatus = (
                    existingQuote?.status ?? ""
                  ).toLowerCase();
                  const isPending = quoteStatus === "pending";
                  const isRejected = quoteStatus === "rejected";
                  const isAccepted = quoteStatus === "accepted";
                  const isDoneOutcome =
                    statusMatchesFilter(load.status || "", "DONE") ||
                    indentIdsWithTrip.has(load.id);
                  const vehicleDetail = load.vehicle_type || "—";
                  const weightValue = Number(load.weight);
                  const weightDetail =
                    Number.isFinite(weightValue) && weightValue > 0
                      ? `${weightValue} KG`
                      : "—";
                  const loadTypeDetail = load.load_type || "—";
                  const openBidModal = () => {
                    setBidLoad(load);
                  };
                  const clientLabel = (
                    load.creator_organization_name ||
                    load.client_name ||
                    ""
                  ).trim();
                  const getStatePill = () => {
                    if (isAccepted) {
                      return {
                        wrap: {
                          backgroundColor: Theme.positive,
                          borderWidth: 1,
                          borderColor: Theme.darkGreen,
                        },
                        txt: { color: Theme.textOnPrimary },
                        label: (
                          existingQuote?.status || "AWARDED"
                        ).toUpperCase(),
                      };
                    }
                    if (isRejected) {
                      return {
                        wrap: {
                          backgroundColor: Theme.negativeMuted,
                          borderWidth: 1,
                          borderColor: Theme.teslaRed,
                        },
                        txt: { color: Theme.teslaRed },
                        label: "DECLINED",
                      };
                    }
                    if (isPending) {
                      return {
                        wrap: {
                          backgroundColor: Theme.tripHubUnassignedPillBg,
                          borderWidth: 1,
                          borderColor: Theme.textPrimaryDark,
                        },
                        txt: { color: Theme.textPrimaryDark },
                        label: "QUOTED",
                      };
                    }
                    return {
                      wrap: {
                        backgroundColor: Theme.surfaceGray,
                        borderWidth: 1,
                        borderColor: Theme.borderMedium,
                      },
                      txt: { color: Theme.textPrimaryDark },
                      label: "OPEN",
                    };
                  };
                  const sp = getStatePill();
                  const hideGetLoadStatePill = shouldHideGetLoadStatePill(
                    statusFilterTab,
                    sp.label,
                    isAccepted,
                  );
                  const metaLine = isAccepted
                    ? isDoneOutcome
                      ? "Completed — open details"
                      : "Awarded — open Claimed to deploy"
                    : isRejected
                      ? "Quote declined — send a new price"
                      : isPending
                        ? `Your quote ${formatINR(Number(existingQuote?.amount ?? 0))}`
                        : "No quote sent yet";
                  const ctaLabel = isAccepted
                    ? isDoneOutcome
                      ? "View details"
                      : "View claimed"
                    : isPending
                      ? "Update quote"
                      : isRejected
                        ? "New quote"
                        : "Bid now";
                  return (
                    <View key={load.id}>
                      <TouchableOpacity
                        style={styles.loadCard}
                        onPress={() => onIndentPress(load)}
                        activeOpacity={0.7}
                      >
                        <View
                          style={[
                            styles.loadCardOrb,
                            { pointerEvents: "none" },
                          ]}
                        />
                        <View style={styles.loadCardHeroRow}>
                          {!hideGetLoadStatePill ? (
                            <View style={styles.loadPillRow}>
                              <View style={[styles.loadStatePill, sp.wrap]}>
                                <Text
                                  style={[styles.loadStatePillText, sp.txt]}
                                >
                                  {sp.label}
                                </Text>
                              </View>
                            </View>
                          ) : (
                            <View style={{ flex: 1 }} />
                          )}
                          <Text style={styles.loadCardDateHero}>
                            {formatIndentCardDate(load.pickup_date)}
                          </Text>
                        </View>
                        <LoadCardRouteRow
                          origin={load.pickup_area || "—"}
                          destination={load.drop_location || "—"}
                        />
                        {clientLabel ? (
                          <View style={styles.loadMarketClientRow}>
                            <View style={styles.getLoadAvatarWrap}>
                              {(() => {
                                const avatar = marketLoadIndentAvatarProps(
                                  load,
                                  creatorOrgProfileMap,
                                );
                                return (
                                  <PartyAvatar
                                    name={clientLabel}
                                    initialsColorSeed={avatar.initialsColorSeed}
                                    organizationImageUrl={
                                      avatar.organizationImageUrl
                                    }
                                    organizationAvatarSeed={
                                      avatar.organizationAvatarSeed
                                    }
                                    avatarUrl={avatar.avatarUrl}
                                    avatarSeed={avatar.avatarSeed}
                                    entityType="client"
                                    size={28}
                                  />
                                );
                              })()}
                            </View>
                            <Building2
                              size={14}
                              color={Theme.textSecondary}
                              strokeWidth={2.2}
                            />
                            <Text
                              style={styles.loadMarketClientText}
                              numberOfLines={1}
                            >
                              {clientLabel.toUpperCase()}
                            </Text>
                          </View>
                        ) : null}
                        <Text
                          style={styles.loadCardIdCompact}
                          numberOfLines={1}
                        >
                          {getIndentDisplayNumber(load)}
                        </Text>
                        <View style={styles.loadCardSpecsPanel}>
                          <LoadCardSpecsRow
                            vehicle={vehicleDetail}
                            weight={weightDetail}
                            loadType={loadTypeDetail}
                          />
                          <View style={styles.loadCardQuoteHint}>
                            <Text style={styles.loadCardQuoteHintText}>
                              Target{" "}
                              {formatINR(
                                Number(
                                  load.supplier_target ??
                                    load.client_price ??
                                    0,
                                ),
                              )}
                            </Text>
                          </View>
                        </View>
                        <View
                          style={[
                            styles.loadCardFooter,
                            stackIndentCardFooter && styles.loadCardFooterCompact,
                          ]}
                        >
                          <View
                            style={[
                              styles.loadCardMeta,
                              stackIndentCardFooter && styles.loadCardMetaCompact,
                            ]}
                          >
                            <View style={styles.bidMetaWrap}>
                              <View
                                style={[
                                  styles.bidIconCircle,
                                  existingQuote
                                    ? styles.bidIconCircleActive
                                    : styles.bidIconCircleMuted,
                                ]}
                              >
                                <Package
                                  size={16}
                                  color={
                                    existingQuote
                                      ? Theme.textPrimaryDark
                                      : Theme.textMuted
                                  }
                                  strokeWidth={2.2}
                                />
                              </View>
                              <Text
                                style={styles.loadCardMetaText}
                                numberOfLines={2}
                              >
                                {metaLine}
                              </Text>
                            </View>
                          </View>
                          <View
                            style={[
                              styles.loadCardActions,
                              stackIndentCardFooter &&
                                styles.loadCardActionsCompact,
                            ]}
                          >
                            <View
                              style={[
                                styles.loadCardActionCluster,
                                stackIndentCardFooter &&
                                  styles.loadCardActionClusterStacked,
                              ]}
                            >
                              <TouchableOpacity
                                style={styles.shareIndentIconBtn}
                                onPress={() => handleShareIndent(load)}
                                activeOpacity={0.88}
                                accessibilityLabel="Share load"
                              >
                                <Share2
                                  size={18}
                                  color={Theme.textMuted}
                                  strokeWidth={2.2}
                                />
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={styles.reviewBidsBtn}
                                onPress={
                                  isAccepted
                                    ? isDoneOutcome
                                      ? () => onIndentPress(load)
                                      : () => setLoadSubTab("AWARDED")
                                    : openBidModal
                                }
                                activeOpacity={0.9}
                              >
                                <Text style={styles.reviewBidsBtnText}>
                                  {ctaLabel}
                                </Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        </View>
                      </TouchableOpacity>
                    </View>
                  );
                })}
                {useGridLayout && findWorkGridPagination.totalItems > 0 ? (
                  <View style={styles.gridPaginationWrap}>
                    <HubListPaginationBar
                      page={findWorkGridPagination.page}
                      totalPages={findWorkGridPagination.totalPages}
                      totalItems={findWorkGridPagination.totalItems}
                      pageSize={findWorkGridPagination.pageSize}
                      onPageSizeChange={findWorkGridPagination.setPageSize}
                      itemLabel="loads"
                      onPrev={() =>
                        findWorkGridPagination.setPage((p) =>
                          Math.max(0, p - 1),
                        )
                      }
                      onNext={() =>
                        findWorkGridPagination.setPage((p) =>
                          Math.min(
                            findWorkGridPagination.totalPages - 1,
                            p + 1,
                          ),
                        )
                      }
                    />
                  </View>
                ) : null}
              </View>
            ))}

          {loadSubTab === "AWARDED" &&
            (displayedClaimedLoads.length === 0 ? (
              <View style={styles.emptyWrap}>
                <View style={styles.emptyIconWrapGold}>
                  <FontAwesome
                    name="trophy"
                    size={56}
                    color={Theme.driverGold}
                  />
                </View>
                <Text style={styles.emptyTitle}>
                  {statusFilterTab === "DONE" ? "Done" : "Claimed"}
                </Text>
                <Text style={styles.emptySub}>
                  {statusFilterTab === "DONE"
                    ? "Completed claimed loads will appear here."
                    : "Claimed loads will appear here."}
                </Text>
              </View>
            ) : isMobileView ? (
              <LoadCenterHubMobileListCanvas>
                {filteredClaimedLoads.map((load) =>
                  renderClaimedMobileCard(load, false),
                )}
              </LoadCenterHubMobileListCanvas>
            ) : (
              <View style={styles.securedSection}>
                <View style={styles.loadSectionRow}>
                  <Text style={styles.loadSectionTitle}>
                    {statusFilterTab === "DONE"
                      ? "Completed claimed loads"
                      : "Ready to deploy"}
                  </Text>
                  <View style={styles.loadSectionPill}>
                    <Text style={styles.loadSectionPillText}>
                      {displayedClaimedLoads.length}{" "}
                      {statusFilterTab === "DONE" ? "done" : "live"}
                    </Text>
                  </View>
                </View>
                {useGridLayout ? (
                  <View style={styles.gridList}>
                    {claimedGridPagination.paginatedItems.map((load) => (
                      <View
                        key={`claimed-${load.id}`}
                        style={[
                          styles.gridCardWrap,
                          highlightedIndentId === load.id &&
                            styles.highlightedIndentCard,
                        ]}
                      >
                        {renderClaimedGridCard(
                          load,
                          statusFilterTab === "DONE",
                        )}
                      </View>
                    ))}
                    {claimedGridPagination.totalItems > 0 ? (
                      <View style={styles.gridPaginationWrap}>
                        <HubListPaginationBar
                          page={claimedGridPagination.page}
                          totalPages={claimedGridPagination.totalPages}
                          totalItems={claimedGridPagination.totalItems}
                          pageSize={claimedGridPagination.pageSize}
                          onPageSizeChange={claimedGridPagination.setPageSize}
                          itemLabel="loads"
                          onPrev={() =>
                            claimedGridPagination.setPage((p) =>
                              Math.max(0, p - 1),
                            )
                          }
                          onNext={() =>
                            claimedGridPagination.setPage((p) =>
                              Math.min(
                                claimedGridPagination.totalPages - 1,
                                p + 1,
                              ),
                            )
                          }
                        />
                      </View>
                    ) : null}
                  </View>
                ) : (
                  <FlashList<IndentRow>
                    data={displayedClaimedLoads}
                    renderItem={({ item: load }: { item: IndentRow }) => (
                      <View
                        style={[
                          highlightedIndentId === load.id
                            ? styles.highlightedIndentCard
                            : null,
                        ]}
                      >
                        {renderClaimedLoadCard(
                          load,
                          statusFilterTab === "DONE",
                          false,
                        )}
                      </View>
                    )}
                    estimatedItemSize={168}
                    keyExtractor={(item) => item.id}
                    ref={scrollRef}
                  />
                )}
              </View>
            ))}
        </ScrollView>
        {loadSubTab === "GIVE_LOAD" && !isMobileView ? (
          <View
            style={[
              styles.hirePartnerFabWrap,
              { bottom: hirePartnerFabBottom, pointerEvents: "box-none" },
            ]}
          >
            <TouchableOpacity
              style={styles.hirePartnerFab}
              onPress={onCreateIndentPress}
              activeOpacity={0.9}
              accessibilityLabel="Broadcast New Indent"
            >
              <SemanticAddIcon
                IconComponent={Package}
                iconSize={20}
                iconColor={Theme.textOnPrimary}
                badgeSize={18}
                badgeIconSize={13}
                badgeBackgroundColor="#FFFFFF"
                badgeIconColor={Theme.darkBackground}
                badgeOffsetX={-7}
                badgeOffsetY={-6}
              />
            </TouchableOpacity>
          </View>
        ) : null}
      </View>

      {/* Success overlay */}
      {showSuccess && (
        <View style={styles.successOverlay}>
          <View style={styles.successCard}>
            <View style={styles.successIconWrap}>
              <FontAwesome name="check" size={16} color={Theme.textOnPrimary} />
            </View>
            <Text style={styles.successTag}>Success</Text>
            <Text style={styles.successTitle}>{successMsg || "Success"}</Text>
          </View>
        </View>
      )}

      {/* Post / Broadcast modal — opens create-indent (reference: Deploy New Load) */}
      <Modal
        visible={showPostModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPostModal(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setShowPostModal(false)}
        >
          <View
            style={[styles.modalSheet, { paddingBottom: 24 + insets.bottom }]}
          >
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderBack} />
              <View style={styles.modalHeaderTitleWrap}>
                <Text style={styles.modalTitle}>Deploy New Load</Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowPostModal(false)}
                hitSlop={12}
                style={styles.modalHeaderClose}
              >
                <FontAwesome name="times" size={24} color={Theme.textMuted} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalHint}>
              Create an indent to share with your network.
            </Text>
            <TouchableOpacity
              style={styles.modalSubmit}
              onPress={() => {
                setShowPostModal(false);
                onCreateIndentPress();
              }}
              activeOpacity={0.9}
            >
              <FontAwesome
                name="send"
                size={16}
                color={Theme.primary}
                style={{ marginRight: 12 }}
              />
              <Text style={styles.modalSubmitText}>Share with Network</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Offer Hub modal — list quotes, select one, Award */}
      <AwardModal
        visible={awardModal.isOpen}
        award={awardModal}
        onViewIndent={onIndentPress}
        insets={insets}
      />

      {/* Submit Registry Bid modal (reference) */}
      <BidModal
        visible={bidLoad !== null}
        load={bidLoad}
        orgId={orgId}
        myQuoteByIndentId={myQuoteByIndentId}
        onClose={() => setBidLoad(null)}
        onSuccess={triggerSuccess}
        localBidHistoryByIndentId={localBidHistoryByIndentId}
        onUpdateLocalBidHistory={(indentId, entry) => {
          setLocalBidHistoryByIndentId((prev) => {
            const prior = prev[indentId] ?? [];
            const alreadyExists = prior.some(
              (row) =>
                Number(row.amount) === Number(entry.amount) &&
                row.updatedAt === entry.updatedAt,
            );
            if (alreadyExists) return prev;
            return {
              ...prev,
              [indentId]: [entry, ...prior].slice(0, 10),
            };
          });
        }}
        queryClient={queryClient}
        invalidateIndents={invalidateIndents}
        refetchMyQuotes={refetchMyQuotes}
        refetchMarketIndents={refetchMarketIndents}
        insets={insets}
      />

      {/* Staff Handshake modal */}
      <StaffHandshakeModal
        visible={handshake.state.isOpen}
        handshake={handshake}
        activeDrivers={activeDrivers}
        vehicles={vehicles}
        suppliers={suppliers}
        visiblePartnersForHandshake={visiblePartnersForHandshake}
        orgId={orgId}
        width={width}
        isCompactModalLayout={isCompactModalLayout}
        insets={insets}
        onSuccess={triggerSuccess}
      />

    </View>
  );
}

/** Reference: content bg #f4f5f7 */
const LOAD_CONTENT_BG = "#f4f5f7";

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.darkBackground },
  containerMobileHub: {
    backgroundColor: LOADS_HUB_PAGE_BG,
  },
  loadDarkHeader: {
    backgroundColor: Theme.screenBackground,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  loadDarkHeaderClaimed: {
    paddingBottom: 2,
  },
  loadFilterHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingTop: 8,
    gap: 10,
  },
  loadFilterHeaderRowSingle: {
    alignItems: "center",
    flexWrap: "nowrap",
    gap: 8,
  },
  loadSubTabsWrap: {
    flex: 1,
    minWidth: 0,
    paddingBottom: 2,
  },
  loadSubTabsWrapSingle: {
    flex: 0,
    minWidth: 380,
    maxWidth: 420,
    paddingBottom: 0,
  },
  loadMainTabsPillWrap: {
    flexDirection: "row",
    alignItems: "center",
    position: "relative",
    backgroundColor: Theme.liquidPillBg,
    borderWidth: 1,
    borderColor: Theme.liquidPillBorder,
    borderRadius: 999,
    paddingHorizontal: 4,
    paddingVertical: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  loadMainTabActiveBg: {
    position: "absolute",
    left: 4,
    top: 4,
    bottom: 4,
    borderRadius: 999,
    backgroundColor: Theme.darkBackground,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.18,
    shadowRadius: 7,
    elevation: 3,
  },
  loadMainTabPill: {
    minWidth: 0,
    flex: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    ...Platform.select({
      web: {
        outlineStyle: "none",
      } as any,
    }),
  },
  loadMainTabPillActive: {
    backgroundColor: "transparent",
  },
  loadMainTabPillText: {
    fontSize: 8.5,
    fontWeight: "900",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    flexShrink: 1,
  },
  loadMainTabPillTextActive: {
    color: Theme.textOnDark,
  },
  loadMainTabBadge: {
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  loadMainTabBadgeActive: {
    backgroundColor: "rgba(255,255,255,0.18)",
    borderColor: "rgba(255,255,255,0.3)",
  },
  loadMainTabBadgeText: {
    fontSize: 8,
    fontWeight: "800",
    color: Theme.textSecondary,
  },
  loadMainTabBadgeTextActive: {
    color: Theme.textOnDark,
  },
  loadMyNetworkBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
    flexShrink: 0,
    marginBottom: 2,
  },
  loadMyNetworkBtnLabel: {
    ...Typography.networkDarkHeaderNav,
    color: Theme.textPrimaryDark,
    ...Platform.select({
      android: { includeFontPadding: false as const },
      default: {},
    }),
  },
  hirePartnerFabWrap: {
    position: "absolute",
    right: 16,
    zIndex: 100,
    elevation: 10,
  },
  hirePartnerFab: {
    width: Layout.fabSize,
    height: Layout.fabSize,
    borderRadius: Layout.fabBorderRadius,
    backgroundColor: Theme.darkBackground,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: Theme.darkBackground,
    shadowOffset: { width: 0, height: Layout.fabShadowOffsetY },
    shadowOpacity: Layout.fabShadowOpacity,
    shadowRadius: Layout.fabShadowRadius,
    elevation: Layout.fabElevation,
  },
  loadSearchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingTop: 10,
  },
  loadSearchRowClaimed: {
    paddingTop: 6,
  },
  loadSearchWrap: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    height: 38,
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.textSecondary,
    borderRadius: 11,
    paddingHorizontal: 12,
    paddingVertical: 0,
  },
  loadSearchWrapSingle: {
    flex: 1,
    maxWidth: 520,
    minWidth: 300,
    height: 36,
    marginHorizontal: 6,
  },
  loadSearchIcon: { marginRight: 8 },
  loadSearchInput: {
    flex: 1,
    minWidth: 0,
    height: 18,
    fontSize: 11,
    lineHeight: 11,
    color: Theme.textPrimaryDark,
    paddingVertical: 0,
    ...Platform.select({
      web: {
        outlineStyle: "none",
      } as any,
    }),
  },
  loadTypeFilterWrap: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
    backgroundColor: Theme.surface,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    paddingHorizontal: 6,
    paddingVertical: 4,
    gap: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  loadTypeFilterChip: {
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  loadTypeFilterChipActive: {
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.textPrimaryDark,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.09,
    shadowRadius: 4,
    elevation: 1,
  },
  loadTypeFilterChipText: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  loadTypeFilterChipTextActive: {
    color: Theme.textPrimaryDark,
  },
  loadTypeFilterChipCount: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textSecondary,
  },
  loadTypeFilterChipCountActive: {
    color: Theme.textPrimaryDark,
  },
  loadContentWrap: {
    flex: 1,
    backgroundColor: LOAD_CONTENT_BG,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    marginTop: 0,
    overflow: "hidden",
  },
  loadContentWrapClaimed: {
    marginTop: 0,
  },
  loadContentWrapMobileHub: {
    backgroundColor: LOADS_HUB_PAGE_BG,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    marginTop: 0,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 12,
  },
  scrollContentMobileHub: {
    paddingHorizontal: 0,
    paddingTop: 8,
  },
  loadSectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 0,
    paddingHorizontal: 2,
    width: "100%",
  },
  loadSectionHeaderBlock: {
    width: "100%",
    marginBottom: 12,
  },
  loadSectionSub: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "600",
    color: Theme.textSecondary,
    marginTop: 6,
    paddingHorizontal: 2,
  },
  loadSectionTitle: {
    fontSize: 11,
    fontWeight: "900",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    flex: 1,
    minWidth: 0,
  },
  loadSectionPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
  },
  loadSectionPillText: {
    fontSize: 8,
    fontWeight: "800",
    color: Theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  loadMarketClientRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
    zIndex: 1,
  },
  /** Fixed slot height so grid row mates align when org name is missing */
  loadMarketClientRowGrid: {
    minHeight: 28,
  },
  loadMarketClientRowGridReserve: {
    minHeight: 28,
    marginBottom: 8,
  },
  loadMarketClientText: {
    flex: 1,
    fontSize: 10,
    fontWeight: "800",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    minWidth: 0,
  },
  loadCardQuoteHint: {
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  loadCardQuoteHintText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textSecondary,
  },
  reviewHubHero: {
    borderRadius: 28,
    backgroundColor: Theme.textPrimaryDark,
    padding: 18,
    marginBottom: 16,
    overflow: "hidden",
  },
  reviewHubHeroGlow: {
    position: "absolute",
    top: -40,
    right: -40,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: "rgba(255,255,255,0.07)",
  },
  reviewHubHeroKicker: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textOnDarkMuted,
    textTransform: "uppercase",
    letterSpacing: 1.4,
    marginBottom: 8,
    fontStyle: "italic",
  },
  reviewHubHeroRoute: {
    fontSize: 18,
    fontWeight: "900",
    fontStyle: "italic",
    color: Theme.textOnDark,
    textTransform: "uppercase",
    letterSpacing: -0.2,
    lineHeight: 24,
  },
  reviewHubHeroMeta: {
    flexDirection: "row",
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderOnDark,
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
    minWidth: 0,
  },
  reviewHubHeroMetaCol: {
    flex: 1,
    minWidth: 0,
  },
  reviewHubHeroMetaColEnd: {
    flexShrink: 1,
    minWidth: 0,
    maxWidth: "58%",
    alignItems: "flex-end",
  },
  reviewHubHeroStatValueEnd: {
    textAlign: "right",
    alignSelf: "stretch",
  },
  reviewHubHeroStatLabel: {
    fontSize: 8,
    fontWeight: "800",
    color: Theme.textOnDarkMuted,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  reviewHubHeroStatValue: {
    fontSize: 13,
    fontWeight: "900",
    color: Theme.textOnDark,
  },
  modalTitleCenter: {
    textAlign: "center",
    width: "100%",
  },
  modalSubtitle: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 1.6,
    marginTop: 4,
    textAlign: "center",
  },
  reviewHubModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  reviewHubModalBack: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: Theme.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  reviewHubModalHeaderSpacer: {
    width: 44,
    height: 44,
  },
  bidHubHero: {
    borderRadius: 28,
    backgroundColor: Theme.textPrimaryDark,
    padding: 18,
    marginBottom: 16,
    overflow: "hidden",
    minWidth: 0,
    alignSelf: "stretch",
    ...Platform.select({
      web: { maxWidth: "100%" as const },
    }),
  },
  bidHubHeroGlow: {
    position: "absolute",
    top: -36,
    right: -36,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  bidHubHeroKicker: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textOnDarkMuted,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  bidHubHeroRoute: {
    fontSize: 17,
    fontWeight: "900",
    fontStyle: "italic",
    color: Theme.textOnDark,
    textTransform: "uppercase",
    lineHeight: 22,
    marginBottom: 10,
  },
  bidHubHeroChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  bidHubChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderColor: Theme.borderOnDark,
  },
  bidHubChipText: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textOnDarkMuted,
    textTransform: "uppercase",
  },
  bidSectionTitle: {
    fontSize: 11,
    fontWeight: "900",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 10,
  },
  scrollContentClaimed: {
    paddingTop: 12,
  },
  gridList: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -4,
    alignItems: "stretch",
  },
  /** Desktop load grid only — 4 cards per row (25% each). */
  gridCardWrap: {
    width: "25%",
    maxWidth: "25%",
    flexBasis: "25%",
    paddingHorizontal: 4,
    marginBottom: 12,
    alignSelf: "stretch",
  },
  gridPaginationWrap: {
    width: "100%",
    flexBasis: "100%",
    paddingHorizontal: 4,
    marginTop: 4,
    marginBottom: 8,
  },
  loadCardGrid: {
    flex: 1,
    width: "100%",
    alignSelf: "stretch",
    marginBottom: 0,
  },
  loadCardFooterGrid: {
    marginTop: "auto",
  },
  loadingWrap: { paddingVertical: 32, alignItems: "center", gap: 12 },
  loadingText: { fontSize: 10, fontWeight: "700", color: Theme.textMuted },
  loadCard: {
    position: "relative",
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 28,
    padding: 18,
    marginBottom: 12,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.07,
    shadowRadius: 16,
    elevation: 3,
    overflow: "hidden",
    minHeight: 0,
  },
  loadCardOrb: {
    position: "absolute",
    top: -72,
    right: -48,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: Theme.textPrimaryDark,
    opacity: 0.04,
  },
  loadCardHeroRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
    zIndex: 1,
  },
  loadCardDateHero: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginTop: 2,
  },
  loadCardTop: {
    marginBottom: 8,
  },
  loadPillRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 1,
    flexWrap: "wrap",
  },
  loadTypePill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    backgroundColor: Theme.surfaceGray,
  },
  loadTypePillText: {
    fontSize: 7,
    fontWeight: "800",
    letterSpacing: 0.35,
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
  },
  loadStatePill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  loadStatePillText: {
    fontSize: 7,
    fontWeight: "800",
    letterSpacing: 0.45,
    textTransform: "uppercase",
  },
  loadStatePillGetLoadDefault: {
    backgroundColor: Theme.positive,
    borderWidth: 1,
    borderColor: Theme.darkGreen,
  },
  loadCardTopLeft: {
    flex: 1,
    minWidth: 0,
    paddingRight: 10,
  },
  loadCardTopRight: {
    flexShrink: 0,
    alignItems: "flex-end",
    maxWidth: "40%",
  },
  loadCardIdCompact: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textSecondary,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 12,
    zIndex: 1,
  },
  loadCardSpecsPanel: {
    backgroundColor: Theme.surfaceGray,
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    marginBottom: 4,
    zIndex: 1,
  },
  loadCardSpecDivider: {
    borderLeftWidth: 1,
    borderLeftColor: Theme.borderMedium,
    paddingLeft: 12,
    marginLeft: 0,
  },
  bidMetaWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  bidIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  bidIconCircleActive: {
    backgroundColor: Theme.screenBackground,
    borderColor: Theme.borderLight,
  },
  bidIconCircleMuted: {
    backgroundColor: Theme.surfaceGray,
    borderColor: Theme.borderLight,
  },
  shareIndentIconBtn: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  broadcastNetworkBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    backgroundColor: "#6366f1",
    borderRadius: 12,
    paddingHorizontal: 12,
    minHeight: 44,
    paddingVertical: 0,
    flexShrink: 0,
    shadowColor: "#6366f1",
    shadowOpacity: 0.35,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  broadcastNetworkBtnText: {
    fontSize: 11,
    fontWeight: "900",
    color: "#fff",
    letterSpacing: 0.2,
  },
  loadCardId: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    marginTop: 6,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  loadCardDate: {
    backgroundColor: LOAD_CONTENT_BG,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  loadCardDateText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  loadCardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "nowrap",
    gap: 10,
    marginTop: 4,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
    zIndex: 1,
  },
  loadCardFooterCompact: {
    flexDirection: "column",
    alignItems: "stretch",
    flexWrap: "wrap",
    rowGap: 10,
    columnGap: 0,
  },
  loadCardMeta: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  loadCardMetaCompact: {
    flexGrow: 0,
    flexShrink: 1,
    alignSelf: "stretch",
  },
  loadCardMetaText: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    flex: 1,
    minWidth: 0,
  },
  loadCardActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    marginLeft: 10,
    flexShrink: 0,
    flexGrow: 0,
    minWidth: 0,
  },
  loadCardActionsCompact: {
    marginLeft: 0,
    alignSelf: "stretch",
    justifyContent: "flex-end",
    width: "100%",
    maxWidth: "100%",
  },
  loadCardActionCluster: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    flexWrap: "nowrap",
    gap: 8,
    flexGrow: 0,
    flexShrink: 0,
  },
  loadCardActionClusterStacked: {
    flexWrap: "wrap",
    rowGap: 8,
    flexShrink: 1,
    maxWidth: "100%",
    alignSelf: "flex-end",
  },
  shareIndentBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#f8f9fa",
    borderWidth: 1,
    borderColor: "#EAEAEA",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 2,
    elevation: 1,
    minHeight: 30,
  },
  shareIndentBtnText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  shareIndentBtnIcon: {
    marginRight: 6,
  },
  reviewBidsBtn: {
    backgroundColor: TESLA_BLACK,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 16,
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },
  reviewBidsBtnText: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textOnPrimary,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  deployPendingWrap: {
    paddingHorizontal: 12,
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  deployPendingText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#D0D0D0",
    textTransform: "uppercase",
    letterSpacing: 2,
  },
  awardedStatusPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
  },
  awardedStatusPillText: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textSecondary,
    textTransform: "uppercase",
  },
  getLoadCompany: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    flex: 1,
    minWidth: 0,
  },
  getLoadCompanyWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  getLoadAvatarWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  getLoadAvatarImage: {
    width: "100%",
    height: "100%",
  },
  getLoadAvatarInitial: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textSecondary,
  },
  getLoadTargetLabel: {
    fontSize: 6,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    textAlign: "right",
  },
  getLoadTargetValue: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    textAlign: "right",
  },
  loadCardInner: {
    backgroundColor: Theme.surfaceGray,
    borderRadius: 20,
    padding: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    marginTop: 6,
    zIndex: 1,
  },
  loadCardInnerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 6,
  },
  loadCardSpecsGrid: {
    gap: 6,
  },
  loadCardSpecsLabelsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 0,
  },
  loadCardSpecsValuesRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "flex-start",
    gap: 0,
  },
  loadCardSpecCell: {
    flex: 1,
    minWidth: 0,
  },
  loadCardSpecCellRight: {
    alignItems: "flex-end",
  },
  loadCardSpecLabel: {
    fontSize: 8,
    fontWeight: "600",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  loadCardSpecValue: {
    fontSize: 8,
    fontWeight: "500",
    color: Theme.textSecondary,
    lineHeight: 12,
    ...Platform.select({
      android: { includeFontPadding: false as const },
      default: {},
    }),
  },
  loadCardSpecLabelRight: {
    textAlign: "right",
    alignSelf: "stretch",
  },
  loadCardSpecValueRight: {
    textAlign: "right",
    alignSelf: "stretch",
  },
  quoteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-start",
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    borderRadius: 8,
    minHeight: 30,
  },
  quoteBtnText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.teslaRed,
    textTransform: "uppercase",
  },
  quoteSentRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 8,
  },
  quoteSentBadge: { flexDirection: "row", alignItems: "center" },
  quoteSentText: { fontSize: 11, fontWeight: "600", color: Theme.textMuted },
  quoteDeclinedText: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textSecondary,
  },
  updateQuoteBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: Theme.surfaceGray,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    minHeight: 30,
  },
  updateQuoteBtnText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.teslaRed,
    textTransform: "uppercase",
  },
  awardedCard: {
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 16,
    padding: 12,
    marginBottom: 8,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
    overflow: "hidden",
    minHeight: 132,
  },
  awardedCardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  awardedBadge: { flexDirection: "row", alignItems: "center" },
  awardedBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
  },
  awardedId: {
    fontSize: 7,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
  },
  awardedRouteWrap: {
    backgroundColor: Theme.surfaceGray,
    padding: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  awardedRoute: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textSecondary,
    textTransform: "uppercase",
  },
  awardedAmount: {
    fontSize: 13,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  handshakeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "stretch",
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: TESLA_BLACK,
    borderRadius: 8,
    minHeight: 32,
  },
  handshakeBtnText: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textOnPrimary,
    textTransform: "uppercase",
  },
  securedSection: {
    marginBottom: 20,
  },
  securedSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  securedSectionTitle: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  securedSectionCount: {
    minWidth: 20,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: Theme.surfaceGray,
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textMuted,
    textAlign: "center",
  },
  emptyWrap: {
    paddingVertical: 64,
    alignItems: "center",
    backgroundColor: Theme.screenBackground,
    borderRadius: 24,
    marginHorizontal: Layout.screenPaddingHorizontal,
    marginBottom: 32,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 12,
    elevation: 2,
  },
  emptyIconWrapMuted: {
    marginBottom: 20,
    opacity: 0.4,
  },
  emptyIconWrapGold: {
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    marginTop: 12,
    textTransform: "uppercase",
    letterSpacing: 2,
  },
  emptySub: {
    fontSize: 12,
    fontWeight: "500",
    color: "#A0A0A0",
    marginTop: 12,
    textAlign: "center",
    paddingHorizontal: 40,
    lineHeight: 20,
  },
  successOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15,23,42,0.18)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  },
  successCard: {
    minWidth: 170,
    maxWidth: 220,
    backgroundColor: Theme.screenBackground,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 4,
  },
  successIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Theme.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  successTag: {
    fontSize: 8,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1.1,
    marginBottom: 2,
  },
  successTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: 1,
    textAlign: "center",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.6)",
    justifyContent: "flex-end",
  },
  bidModalPage: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
    justifyContent: "flex-end",
    minWidth: 0,
    ...Platform.select({
      web: { maxWidth: "100%" as const },
    }),
  },
  modalSheet: {
    backgroundColor: Theme.screenBackground,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 24,
    paddingTop: 12,
    minWidth: 0,
    ...Platform.select({
      web: { maxWidth: "100%" as const },
    }),
  },
  bidModalSheetFull: {
    flex: 1,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    ...Platform.select({
      web: { minWidth: 0, maxWidth: "100%" as const },
    }),
  },
  modalSheetCenter: { alignItems: "center" },
  modalHandle: {
    width: 48,
    height: 4,
    backgroundColor: Theme.surfaceGray,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 24,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  modalHeaderBack: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    minWidth: 40,
    height: 40,
  },
  modalHeaderBackText: {
    fontSize: 14,
    fontWeight: "600",
    color: Theme.teslaRed,
  },
  modalHeaderTitleWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  modalHeaderClose: {
    minWidth: 40,
    alignItems: "flex-end",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    fontStyle: "italic",
  },
  modalHint: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textMuted,
    lineHeight: 18,
    marginBottom: 16,
  },
  modalSubmit: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 18,
    backgroundColor: Theme.darkBackground,
    borderRadius: 12,
    alignSelf: "stretch",
    minWidth: 0,
    ...Platform.select({
      web: { width: "100%" as const, maxWidth: "100%" as const },
    }),
  },
  modalSubmitText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textOnPrimary,
    textTransform: "uppercase",
    letterSpacing: 1.4,
  },
  handshakeBtnModal: { backgroundColor: Theme.textPrimaryDark },
  handshakeSegmentSection: {
    alignItems: "center",
    marginBottom: 20,
  },
  handshakeSegmentPill: {
    flexDirection: "row",
    backgroundColor: "#0f172a",
    borderRadius: 14,
    padding: 4,
    gap: 4,
    ...Platform.select({
      web: {
        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
      } as any,
      default: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
        elevation: 6,
      },
    }),
  },
  handshakeSegBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 22,
    borderRadius: 11,
  },
  handshakeSegBtnActive: {
    backgroundColor: "rgba(255,255,255,0.1)",
    ...Platform.select({
      web: {
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.05)",
      } as any,
    }),
  },
  handshakeSegBtnText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  handshakeSegBtnTextActive: {
    color: "#ffffff",
  },
  handshakeAssignLaterOuter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#f1f5f9",
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 18,
    marginBottom: 20,
    ...Platform.select({
      web: {
        boxShadow: "0 1px 2px rgba(15,23,42,0.06)",
      } as any,
      default: {
        shadowColor: "#0f172a",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 1,
      },
    }),
  },
  handshakeAssignLaterOuterCompact: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    marginBottom: 12,
  },
  handshakeAssignLaterLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    flex: 1,
    minWidth: 0,
  },
  handshakeAssignLaterIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#f8fafc",
    alignItems: "center",
    justifyContent: "center",
  },
  handshakeAssignLaterTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1e293b",
  },
  handshakeAssignLaterSub: {
    fontSize: 10,
    fontWeight: "500",
    color: "#94a3b8",
    marginTop: 2,
  },
  handshakePrimaryCta: {
    width: "100%",
    minHeight: 52,
    borderRadius: 18,
    backgroundColor: "#0f172a",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    paddingVertical: 14,
    paddingHorizontal: 16,
    ...Platform.select({
      web: {
        boxShadow: "0 12px 24px rgba(15,23,42,0.2)",
        cursor: "pointer",
      } as any,
      default: {
        shadowColor: "#0f172a",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.2,
        shadowRadius: 16,
        elevation: 6,
      },
    }),
  },
  handshakePrimaryCtaText: {
    fontSize: 11,
    fontWeight: "800",
    fontStyle: "italic",
    color: "#ffffff",
    textTransform: "uppercase",
    letterSpacing: 2,
  },
  assignWebModalCardCompact: {
    width: "98%",
    maxWidth: 760,
    borderRadius: 14,
    ...Platform.select({
      web: { height: "92vh", maxHeight: "92vh" } as any,
      default: { maxHeight: "92%" },
    }),
  },
  handshakeNativeInner: {
    flex: 1,
    minHeight: 0,
  },
  assignModalPage: {
    flex: 1,
    backgroundColor: Theme.surfaceLight,
    position: "relative",
  },
  assignModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: Theme.screenBackground,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  assignModalHeaderText: { flex: 1, minWidth: 0 },
  assignModalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  assignModalSubtitle: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
    marginTop: 4,
  },
  assignModalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 12,
  },
  assignModalScroll: { flex: 1 },
  assignModalBody: {
    flex: 1,
    minHeight: 0,
  },
  assignModalScrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    width: "100%",
    alignSelf: "stretch",
  },
  tripAssignCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 10,
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: assignmentShellColors.borderSlate,
  },
  tripAssignCardHeaderTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  tripAssignSourceBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  tripAssignBadgeUnassigned: {
    backgroundColor: Theme.surfaceLight,
    borderColor: Theme.borderInput,
  },
  tripAssignSourceBadgeText: {
    fontSize: 7,
    fontWeight: "600",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  tripAssignSourceBadgeTextUnassigned: {
    color: Theme.textPrimaryDark,
  },
  tripAssignRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: assignmentShellColors.borderSlate,
  },
  tripAssignRowLast: { borderBottomWidth: 0 },
  tripAssignRowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  tripAssignIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  tripAssignIconInactive: {
    backgroundColor: "#f3f4f6",
    borderColor: assignmentShellColors.borderSlate,
  },
  tripAssignIconDriverActive: {
    backgroundColor: Theme.surfaceGray,
    borderColor: Theme.primary,
  },
  tripAssignIconVehicleActive: {
    backgroundColor: Theme.surfaceGray,
    borderColor: Theme.borderLight,
  },
  tripAssignRowTextCol: { flex: 1, minWidth: 0 },
  tripAssignRowLabel: {
    fontSize: 9,
    fontWeight: "400",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  tripAssignRowInput: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    paddingVertical: 0,
    paddingHorizontal: 0,
    minHeight: 22,
    ...Platform.select({
      web: {
        outlineStyle: "none",
      } as any,
    }),
  },
  phoneModalFound: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    marginTop: 4,
  },
  phoneModalNotFound: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textMuted,
    marginTop: 4,
  },
  phoneModalInTrip: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.negative,
    marginTop: 4,
  },
  tripAssignPartnerBlock: {
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Theme.borderLight,
    gap: 8,
  },
  tripAssignPartnerHint: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
    lineHeight: 16,
    marginBottom: 10,
  },
  aggregateSplit: {
    gap: 12,
  },
  currentNodeInnerScroll: {
    width: "100%",
  },
  currentNodeInnerScrollMobile: {
    maxHeight: 440,
  },
  currentNodeInnerScrollCompact: {
    maxHeight: 380,
  },
  currentNodeInnerScrollContent: {
    paddingBottom: 8,
  },
  aggregateMobileStack: {
    gap: 12,
  },
  aggregateSplitWide: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  aggregatePaneCard: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 12,
    backgroundColor: Theme.screenBackground,
    padding: 12,
    gap: 8,
  },
  aggregatePaneWide: {
    minHeight: 190,
  },
  aggregatePaneHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 2,
  },
  aggregatePaneTitle: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  aggregatePartnerCard: {
    minHeight: 64,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  aggregatePartnerCardSelected: {
    borderColor: Theme.primary,
    backgroundColor: Theme.surfaceLight,
  },
  aggregatePartnerAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Theme.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
  },
  aggregatePartnerAvatarText: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  aggregatePartnerName: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  aggregatePartnerSub: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
    marginTop: 1,
  },
  aggregatePartnerList: {
    gap: 8,
  },
  aggregateViewMoreBtn: {
    minHeight: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.screenBackground,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  aggregateViewMoreText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textMuted,
  },
  aggregateGridRow: {
    gap: 12,
  },
  aggregateGridRowWide: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  aggregateGridCol: {
    flex: 1,
    minWidth: 0,
    width: "100%",
  },
  aggregateInlineFieldLabel: {
    textTransform: "none",
    letterSpacing: 0.2,
    fontSize: 11,
    marginBottom: 6,
  },
  aggregatePhoneInputWrap: {
    width: "100%",
    alignSelf: "stretch",
    minHeight: 44,
    borderRadius: 10,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  aggregatePhonePrefix: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textMuted,
    flexShrink: 0,
  },
  aggregatePhoneInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    paddingVertical: 0,
    ...Platform.select({
      web: {
        outlineStyle: "none",
      } as any,
    }),
  },
  partnerAddBtn: {
    minHeight: 36,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.screenBackground,
  },
  partnerAddBtnText: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  assignSelectionGrid: {
    gap: 12,
    marginBottom: 14,
  },
  assignSelectionGridDesktop: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  assignPickerCard: {
    flex: 1,
    minWidth: 0,
    backgroundColor: Theme.screenBackground,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    padding: 14,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  assignPickerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  assignPickerTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textMuted,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  assignPickerBadge: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: Theme.surfaceLight,
  },
  assignPickerBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.primary,
    textTransform: "uppercase",
  },
  assignEntityRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.screenBackground,
    paddingHorizontal: 10,
    paddingVertical: 10,
    minHeight: 56,
    marginBottom: 8,
    gap: 10,
  },
  assignEntityRowActive: {
    borderColor: Theme.primary,
    backgroundColor: Theme.surfaceLight,
  },
  assignEntityRowDisabled: {
    opacity: 0.6,
  },
  assignEntityIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
  },
  assignEntityTextCol: {
    flex: 1,
    minWidth: 0,
  },
  assignEntityTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  assignEntitySubtitle: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
    marginTop: 2,
  },
  assignEmptyText: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textMuted,
    marginTop: 2,
    lineHeight: 18,
  },
  assignEmptyState: {
    marginTop: 2,
    gap: 10,
  },
  assignEmptyActionBtn: {
    minHeight: 44,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: Theme.primary,
  },
  assignEmptyActionBtnText: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.textOnPrimary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  assignSummaryBar: {
    backgroundColor: Theme.surfaceLight,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
  },
  assignSummaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  assignSummaryBlock: {
    flex: 1,
    minWidth: 0,
  },
  assignSummaryDivider: {
    width: 1,
    alignSelf: "stretch",
    backgroundColor: Theme.borderLight,
    marginHorizontal: 12,
  },
  assignSummaryLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  assignSummaryValue: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  assignSummaryWarningText: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: "700",
    color: Theme.warning,
    lineHeight: 18,
  },
  assignInputWrap: {
    marginBottom: 6,
  },
  subcontractPickBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Theme.screenBackground,
    borderWidth: 0,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    minHeight: 44,
    marginBottom: 6,
  },
  subcontractPickLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginRight: 10,
  },
  subcontractPickValue: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  subcontractPickerModalRoot: {
    flex: 1,
    width: "100%",
    backgroundColor: Theme.overlayBackdrop,
  },
  subcontractPickerModalBody: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 8,
  },
  subcontractPickerCard: {
    backgroundColor: Theme.screenBackground,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    overflow: "hidden",
    maxHeight: 380,
    alignSelf: "center",
    width: "100%",
    ...Platform.select({
      web: {
        maxWidth: 760,
        boxShadow: "0 10px 24px rgba(15,23,42,0.16)",
      } as any,
    }),
  },
  subcontractPickerTitle: {
    fontSize: 10,
    fontWeight: "900",
    color: Theme.textMutedDemo,
    letterSpacing: 0.9,
    textTransform: "uppercase",
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  subcontractPickerToggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
  },
  subcontractPickerToggleLabel: {
    flex: 1,
    paddingRight: 12,
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  subcontractPickerScroll: { maxHeight: 248 },
  subcontractPickerScrollContent: { paddingVertical: 6 },
  subcontractPickerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
    minHeight: 44,
  },
  subcontractPickerRowActive: {
    backgroundColor: Theme.surfaceLight,
  },
  subcontractPickerText: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    marginRight: 10,
  },
  subcontractPickerBadge: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.primary,
    borderWidth: 1,
    borderColor: Theme.primary,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    marginRight: 10,
  },
  subcontractPickerEmpty: {
    padding: 16,
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  subcontractPickerClearBtn: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: Theme.screenBackground,
  },
  subcontractPickerClearText: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.negative,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  assignVehicleInput: {
    backgroundColor: Theme.screenBackground,
    borderWidth: 0,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    minHeight: 44,
    ...Platform.select({
      web: {
        outlineStyle: "none",
      } as any,
    }),
  },
  wizardCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Theme.surfaceGray,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: "transparent",
  },
  wizardCardActive: {
    borderColor: Theme.borderLight,
  },
  wizardCardIcon: {
    marginRight: 12,
  },
  wizardCardTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    marginBottom: 4,
  },
  wizardCardSubtitle: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  otpCard: {
    backgroundColor: Theme.surfaceGray,
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    alignItems: "center",
  },
  otpCode: {
    fontSize: 24,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: 4,
    marginBottom: 8,
  },
  otpExpiry: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textMuted,
    marginBottom: 16,
  },
  otpActions: {
    flexDirection: "row",
    gap: 12,
  },
  otpBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: Theme.textPrimaryDark,
    borderRadius: 8,
  },
  otpBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textOnPrimary,
    textTransform: "uppercase",
  },
  quoteRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  quoteRowSelected: {
    backgroundColor: Theme.surfaceGray,
    borderLeftWidth: 4,
    borderLeftColor: Theme.teslaRed,
  },
  quoteRowDisabled: { opacity: 0.6 },
  quoteRowName: {
    flex: 1,
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    marginRight: 8,
  },
  quoteRowAmount: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    marginRight: 8,
  },
  quoteRowStatus: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
  },
  viewIndentBtn: {
    marginTop: 8,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    borderRadius: 12,
  },
  viewIndentBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textSecondary,
    textTransform: "uppercase",
  },
  offerHubSummary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: Theme.surfaceGray,
    borderRadius: 8,
    marginBottom: 12,
  },
  offerHubSummaryText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
  },
  offerHubSummaryLowest: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.positive,
  },
  quoteHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  quoteHeaderName: {
    flex: 1,
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    marginRight: 8,
  },
  quoteHeaderAmount: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    marginRight: 8,
  },
  quoteHeaderStatus: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
  },
  quoteHeaderRowDark: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: Theme.textPrimaryDark,
    borderRadius: 14,
    marginBottom: 8,
  },
  quoteHeaderNameDark: {
    flex: 1,
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textOnDarkMuted,
    textTransform: "uppercase",
    marginRight: 8,
    letterSpacing: 0.6,
    fontStyle: "italic",
  },
  quoteHeaderAmountDark: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textOnDarkMuted,
    textTransform: "uppercase",
    marginRight: 8,
    letterSpacing: 0.6,
    fontStyle: "italic",
  },
  quoteHeaderStatusDark: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textOnDarkMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    fontStyle: "italic",
  },
  bidEmptyWrap: { paddingVertical: 32, alignItems: "center" },
  bidEmptyText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  bidEmptySubtext: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textMuted,
    marginTop: 8,
    textAlign: "center",
  },
  bidModalTitle: { flex: 1 },
  bidModalScroll: {
    flex: 1,
    alignSelf: "stretch",
    minWidth: 0,
    ...Platform.select({
      web: { width: "100%" as const, maxWidth: "100%" as const },
    }),
  },
  bidModalScrollContent: {
    flexGrow: 1,
    paddingBottom: 8,
    ...Platform.select({
      web: { minWidth: 0, maxWidth: "100%" as const },
    }),
  },
  bidIndentDetailSection: {
    marginTop: 8,
    width: "100%",
    alignSelf: "stretch",
    marginBottom: 12,
  },
  bidIndentCard: {
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 16,
    paddingTop: 0,
    paddingHorizontal: 14,
    paddingBottom: 14,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  bidIndentCardAccent: {
    height: 3,
    width: "100%",
    backgroundColor: Theme.primary,
    marginHorizontal: -14,
    marginBottom: 12,
  },
  bidIndentCardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 14,
  },
  bidIndentCardHeaderLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  bidIndentCardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 14,
  },
  bidIndentCardTopLeft: {
    flex: 1,
    minWidth: 0,
    paddingRight: 10,
  },
  bidIndentCardTopRight: {
    flexShrink: 0,
    alignItems: "flex-end",
    minWidth: 116,
    maxWidth: "42%",
  },
  bidIndentCardOrg: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.teslaRed,
    letterSpacing: 0.5,
  },
  bidIndentCardRoute: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    marginTop: 4,
    textTransform: "uppercase",
    flexShrink: 1,
    lineHeight: 16,
  },
  bidIndentCardId: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textSecondary,
    marginTop: 6,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  bidIndentDatePill: {
    backgroundColor: LOAD_CONTENT_BG,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    marginBottom: 8,
  },
  bidIndentDatePillText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  bidIndentCardTargetLabel: {
    fontSize: 6,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    marginBottom: 0,
  },
  bidIndentCardTargetValue: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  bidIndentCardDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Theme.surfaceBorder,
    marginBottom: 4,
  },
  bidIndentSpecRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    paddingVertical: 8,
  },
  bidIndentSpecLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    flexShrink: 0,
    maxWidth: "40%",
  },
  bidIndentSpecValue: {
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
    textAlign: "right",
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    lineHeight: 18,
  },
  bidIndentStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
    gap: 12,
  },
  bidIndentStatusLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  bidIndentStatusPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
  },
  bidIndentStatusPillText: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  bidInputBlock: {
    width: "100%",
    alignSelf: "stretch",
    marginTop: 6,
    marginBottom: 24,
  },
  quoteLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 8,
  },
  quoteInput: {
    width: "100%",
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    fontSize: 14,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    minHeight: 48,
    ...Platform.select({
      web: {
        outlineStyle: "none",
        /** iOS Safari: font-size < 16px on focused inputs triggers page zoom. */
        fontSize: 16,
        lineHeight: 22,
        maxWidth: "100%",
      } as any,
    }),
  },
  previousBidWrap: {
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 10,
    backgroundColor: Theme.surfaceGray,
  },
  previousBidLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  previousBidValue: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  previousBidMeta: {
    marginTop: 2,
    fontSize: 10,
    color: Theme.textSecondary,
  },
  previousBidHistoryWrap: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Theme.borderLight,
    gap: 6,
  },
  previousBidHistoryTitle: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  previousBidHistoryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  previousBidHistoryAmount: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  previousBidHistoryDate: {
    fontSize: 10,
    color: Theme.textSecondary,
  },
  quotePlaceholder: {
    fontSize: 36,
    fontWeight: "300",
    color: Theme.textPrimaryDark,
    fontStyle: "italic",
    marginBottom: 24,
  },
  highlightedIndentCard: {
    backgroundColor: Theme.negativeMuted,
    borderColor: Theme.teslaRed,
    shadowColor: Theme.teslaRed,
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 5,
  },
});
