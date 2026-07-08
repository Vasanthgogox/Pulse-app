/**
 * Load Center — reference UI: Hire Partners | Find Work | Awarded.
 * Header "Load Center" / "Find or Hire Work", three sub-tabs, cards, modals.
 */
import { PulsePillButton } from "@/components/PulsePillButton";
import { ContentErrorState } from '@/components/ContentErrorState';
import { Typography } from "@/constants/Typography";
import { HubListPaginationBar } from "@/components/hub/HubListPaginationBar";
import { HubScreenBottomBar } from "@/components/hub/HubScreenBottomBar";
import { HubScreenShell } from "@/components/hub/HubScreenShell";
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
import { getLinkedOrgProfilesBatch } from "@/features/clients/services/clients.service";
import type { ClientRow } from "@/features/clients/services/clients.service";
import {
  giveLoadIndentAvatarProps,
  marketLoadIndentAvatarProps,
} from "@/features/network/utils/indentCardAvatar.util";
import { PartyAvatar } from "@/components/PartyAvatar";
import {
  CHAT_FILTER_MUTED,
  chatFilterChromeStyles as chatChrome,
} from "@/constants/ChatFilterChrome";
import Layout from "@/constants/Layout";
import { useLayoutInsets } from "@/lib/layoutInsets";
import Theme from "@/constants/Theme";
import { useOrganization } from "@/contexts/OrganizationContext";
import {
    BidReceivedHammer,
    getIndentDisplayNumber,
    type DirectQuoteRow,
    type IndentRow,
} from "@/features/indents";
import { shareDraftIndent } from "@/features/indents/services/indents.service";
import { resolveMarketIndentShipperLabel } from "@/features/indents/utils/indentPartyDisplay.util";
import { indentCanBroadcastToPulseNetwork } from "@/features/network/utils/indentBroadcastEligibility.util";
import {
    DONE_SUB_TABS,
    formatIndentCardDate,
    giveLoadStatusPillStyles,
    getLoadCenterStatusTabLabel,
    giveLoadBidReceivedDisplayStatus,
    resolveGetLoadMobileCardLabels,
    resolveGetLoadTicketCommerce,
    resolveGiveLoadMobileDisplayStatus,
    shouldHideGetLoadStatePill,
    STATUS_TABS,
    statusMatchesFilter,
    type DoneSubTab,
    type LoadSubTab,
    type StatusFilterTab,
} from "@/features/network/utils/loadCenter.model";
import {
  resolveTripAllocationDisplay,
  type LoadCenterDriverProfile,
} from "@/features/network/utils/loadCenterTripAllocation.util";
import { useAwardQuote } from "@/features/network/hooks/useAwardQuote";
import { useLoadCenterFilters } from "@/features/network/hooks/useLoadCenterFilters";
import { useSuccessToast } from "@/features/network/hooks/useSuccessToast";
import { useTripDeployment } from "@/features/network/hooks/useTripDeployment";
import { AwardModal } from "@/features/network/components/AwardModal";
import { BidModal } from "@/features/network/components/bidding/BidModal";
import { LoadCenterIntegratedPartiesBanner } from "@/features/network/components/LoadCenterIntegratedPartiesBanner";
import { LoadCenterIntegratedPartiesRow } from "@/features/network/components/LoadCenterIntegratedPartiesRow";
import { LoadCenterUnderlineTabStrip } from "@/features/network/components/LoadCenterUnderlineTabStrip";
import { LoadCenterPromoCard } from "@/features/network/components/LoadCenterPromoCard";
import {
  selectIntegratedClientsForLoadCenter,
  selectIntegratedSuppliersForLoadCenter,
  type LoadCenterIntegratedParty,
} from "@/features/network/utils/loadCenterIntegratedParties.util";
import {
    assignmentShellColors,
    assignmentShellStyles,
} from "@/features/trips/styles/assignmentShellShared";
import { useLinkedOrgProfileMap } from "@/lib/useLinkedOrgProfileMap";
import { formatINR } from "@/lib/format";
import { ROUTES } from "@/lib/routes";
import { resolveLoadCenterPromoVariant } from "@/lib/loadCenterPromoAssets";
import { useRouter, useFocusEffect } from "expo-router";
import { getTripOperationalDisplay } from "@/features/operations/display";
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
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { useQueryClient } from "@tanstack/react-query";
import * as Linking from "expo-linking";
import {
    Building2,
    Package,
    Share2,
    Zap,
} from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
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
  const { width, height } = useWindowDimensions();
  const router = useRouter();
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id ?? null;

  const scrollRef = useRef<FlashListRef<IndentRow>>(null);

  const [loadSubTab, setLoadSubTab] = useState<LoadSubTab>("GIVE_LOAD");
  const [statusFilterTab, setStatusFilterTab] =
    useState<StatusFilterTab>("OPEN");
  const [doneSubTab, setDoneSubTab] = useState<DoneSubTab>("REJECTED");
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
  const isCompactModalLayout = Platform.OS === "web" && width < 920;

  const { data: indents = [], isLoading } = useIndentsQuery(orgId);
  const {
    data: marketIndents = [],
    isLoading: marketLoading,
    isError: marketError,
    isRefetching: marketRefetching,
    refetch: refetchMarketIndents,
  } = useMarketIndentsQuery(orgId, { urgent: true });
  const { data: myQuotes = [], refetch: refetchMyQuotes } =
    useMyDirectQuotesQuery(orgId);
  const { data: trips = [] } = useTripsQuery(orgId);
  const { data: drivers = [] } = useDriversQuery(orgId);
  const { data: vehicles = [] } = useVehiclesQuery(orgId);
  const { data: suppliers = [] } = useSuppliersQuery(orgId);
  const { data: clients = [] } = useClientsQuery(orgId);
  const linkedOrgByOrganizationId = useLinkedOrgProfileMap(clients, suppliers);
  const integratedSuppliers = useMemo(
    () =>
      selectIntegratedSuppliersForLoadCenter(
        suppliers,
        linkedOrgByOrganizationId,
      ),
    [suppliers, linkedOrgByOrganizationId],
  );
  const integratedClients = useMemo(
    () =>
      selectIntegratedClientsForLoadCenter(clients, linkedOrgByOrganizationId),
    [clients, linkedOrgByOrganizationId],
  );

  const showIntegratedPartiesBanner = useMemo(() => {
    if (loadSubTab === "GIVE_LOAD") return integratedSuppliers.length === 0;
    if (loadSubTab === "GET_LOAD") return integratedClients.length === 0;
    return false;
  }, [loadSubTab, integratedSuppliers.length, integratedClients.length]);

  const integratedPartiesBannerMode = useMemo(
    (): "supplier" | "client" =>
      loadSubTab === "GIVE_LOAD" ? "supplier" : "client",
    [loadSubTab],
  );

  const openNetworkForParties = useCallback(() => {
    if (onMyNetworkPress) {
      onMyNetworkPress();
      return;
    }
    router.push(ROUTES.TABS.NETWORK as import("expo-router").Href);
  }, [onMyNetworkPress, router]);

  const invalidateIndents = useInvalidateIndents();
  const queryClient = useQueryClient();

  useFocusEffect(
    useCallback(() => {
      if (!orgId) return;
      void refetchMarketIndents();
    }, [orgId, refetchMarketIndents]),
  );

  const isClaimedTab = loadSubTab === "AWARDED";

  const formatLoadTabLabel = useCallback(
    (label: string, count: number) => `${label} (${count})`,
    [],
  );

  /** Desktop web: 5 indent cards per row (mobile <820 uses hub list cards). */
  const useGridLayout = Platform.OS === "web" && width >= 1024;
  const isMobileView = width < 820;
  /** Phone + tablet list: hub ticket cards; desktop grid uses dense fillGrid variant. */
  const useHubIndentListCards = !useGridLayout;
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
    doneSubTab,
    searchQuery,
  });

  const {
    myQuoteByIndentId,
    indentIdsWithTrip,
    tripByIndentId,
    hirePartnerLoads,
    awardedLoads,
    findWorkLoads,
    filteredHirePartnerLoads,
    filteredFindWorkList,
    filteredClaimedLoads,
    filteredClaimedDoneLoads,
    doneSubTabCounts,
    statusTabCounts,
  } = filters;

  const mainLoadTabs = useMemo(
    () =>
      [
        {
          key: "GIVE_LOAD" as const,
          label: "Give load",
          count: hirePartnerLoads.length,
        },
        {
          key: "GET_LOAD" as const,
          label: "Get load",
          count: findWorkLoads.length,
        },
        {
          key: "AWARDED" as const,
          label: "Claimed",
          count: awardedLoads.length,
        },
      ] as const,
    [hirePartnerLoads.length, findWorkLoads.length, awardedLoads.length],
  );

  const driverProfileById = useMemo(() => {
    const m = new Map<string, LoadCenterDriverProfile>();
    for (const d of drivers) {
      const name = String(
        (d as { full_name?: string; name?: string }).full_name ??
          (d as { name?: string }).name ??
          "",
      ).trim();
      if (!d.id) continue;
      m.set(d.id, {
        name: name || "Driver",
        avatarUrl: (d as { avatar_url?: string | null }).avatar_url ?? null,
        avatarSeed: (d as { avatar_seed?: string | null }).avatar_seed ?? null,
      });
    }
    return m;
  }, [drivers]);

  const tripAllocationForLoad = useCallback(
    (loadId: string) => {
      if (statusFilterTab !== "DONE" || doneSubTab !== "CONVERTED") return null;
      return resolveTripAllocationDisplay(
        tripByIndentId.get(loadId),
        driverProfileById,
      );
    },
    [statusFilterTab, doneSubTab, tripByIndentId, driverProfileById],
  );

  const displayedClaimedLoads = useMemo(
    () =>
      statusFilterTab === "DONE"
        ? filteredClaimedDoneLoads
        : filteredClaimedLoads,
    [statusFilterTab, filteredClaimedDoneLoads, filteredClaimedLoads],
  );

  const loadCenterPromoVariant = useMemo(
    () =>
      resolveLoadCenterPromoVariant({
        loadSubTab,
        statusFilterTab,
        doneSubTab,
        hasSearchFilter: searchQuery.trim().length > 0,
      }),
    [loadSubTab, statusFilterTab, doneSubTab, searchQuery],
  );

  const loadCenterEmptyStageStyle = useMemo(
    () => [
      styles.loadCenterEmptyStage,
      showIntegratedPartiesBanner &&
        (loadSubTab === "GIVE_LOAD" || loadSubTab === "GET_LOAD") &&
        styles.loadCenterEmptyStageIntegrated,
    ],
    [loadSubTab, showIntegratedPartiesBanner],
  );

  const integratedLoadsCanvas =
    showIntegratedPartiesBanner &&
    (loadSubTab === "GIVE_LOAD" || loadSubTab === "GET_LOAD");

  const renderLoadCenterEmptyPromo = useCallback(
    () => (
      <View style={loadCenterEmptyStageStyle}>
        {showIntegratedPartiesBanner &&
        (loadSubTab === "GIVE_LOAD" || loadSubTab === "GET_LOAD") ? (
          <LoadCenterIntegratedPartiesBanner
            mode={integratedPartiesBannerMode}
            onExploreNetwork={openNetworkForParties}
          />
        ) : (
          <LoadCenterPromoCard
            variant={loadCenterPromoVariant}
            onCtaPress={
              loadCenterPromoVariant === "give_open"
                ? onCreateIndentPress
                : undefined
            }
          />
        )}
      </View>
    ),
    [
      loadCenterEmptyStageStyle,
      showIntegratedPartiesBanner,
      loadSubTab,
      integratedPartiesBannerMode,
      openNetworkForParties,
      loadCenterPromoVariant,
      onCreateIndentPress,
    ],
  );

  const loadGridPaginationResetKey = `${loadSubTab}|${statusFilterTab}|${doneSubTab}|${searchQuery}`;
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
  const connectedSupplierOrgIds = useMemo(
    () => new Set(suppliers.map((s) => s.linked_organization_id).filter(Boolean) as string[]),
    [suppliers],
  );
  const awardModal = useAwardQuote({ orgId, queryClient, invalidateIndents, onSuccess: triggerSuccess, connectedSupplierOrgIds });

  const openIndentAllocation = useCallback(
    (load: IndentRow) => {
      router.push(ROUTES.indentAllocation(load.id) as import("expo-router").Href);
    },
    [router],
  );

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

  useEffect(() => {
    if (statusFilterTab === "DONE") return;
    setDoneSubTab("REJECTED");
  }, [statusFilterTab]);

  useEffect(() => {
    setDoneSubTab("REJECTED");
  }, [loadSubTab]);

  const renderDesktopStatusTabs = () => {
    if (statusTabsForRole.length === 0) return null;
    const showDoneSubs = statusFilterTab === "DONE";
    return (
      <View style={styles.loadsCombinedTabRow}>
        <LoadCenterUnderlineTabStrip
          variant="blue"
          compact
          tabs={statusTabsForRole.map((tab) => ({
            key: tab.id,
            label: getLoadCenterStatusTabLabel(
              loadSubTab,
              tab.id,
              tab.label,
            ),
            count: statusTabCounts[tab.id],
          }))}
          activeKey={statusFilterTab}
          onChange={(key) => setStatusFilterTab(key as StatusFilterTab)}
          formatLabel={formatLoadTabLabel}
          style={styles.loadsStatusTabGroup}
        />
        {showDoneSubs ? (
          <LoadCenterUnderlineTabStrip
            variant="pink"
            compact
            tabs={DONE_SUB_TABS.map((tab) => ({
              key: tab.id,
              label: tab.label,
              count: doneSubTabCounts[tab.id],
            }))}
            activeKey={doneSubTab}
            onChange={(key) => setDoneSubTab(key as DoneSubTab)}
            formatLabel={formatLoadTabLabel}
            style={styles.loadsDoneTabGroup}
          />
        ) : null}
      </View>
    );
  };

  const openIntegratedParty = useCallback(
    (party: LoadCenterIntegratedParty) => {
      if (party.entityType === "supplier") {
        router.push(ROUTES.supplierDetail(party.id) as import("expo-router").Href);
        return;
      }
      router.push(ROUTES.clientDetail(party.id) as import("expo-router").Href);
    },
    [router],
  );

  const renderDesktopFilterPanel = () => (
    <View style={styles.loadsBodyFiltersBleed}>
      <View style={styles.loadsInlineFilterPanelDesktop}>
        <View style={styles.loadsInlineFilterPanelInner}>
          <View style={chatChrome.filterHeaderRow}>
          <View style={styles.loadsFilterActions}>
            {loadSubTab === "GIVE_LOAD" ? renderAddLoadButton() : null}
            {loadSubTab === "GIVE_LOAD" || loadSubTab === "GET_LOAD" ? (
              <LoadCenterIntegratedPartiesRow
                mode={loadSubTab === "GIVE_LOAD" ? "supplier" : "client"}
                parties={
                  loadSubTab === "GIVE_LOAD"
                    ? integratedSuppliers
                    : integratedClients
                }
                onAddToNetwork={openNetworkForParties}
                onPartyPress={openIntegratedParty}
              />
            ) : null}
          </View>
          <View style={chatChrome.filterHeaderRight}>
            <LoadCenterUnderlineTabStrip
              variant="yellow"
              tabs={mainLoadTabs}
              activeKey={loadSubTab}
              onChange={(key) => setLoadSubTab(key as LoadSubTab)}
              formatLabel={formatLoadTabLabel}
            />
          </View>
        </View>
        <View style={chatChrome.searchScopeStrip}>
          <View style={chatChrome.searchWrap}>
            <FontAwesome
              name="search"
              size={13}
              color={CHAT_FILTER_MUTED}
              style={styles.loadsSearchIcon}
            />
            <TextInput
              style={chatChrome.searchInput}
              placeholder="Search loads by route, load ID, client..."
              placeholderTextColor={CHAT_FILTER_MUTED}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        </View>
        <View style={styles.loadsTabDivider} />
        {renderDesktopStatusTabs()}
        </View>
      </View>
    </View>
  );

  const renderAddLoadButton = () => (
    <PulsePillButton
      label="Add Load"
      showPlusIcon
      size="default"
      onPress={onCreateIndentPress}
      accessibilityLabel="Add load"
    />
  );

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

  // Add Load: mobile hub header + desktop Give Load header; empty state CTA when no rows.
  const paddingBottom = useMemo(() => {
    if (Platform.OS === "web" && !isMobileView && useGridLayout) {
      return 12;
    }
    return layout.scrollBottomPadding(36);
  }, [isMobileView, layout, useGridLayout]);
  const statusTabsForRole = useMemo(() => {
    if (!isClaimedTab) return STATUS_TABS;
    return STATUS_TABS.filter((t) => t.id === "AWARDED" || t.id === "DONE");
  }, [isClaimedTab]);

  const mobileDoneSubTabs = useMemo(
    () =>
      DONE_SUB_TABS.map((tab) => ({
        id: tab.id,
        label: tab.label,
        count: doneSubTabCounts[tab.id],
      })),
    [doneSubTabCounts],
  );

  const mobileStatusTabs = useMemo(
    () =>
      statusTabsForRole.map((tab) => ({
        id: tab.id,
        label: getLoadCenterStatusTabLabel(loadSubTab, tab.id, tab.label),
        count: statusTabCounts[tab.id],
      })),
    [statusTabsForRole, loadSubTab, statusTabCounts],
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
      const clientLabel = resolveMarketIndentShipperLabel(load);
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
          ticketCommerce={{
            kicker: isDone ? "COMPLETED" : "AWARDED",
            amountInr: isDone ? null : supplierRate,
            rightCaption: isDone ? "On books" : null,
          }}
          avatarUrl={avatar.avatarUrl}
          avatarSeed={avatar.avatarSeed}
          organizationImageUrl={avatar.organizationImageUrl}
          organizationAvatarSeed={avatar.organizationAvatarSeed}
          initialsColorSeed={avatar.initialsColorSeed}
          tripAllocation={tripAllocationForLoad(load.id)}
          onPress={() => onIndentPress(load)}
          actions={
            <LoadCenterIndentCardFooter>
              <ClaimedIndentCardActions
                load={load}
                isDone={isDone}
                assigning={tripDeployment.assigningTripId === load.id}
                onIndentPress={onIndentPress}
                onShareIndent={handleShareIndent}
                onAssignDeploy={openIndentAllocation}
              />
            </LoadCenterIndentCardFooter>
          }
        />
      );
    },
    [
      creatorOrgProfileMap,
      handleShareIndent,
      openIndentAllocation,
      myQuotes,
      onIndentPress,
      tripAllocationForLoad,
      tripDeployment.assigningTripId,
    ],
  );

  const renderGiveLoadHubCard = useCallback(
    (
      load: IndentRow,
      layout: {
        dense?: boolean;
        fillGrid?: boolean;
        withActions: boolean;
      },
    ) => {
      const status = (load.status || "").toLowerCase();
      const isDraft = status === "draft";
      const isAwardedPendingTrip =
        status === "awarded" && !indentIdsWithTrip.has(load.id);
      const isDone = statusMatchesFilter(status, "DONE");
      const hasDirectSupplier = !!load["assigned_supplier_id"];
      const isAwaitingSupplierDeploy =
        isAwardedPendingTrip || hasDirectSupplier;
      const bidCount = quoteCounts[load.id] ?? 0;
      const displayStatus = resolveGiveLoadMobileDisplayStatus(
        statusFilterTab,
        status,
        bidCount,
        indentIdsWithTrip,
        load.id,
      );
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
            isAwardedPendingTrip && awardedAmount != null
              ? formatINR(awardedAmount)
              : bidCount > 0
                ? `${bidCount} bid${bidCount === 1 ? "" : "s"}`
                : loadTypeDetail
          }
          avatarUrl={avatar.avatarUrl}
          avatarSeed={avatar.avatarSeed}
          organizationImageUrl={avatar.organizationImageUrl}
          organizationAvatarSeed={avatar.organizationAvatarSeed}
          initialsColorSeed={avatar.initialsColorSeed}
          tripAllocation={tripAllocationForLoad(load.id)}
          onPress={() => onIndentPress(load)}
          dense={layout.dense}
          fillGrid={layout.fillGrid}
          actions={
            layout.withActions ? (
              <LoadCenterIndentCardFooter dense={layout.dense}>
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
                  awardedAmount={awardedAmount}
                  onShareToNetwork={onShareToNetwork}
                  onIndentPress={onIndentPress}
                  onShareIndent={handleShareIndent}
                  onBroadcastDraft={handleBroadcastDraft}
                  onOpenAwardModal={awardModal.open}
                  dense={layout.dense}
                />
              </LoadCenterIndentCardFooter>
            ) : undefined
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
      statusFilterTab,
      tripAllocationForLoad,
    ],
  );

  const renderGiveLoadMobileCard = useCallback(
    (load: IndentRow) =>
      renderGiveLoadHubCard(load, { withActions: false }),
    [renderGiveLoadHubCard],
  );

  const renderGiveLoadGridCard = useCallback(
    (load: IndentRow) =>
      renderGiveLoadHubCard(load, {
        dense: true,
        fillGrid: true,
        withActions: true,
      }),
    [renderGiveLoadHubCard],
  );

  const renderGiveLoadListCard = useCallback(
    (load: IndentRow) =>
      renderGiveLoadHubCard(load, {
        dense: compactIndentFooter,
        withActions: true,
      }),
    [compactIndentFooter, renderGiveLoadHubCard],
  );

  const renderGetLoadHubCard = useCallback(
    (
      load: IndentRow,
      layout: {
        dense?: boolean;
        fillGrid?: boolean;
        withActions: boolean;
      },
    ) => {
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
      const clientLabel = resolveMarketIndentShipperLabel(load);
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
      const ticketCommerce = resolveGetLoadTicketCommerce(
        statusFilterTab,
        doneSubTab,
        load,
        existingQuote,
        indentIdsWithTrip,
      );
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
          ticketCommerce={ticketCommerce}
          avatarUrl={avatar.avatarUrl}
          avatarSeed={avatar.avatarSeed}
          organizationImageUrl={avatar.organizationImageUrl}
          organizationAvatarSeed={avatar.organizationAvatarSeed}
          initialsColorSeed={avatar.initialsColorSeed}
          tripAllocation={tripAllocationForLoad(load.id)}
          onPress={() => onIndentPress(load)}
          dense={layout.dense}
          fillGrid={layout.fillGrid}
          actions={
            layout.withActions ? (
              <LoadCenterIndentCardFooter dense={layout.dense}>
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
                  dense={layout.dense}
                />
              </LoadCenterIndentCardFooter>
            ) : undefined
          }
        />
      );
    },
    [
      creatorOrgProfileMap,
      doneSubTab,
      handleShareIndent,
      indentIdsWithTrip,
      myQuoteByIndentId,
      onIndentPress,
      setLoadSubTab,
      statusFilterTab,
      tripAllocationForLoad,
    ],
  );

  const renderGetLoadMobileCard = useCallback(
    (load: IndentRow) => renderGetLoadHubCard(load, { withActions: false }),
    [renderGetLoadHubCard],
  );

  const renderGetLoadGridCard = useCallback(
    (load: IndentRow) =>
      renderGetLoadHubCard(load, {
        dense: true,
        fillGrid: true,
        withActions: true,
      }),
    [renderGetLoadHubCard],
  );

  const renderGetLoadListCard = useCallback(
    (load: IndentRow) =>
      renderGetLoadHubCard(load, {
        dense: compactIndentFooter,
        withActions: true,
      }),
    [compactIndentFooter, renderGetLoadHubCard],
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
      const clientLabel = resolveMarketIndentShipperLabel(load);

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
          tripAllocation={tripAllocationForLoad(load.id)}
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
                onAssignDeploy={openIndentAllocation}
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
      openIndentAllocation,
      myQuotes,
      onIndentPress,
      tripAllocationForLoad,
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
            {getTripOperationalDisplay({
              trip_number: load["trip_number"] ?? null,
            }) !== "—"
              ? ` · ${getTripOperationalDisplay({ trip_number: load["trip_number"] ?? null })}`
              : ""}
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
                  onPress={() => openIndentAllocation(load)}
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
    <HubScreenShell
      footer={
        !isMobileView && useGridLayout
          ? (() => {
              const activePagination =
                loadSubTab === "GIVE_LOAD"
                  ? giveLoadGridPagination
                  : loadSubTab === "GET_LOAD"
                    ? findWorkGridPagination
                    : loadSubTab === "AWARDED"
                      ? claimedGridPagination
                      : null;
              if (!activePagination || activePagination.totalItems <= 0) {
                return null;
              }
              return (
                <HubScreenBottomBar>
                  <HubListPaginationBar
                    embedded
                    page={activePagination.page}
                    totalPages={activePagination.totalPages}
                    totalItems={activePagination.totalItems}
                    pageSize={activePagination.pageSize}
                    onPageSizeChange={activePagination.setPageSize}
                    itemLabel="loads"
                    onPrev={() =>
                      activePagination.setPage((p) => Math.max(0, p - 1))
                    }
                    onNext={() =>
                      activePagination.setPage((p) =>
                        Math.min(activePagination.totalPages - 1, p + 1),
                      )
                    }
                  />
                </HubScreenBottomBar>
              );
            })()
          : null
      }
    >
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
          showDoneSubTabs={statusFilterTab === "DONE" && !isClaimedTab}
          doneSubTabs={mobileDoneSubTabs}
          activeDoneSubTab={doneSubTab}
          onDoneSubTabChange={(id) => setDoneSubTab(id as DoneSubTab)}
          onCreateIndentPress={onCreateIndentPress}
        />
      ) : null}

      {isMobileView &&
      (loadSubTab === "GIVE_LOAD" || loadSubTab === "GET_LOAD") ? (
        <View style={styles.mobileNetworkToolbarRow}>
          <LoadCenterIntegratedPartiesRow
            mode={loadSubTab === "GIVE_LOAD" ? "supplier" : "client"}
            parties={
              loadSubTab === "GIVE_LOAD"
                ? integratedSuppliers
                : integratedClients
            }
            onAddToNetwork={openNetworkForParties}
            onPartyPress={openIntegratedParty}
          />
        </View>
      ) : null}

      {/* Content area — gray hub canvas (matches Trips page) */}
      <View
        style={[
          styles.loadContentWrap,
          isClaimedTab && styles.loadContentWrapClaimed,
          isMobileView && styles.loadContentWrapMobileHub,
          integratedLoadsCanvas && styles.loadCanvasIntegratedEmpty,
        ]}
      >
        <ScrollView
          style={[
            styles.scroll,
            integratedLoadsCanvas && styles.loadCanvasIntegratedEmpty,
          ]}
          contentContainerStyle={[
            styles.scrollContent,
            isClaimedTab && styles.scrollContentClaimed,
            isMobileView && styles.scrollContentMobileHub,
            integratedLoadsCanvas && styles.scrollContentIntegratedEmpty,
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
          {!isMobileView ? renderDesktopFilterPanel() : null}
          {loadSubTab === "GIVE_LOAD" && (
            <>
              {isLoading ? (
                <View style={styles.loadingWrap}>
                  <ActivityIndicator size="small" color={Theme.primary} />
                  <Text style={styles.loadingText}>Loading…</Text>
                </View>
              ) : filteredHirePartnerLoads.length === 0 ? (
                renderLoadCenterEmptyPromo()
              ) : useGridLayout ? (
                <View style={styles.gridList}>
                  <View style={styles.loadSectionHeaderBlock}>
                    <View style={styles.loadSectionRow}>
                      <Text style={styles.loadSectionTitle}>
                        Your active indents
                      </Text>
                      <View style={styles.loadSectionRowActions}>
                        <View style={styles.loadSectionPill}>
                          <Text style={styles.loadSectionPillText}>Live</Text>
                        </View>
                      </View>
                    </View>
                    {onShareToNetwork ? (
                      <Text style={styles.loadSectionSub}>
                        Indents not yet awarded: use Pulse to broadcast a 24h
                        story to your network.
                      </Text>
                    ) : null}
                  </View>
                  {giveLoadGridPagination.paginatedItems.map((load) => (
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
                      ))}
                </View>
              ) : (
                <LoadCenterHubMobileListCanvas>
                  {!isMobileView ? (
                    <View style={styles.loadSectionHeaderBlock}>
                      <View style={styles.loadSectionRow}>
                        <Text style={styles.loadSectionTitle}>
                          Your active indents
                        </Text>
                        <View style={styles.loadSectionRowActions}>
                          <View style={styles.loadSectionPill}>
                            <Text style={styles.loadSectionPillText}>Live</Text>
                          </View>
                        </View>
                      </View>
                      {onShareToNetwork ? (
                        <Text style={styles.loadSectionSub}>
                          Indents not yet awarded: use Pulse to broadcast a 24h
                          story to your network.
                        </Text>
                      ) : null}
                    </View>
                  ) : null}
                  {filteredHirePartnerLoads.map((load) => (
                    <View
                      key={load.id}
                      style={
                        highlightedIndentId === load.id
                          ? styles.highlightedIndentCard
                          : undefined
                      }
                    >
                      {isMobileView
                        ? renderGiveLoadMobileCard(load)
                        : renderGiveLoadListCard(load)}
                    </View>
                  ))}
                </LoadCenterHubMobileListCanvas>
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
              renderLoadCenterEmptyPromo()
            ) : useGridLayout ? (
              <View style={styles.gridList}>
                <View style={styles.loadSectionRow}>
                  <Text style={styles.loadSectionTitle}>
                    Market opportunities
                  </Text>
                  <View style={styles.loadSectionPill}>
                    <Text style={styles.loadSectionPillText}>Live</Text>
                  </View>
                </View>
                {findWorkGridPagination.paginatedItems.map((load) => (
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
                ))}
              </View>
            ) : (
              <LoadCenterHubMobileListCanvas>
                {!isMobileView ? (
                  <View style={styles.loadSectionRow}>
                    <Text style={styles.loadSectionTitle}>
                      Market opportunities
                    </Text>
                    <View style={styles.loadSectionPill}>
                      <Text style={styles.loadSectionPillText}>Live</Text>
                    </View>
                  </View>
                ) : null}
                {filteredFindWorkList.map((load) => (
                  <View
                    key={load.id}
                    style={
                      highlightedIndentId === load.id
                        ? styles.highlightedIndentCard
                        : undefined
                    }
                  >
                    {isMobileView
                      ? renderGetLoadMobileCard(load)
                      : renderGetLoadListCard(load)}
                  </View>
                ))}
              </LoadCenterHubMobileListCanvas>
            ))}

          {loadSubTab === "AWARDED" &&
            (displayedClaimedLoads.length === 0 ? (
              renderLoadCenterEmptyPromo()
            ) : useGridLayout ? (
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
                </View>
              </View>
            ) : (
              <LoadCenterHubMobileListCanvas>
                {!isMobileView ? (
                  <View style={[styles.securedSection, { marginBottom: 8 }]}>
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
                  </View>
                ) : null}
                {displayedClaimedLoads.map((load) => (
                  <View
                    key={load.id}
                    style={
                      highlightedIndentId === load.id
                        ? styles.highlightedIndentCard
                        : undefined
                    }
                  >
                    {renderClaimedMobileCard(
                      load,
                      statusFilterTab === "DONE",
                    )}
                  </View>
                ))}
              </LoadCenterHubMobileListCanvas>
            ))}
        </ScrollView>
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

    </View>
    </HubScreenShell>
  );
}

/** Load hub page canvas — aligned with Trips (`#eef2f6`). */
const LOAD_CONTENT_BG = LOADS_HUB_PAGE_BG;

const styles = StyleSheet.create({
  container: { flex: 1, minHeight: 0, backgroundColor: LOADS_HUB_PAGE_BG },
  containerMobileHub: {
    backgroundColor: LOADS_HUB_PAGE_BG,
  },
  loadsBodyFiltersBleed: {
    marginHorizontal: -Layout.screenPaddingHorizontal,
    marginBottom: 20,
    paddingTop: 4,
    paddingBottom: 4,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    backgroundColor: "transparent",
    ...Platform.select({
      web: { minWidth: 0 },
    }),
  },
  loadsInlineFilterPanelDesktop: {
    marginBottom: 0,
    backgroundColor: Theme.screenBackground,
    overflow: "visible",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  loadsInlineFilterPanelInner: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 14,
    paddingBottom: 14,
    gap: 12,
  },
  loadsFilterActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  mobileNetworkToolbarRow: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 8,
    paddingBottom: 10,
    backgroundColor: Theme.cardWhite,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  loadsSearchIcon: { marginRight: 8 },
  loadsStatusTabRow: {
    flexWrap: "wrap",
  },
  loadsTabDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Theme.borderLight,
    marginTop: 4,
    marginBottom: 2,
  },
  loadsCombinedTabRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    alignSelf: "stretch",
    justifyContent: "space-between",
    width: "100%",
    paddingTop: 2,
    paddingBottom: 4,
    flexWrap: "wrap",
  },
  loadsDoneTabGroup: {
    flexShrink: 0,
    marginLeft: "auto",
  },
  loadsStatusTabGroup: {
    flexShrink: 0,
    alignSelf: "flex-start",
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
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  loadTypeFilterChipActive: {
    backgroundColor: Theme.screenBackground,
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
    backgroundColor: LOADS_HUB_PAGE_BG,
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
  loadCanvasIntegratedEmpty: {
    backgroundColor: Theme.cardWhite,
  },
  scroll: { flex: 1, backgroundColor: LOADS_HUB_PAGE_BG },
  scrollContent: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 4,
    flexGrow: 1,
    backgroundColor: LOADS_HUB_PAGE_BG,
    ...Platform.select({
      web: { minWidth: 0, maxWidth: "100%" as const },
    }),
  },
  scrollContentMobileHub: {
    paddingHorizontal: 0,
    paddingTop: 8,
  },
  scrollContentIntegratedEmpty: {
    backgroundColor: Theme.cardWhite,
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
    fontSize: 10,
    fontWeight: "600",
    fontStyle: "normal",
    color: Theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.55,
    flex: 1,
    minWidth: 0,
  },
  loadSectionRowActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
  loadSectionPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: Theme.surfaceGray,
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
    backgroundColor: Theme.screenBackground,
  },
  loadCardQuoteHintText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textSecondary,
  },
  reviewHubHero: {
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
    backgroundColor: Theme.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
  },
  reviewHubModalHeaderSpacer: {
    width: 44,
    height: 44,
  },
  bidHubHero: {
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
    backgroundColor: "rgba(255,255,255,0.1)",
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
  },
  loadStatePillText: {
    fontSize: 7,
    fontWeight: "800",
    letterSpacing: 0.45,
    textTransform: "uppercase",
  },
  loadStatePillGetLoadDefault: {
    backgroundColor: Theme.positive,
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
    paddingVertical: 14,
    paddingHorizontal: 14,
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
    alignItems: "center",
    justifyContent: "center",
  },
  bidIconCircleActive: {
    backgroundColor: Theme.screenBackground,
  },
  bidIconCircleMuted: {
    backgroundColor: Theme.surfaceGray,
  },
  shareIndentIconBtn: {
    width: 44,
    height: 44,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  broadcastNetworkBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    backgroundColor: Theme.buttonPrimary,
    paddingHorizontal: 12,
    minHeight: 44,
    paddingVertical: 0,
    flexShrink: 0,
    shadowColor: Theme.brandBlueInk,
    shadowOpacity: 0.35,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  broadcastNetworkBtnText: {
    fontSize: 11,
    fontWeight: "900",
    color: Theme.buttonPrimaryText,
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
    backgroundColor: "#f8f9fa",
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
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },
  reviewBidsBtnText: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.buttonDarkText,
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
    backgroundColor: Theme.surfaceGray,
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
    backgroundColor: Theme.surface,
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
    padding: 12,
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
    minHeight: 32,
  },
  handshakeBtnText: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.buttonDarkText,
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
    backgroundColor: Theme.surfaceGray,
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textMuted,
    textAlign: "center",
  },
  loadCenterEmptyStage: {
    width: "100%",
    alignItems: "center",
    justifyContent: "flex-start",
    paddingVertical: 20,
    paddingHorizontal: 0,
    flexGrow: 0,
    flexShrink: 0,
    backgroundColor: "transparent",
  },
  loadCenterEmptyStageIntegrated: {
    alignItems: "stretch",
    justifyContent: "flex-start",
    paddingVertical: 0,
    backgroundColor: Theme.cardWhite,
  },
  getLoadEmptyWrap: {
    paddingTop: 20,
    paddingBottom: 40,
    alignItems: "center",
    gap: 16,
  },
  getLoadEmptyTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    marginTop: 4,
    textTransform: "uppercase",
    letterSpacing: 1.6,
  },
  getLoadEmptySub: {
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textSecondary,
    textAlign: "center",
    paddingHorizontal: Layout.screenPaddingHorizontal + 12,
    lineHeight: 18,
    maxWidth: 340,
  },
  emptyWrap: {
    paddingVertical: 64,
    alignItems: "center",
    backgroundColor: Theme.screenBackground,
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
  emptyAddLoadWrap: {
    marginTop: 20,
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
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 4,
  },
  successIconWrap: {
    width: 30,
    height: 30,
    backgroundColor: Theme.buttonPrimary,
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
    color: Theme.buttonDarkText,
  },
  handshakeAssignLaterOuter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#ffffff",
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
  },
  tripAssignBadgeUnassigned: {
    backgroundColor: Theme.surfaceLight,
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
    alignItems: "center",
    justifyContent: "center",
  },
  tripAssignIconInactive: {
    backgroundColor: "#f3f4f6",
  },
  tripAssignIconDriverActive: {
    backgroundColor: Theme.surfaceGray,
  },
  tripAssignIconVehicleActive: {
    backgroundColor: Theme.surfaceGray,
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
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  aggregatePartnerCardSelected: {
    backgroundColor: Theme.surfaceLight,
  },
  aggregatePartnerAvatar: {
    width: 34,
    height: 34,
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
    backgroundColor: Theme.screenBackground,
    paddingHorizontal: 10,
    paddingVertical: 10,
    minHeight: 56,
    marginBottom: 8,
    gap: 10,
  },
  assignEntityRowActive: {
    backgroundColor: Theme.surfaceLight,
  },
  assignEntityRowDisabled: {
    opacity: 0.6,
  },
  assignEntityIconWrap: {
    width: 34,
    height: 34,
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
    backgroundColor: Theme.buttonPrimary,
  },
  assignEmptyActionBtnText: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.buttonPrimaryText,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  assignSummaryBar: {
    backgroundColor: Theme.surfaceLight,
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
    paddingHorizontal: 6,
    paddingVertical: 3,
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
    padding: 16,
    marginBottom: 12,
  },
  wizardCardActive: {
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
  },
  otpBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.buttonDarkText,
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
    backgroundColor: Theme.buttonPrimary,
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
    backgroundColor: Theme.surface,
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
