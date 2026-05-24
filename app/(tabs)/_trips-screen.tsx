/**
 * Trips Control — demo2 trips tab. Active | History, trip cards, Add Trip.
 * Private Book = driver/vehicle assigned by you; Shared Ledger = assigned by another user.
 */
import { SceneLoadingSplash } from "@/components/chromeLoadingScreens";
import { HubListPaginationBar } from "@/components/hub/HubListPaginationBar";
import type { HubGridPageSize } from "@/components/hub/hubGridCardLayout";
import { HUB_GRID_DEFAULT_PAGE_SIZE } from "@/components/hub/hubGridCardLayout";
import { DateRangePickerModal } from "@/components/DateRangePickerModal";
import { FinanceFAB } from "@/components/FinanceFAB";
import {
  CHAT_FILTER_MUTED,
  chatFilterChromeStyles as chatChrome,
} from "@/constants/ChatFilterChrome";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { useAuth } from "@/contexts/AuthContext";
import { useTabBarAwareScrollProps } from "@/contexts/DemoTabBarScrollContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useOptionalOrganization } from "@/contexts/OrganizationContext";
import { TripsLedgerExportModalGate } from "@/features/trips/components/TripsLedgerExportModalGate";
import type { LedgerRow } from "@/features/finance/services/finance.service";
import {
    TripsHubBentoMetrics,
    TripsHubHistoryBentoMetrics,
    type HistoryTripMetricId,
} from "@/features/trips/components/TripsHubBentoMetrics";
import { TripsFilterBottomSheet } from "@/features/trips/components/TripsFilterBottomSheet";
import {
  linkedOrgAvatarFields,
    summarizeTripLedgerForHub,
  tripFinanceAdjForHubLookup,
  tripHubCost,
  tripHubRevenue,
    TripsHubMobileTripListCanvas,
    TripsHubTableView,
    TripsHubTripCard,
} from "@/features/trips/components/TripsHubViews";
import type { TripAdjustment } from "@/features/trips/services/tripAdjustments";
import type { TripRow } from "@/features/trips/services/trips.service";
import {
  classifyTripMetric,
  countTripsByMetric,
  isTripCancelledForHub,
  TRIP_METRIC_ORDER,
  type TripMetricId,
} from "@/features/trips/utils/tripHubMetrics";
import type { TripHubPartyMeta } from "@/features/trips/utils/tripHubPartyMeta";
import { buildTripHubPartyMetaByTripId } from "@/features/trips/utils/tripHubPartyMeta";
import { tripNonSupplierOutflowTotal } from "@/features/trips/utils/tripManifestFreightCost";
import { canAccessTrips, getCapabilitiesFromProfile } from "@/lib/capabilities";
import {
  compareTripsByScheduleAsc,
  compareTripsByScheduleDesc,
  tripDayMatchesHubDateFilter,
  type TripHubDateFilter,
} from "@/lib/dateRangePresets";
import { shouldShowAggregateTripKindPill } from "@/lib/driverUtils";
import { formatLedgerDate } from "@/lib/format";
import { useClientsQuery } from "@/lib/queries/useClientsQuery";
import { useDriversQuery } from "@/lib/queries/useDriversQuery";
import { useTripSubcontractsQuery } from "@/lib/queries/useFinanceEntityQueries";
import {
    useRealtimeTransactionsInvalidation,
    useRealtimeTripsInvalidation,
} from "@/lib/queries/useRealtimeInvalidation";
import { useSuppliersQuery } from "@/lib/queries/useSuppliersQuery";
import { useTransactionsQuery } from "@/lib/queries/useTransactionsQuery";
import { useTripFinanceAdjustmentsMap } from "@/lib/queries/useTripFinanceAdjustmentsQuery";
import {
  useAssignmentAuditQuery,
  useShipperDisplayNamesQuery,
  useTripsQuery,
} from "@/lib/queries/useTripsQuery";
import { queryKeys } from "@/lib/queryKeys";
import { supabase } from "@/lib/supabase";
import { useLinkedOrgProfileMap } from "@/lib/useLinkedOrgProfileMap";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    NativeScrollEvent,
    NativeSyntheticEvent,
    Platform,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    useWindowDimensions,
    View,
    type TextStyle,
    type ViewStyle,
} from "react-native";
import { useLayoutInsets } from "@/lib/layoutInsets";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type SupplyFilter = "all" | "asset" | "aggregated";
type SortBy =
  | "date_desc"
  | "date_asc"
  | "revenue_desc"
  | "revenue_asc"
  | "client_asc"
  | "client_desc";
type PaymentFilter = "all" | "pending" | "partial" | "paid";
type DateFilter = TripHubDateFilter;
type ToolbarDateFilter = Exclude<DateFilter, "tomorrow">;

type TripsListLayout = "cards" | "table";
type ActiveMetricTabId = TripMetricId | "all";
/** Mobile hub list — light page; white ticket cards only (no list shell). */
const TRIPS_PAGE_BG = "#eef2f6";
const TRIPS_LIST_LAYOUT_KEY = "@q-mobile/trips-list-layout";
/** Mobile hub accent — matches filter sheet / Pulse indigo. */
const TRIPS_HUB_ACCENT = Theme.pulseIndigo;

function TripsMmtUnderlineTab({
  label,
  isActive,
  onPress,
  accessibilityLabel,
  compact,
}: {
  label: string;
  isActive: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
  /** Metric / secondary row — smaller type and tighter padding. */
  compact?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.mmtTabItem, compact && styles.mmtTabItemCompact]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="tab"
      accessibilityState={{ selected: isActive }}
      accessibilityLabel={accessibilityLabel ?? label}
    >
      <Text
        style={[
          styles.mmtTabLabel,
          compact && styles.mmtTabLabelCompact,
          isActive && styles.mmtTabLabelActive,
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
      {isActive ? (
        <View
          style={[styles.mmtTabUnderline, compact && styles.mmtTabUnderlineCompact]}
        />
      ) : null}
    </TouchableOpacity>
  );
}

/** Aligns list + Intake / In motion hub counts with All / Asset / Aggregate (same pill logic as hub cards). */
function tripMatchesSupplyFilter(
  trip: TripRow,
  supplyFilter: SupplyFilter,
  partyMeta: Pick<
    TripHubPartyMeta,
    "supplierLinkedOrgId" | "driverTrackingOnly"
  > | undefined,
  viewerOrganizationId: string | null | undefined,
): boolean {
  if (supplyFilter === "all") return true;
  const showAggregatePill = shouldShowAggregateTripKindPill(trip, {
    viewerOrganizationId,
    supplierLinkedOrganizationId: partyMeta?.supplierLinkedOrgId ?? null,
    driverTrackingOnly: partyMeta?.driverTrackingOnly,
  });
  if (supplyFilter === "aggregated") return showAggregatePill;
  return !showAggregatePill;
}

function supplierNameFallbackMapsEqual(
  a: Record<string, string>,
  b: Record<string, string>,
): boolean {
  const keysA = Object.keys(a);
  if (keysA.length !== Object.keys(b).length) return false;
  for (const k of keysA) {
    if (a[k] !== b[k]) return false;
  }
  return true;
}

function historyTripDueState(
  trip: TripRow,
  ledgerRows: LedgerRow[],
  currentOrganizationId: string | null | undefined,
  adjustments?: TripAdjustment[] | null,
  subcontractRate?: number | null,
): { receivableDue: number; payableDue: number } {
  const ledger = summarizeTripLedgerForHub(ledgerRows);
  const receivableTarget = Math.max(
    tripHubRevenue(trip, currentOrganizationId, adjustments),
    0,
  );
  const payableTarget = Math.max(
    tripHubCost(trip, currentOrganizationId, adjustments, {
      subcontractRate: subcontractRate ?? null,
      nonSupplierExpenseTotal: tripNonSupplierOutflowTotal(ledgerRows),
    }),
    0,
  );
  return {
    receivableDue: Math.max(
      receivableTarget - Math.max(ledger.receivedTotal, 0),
      0,
    ),
    payableDue: Math.max(payableTarget - Math.max(ledger.paidTotal, 0), 0),
  };
}

export default function TripsScreen() {
  const { width } = useWindowDimensions();
  /** Desktop card grid — hub ticket cards (4 per row), aligned with Load Center. */
  const isLargeScreen = Platform.OS === "web" && width >= 1024;
  const isCompactWeb = Platform.OS === "web" && width < 1180;
  const isMobile = width < 560;
  // Use mobile layout behavior for narrow web widths as well.
  const isMobileViewport = width < 820;
  const insets = useSafeAreaInsets();
  const layout = useLayoutInsets();
  const tripsFabBottom = layout.fabBottom({ stackOffset: Layout.fabStackOffset });
  const tabBarScrollProps = useTabBarAwareScrollProps();
  const screenTopPad =
    Platform.OS === "web" ? 0 : insets.top + Layout.headerPaddingBelowInset;
  const tripsScrollBottomPad = layout.scrollBottomPadding(40);
  const router = useRouter();
  const { t: tr } = useLanguage();
  const orgCtx = useOptionalOrganization();
  const { profile } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const lastFocusRefreshRef = useRef<number>(0);
  const [tripFilter, setTripFilter] = useState<"Active" | "History">("Active");
  const [searchQuery] = useState("");
  const queryClient = useQueryClient();
  const [activeMetricTab, setActiveMetricTab] =
    useState<ActiveMetricTabId>("assigned");
  const [supplyFilter, setSupplyFilter] = useState<SupplyFilter>("all");
  const [sortBy, setSortBy] = useState<SortBy>("date_desc");
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>("all");
  const [loadTypeFilter, setLoadTypeFilter] = useState<string>("all");
  const [dateRangeFilter, setDateRangeFilter] = useState<DateFilter>("all");
  const [customDateFrom, setCustomDateFrom] = useState<string | null>(null);
  const [customDateTo, setCustomDateTo] = useState<string | null>(null);
  const [tripLedgerExportOpen, setTripLedgerExportOpen] = useState(false);
  const [activeHistoryMetricTab, setActiveHistoryMetricTab] =
    useState<HistoryTripMetricId | null>(null);
  const [showDateRangePicker, setShowDateRangePicker] = useState(false);
  const [showSortModal, setShowSortModal] = useState(false);
  const toolbarDateRangeFilter: ToolbarDateFilter =
    dateRangeFilter === "tomorrow" ? "all" : dateRangeFilter;
  /** Default to cards for all users; table remains an explicit user toggle. */
  const [listLayout, setListLayout] = useState<TripsListLayout>("cards");
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(TRIPS_LIST_LAYOUT_KEY);
        if (!isMounted) return;
        if (saved === "cards" || saved === "table") {
          setListLayout(saved);
        }
      } catch {
        // Ignore storage read errors and keep default cards layout.
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);
  const setListLayoutWithPersistence = useCallback((next: TripsListLayout) => {
    setListLayout(next);
    AsyncStorage.setItem(TRIPS_LIST_LAYOUT_KEY, next).catch(() => {
      // Ignore storage write errors; UI state remains responsive.
    });
  }, []);
  useEffect(() => {
    if (isMobileViewport) setListLayout("cards");
  }, [isMobileViewport]);
  /** Mobile: table is hidden; always use card list + hub toolbar. */
  const effectiveListLayout: TripsListLayout = isMobileViewport
    ? "cards"
    : listLayout;

  const capabilities = getCapabilitiesFromProfile(
    profile
      ? {
          role: profile.role,
          aggregated: profile.aggregated,
          asset: profile.asset,
        }
      : null,
  );
  const canAccess = canAccessTrips(capabilities);
  const currentOrganization = orgCtx?.currentOrganization ?? null;
  const orgBootPending = !orgCtx || orgCtx.isLoading;
  const orgId = canAccess ? (currentOrganization?.id ?? null) : null;

  const {
    data: tripsData = [],
    isPending: tripsLoading,
    refetch: refetchTrips,
  } = useTripsQuery(orgId);
  const trips = tripsData as TripRow[];
  const { data: shipperNameByTripId = {} } = useShipperDisplayNamesQuery(orgId);
  const { data: transactions = [], refetch: refetchTransactions } =
    useTransactionsQuery(orgId);
  const { data: clients = [] } = useClientsQuery(orgId);
  const { data: suppliers = [] } = useSuppliersQuery(orgId);
  const { data: drivers = [] } = useDriversQuery(orgId);
  const linkedOrgByOrganizationId = useLinkedOrgProfileMap(clients, suppliers);
  const tripIds = useMemo(() => trips.map((t) => t.id), [trips]);
  const { data: hubTripSubcontracts = [] } = useTripSubcontractsQuery(
    orgId,
    tripIds,
  );
  const hubSubcontractRateByTripId = useMemo(() => {
    const m = new Map<string, number | null>();
    for (const row of hubTripSubcontracts) {
      const tid = String(row.trip_id ?? "").trim();
      if (!tid) continue;
      m.set(tid, Number(row.rate ?? 0));
    }
    return m;
  }, [hubTripSubcontracts]);
  const { record: tripFinanceAdjRecord, isLoading: tripFinanceAdjLoading } =
    useTripFinanceAdjustmentsMap(orgId, tripIds);
  /** Until loaded, hub uses raw trip rates (same as trip list before this feature). */
  const tripFinanceAdjForHub = tripFinanceAdjLoading
    ? undefined
    : tripFinanceAdjRecord;
  const { refetch: refetchAssignment } = useAssignmentAuditQuery(tripIds);

  useRealtimeTripsInvalidation(orgId);
  useRealtimeTransactionsInvalidation(orgId);

  const onRefresh = useCallback(async () => {
    if (!orgId) {
      setRefreshing(false);
      return;
    }
    setRefreshing(true);
    const REFRESH_TIMEOUT_MS = 20_000;
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("refresh timeout")), REFRESH_TIMEOUT_MS),
    );
    try {
      await Promise.race([
        Promise.all([
          refetchTrips(),
          refetchTransactions(),
          refetchAssignment(),
          queryClient.invalidateQueries({
            queryKey: ["q", "trips", "doc-trip-ids", orgId],
          }),
          queryClient.invalidateQueries({
            queryKey: [...queryKeys.tripFinanceAdjustmentsRoot],
          }),
        ]),
        timeoutPromise,
      ]);
    } catch {
      // timeout or network error — silently complete; stale data remains visible
    } finally {
      setRefreshing(false);
    }
  }, [
    refetchTrips,
    refetchTransactions,
    refetchAssignment,
    queryClient,
    orgId,
  ]);

  useFocusEffect(
    useCallback(() => {
      setTripFilter("Active");
      setActiveMetricTab("assigned");
      setActiveHistoryMetricTab(null);
      // Only force-refetch if stale (>5 min). Realtime subscriptions handle live updates;
      // pull-to-refresh handles explicit reloads.
      if (Date.now() - lastFocusRefreshRef.current > 5 * 60_000) {
        lastFocusRefreshRef.current = Date.now();
        onRefresh();
      }
    }, [onRefresh]),
  );

  const loading = tripsLoading;

  const isCompletedStatus = (s: string) => {
    const v = (s || "").toLowerCase();
    return v === "completed" || v === "delivered" || v === "done";
  };

  /** Display date for card: pickup > started > created. */
  const getTripCardDate = (t: TripRow) => {
    const raw =
      t.pickup_date ?? t.started_at ?? t.completed_at ?? t.created_at ?? "";
    return raw ? formatLedgerDate(raw) : "—";
  };

  const getStageLabelForTrip = useCallback(
    (t: TripRow) =>
      t.driver_id == null
        ? tr("unassigned").toUpperCase()
        : (t.status || "ACTIVE").toUpperCase(),
    [tr],
  );

  /** Show completed/done trips only on the History tab. */
  const showCompletedList = tripFilter === "History";

  const tripsByStatus = useMemo(
    () =>
      showCompletedList
        ? // History tab: show completed trips only.
          trips.filter((t) => isCompletedStatus(t.status))
        : trips.filter(
            (t) =>
              !isCompletedStatus(t.status) && !isTripCancelledForHub(t.status),
          ),
    [showCompletedList, trips],
  );

  /** Pill context only (linked org + tracking_only); independent of async supplier name fallback. */
  const tripKindPillMetaByTripId = useMemo(
    () =>
      buildTripHubPartyMetaByTripId(
        trips,
        clients,
        suppliers,
        drivers,
        transactions,
        {},
      ),
    [trips, clients, suppliers, drivers, transactions],
  );

  /** Active ops trips only — used to resolve which trips have any uploaded document (POD split). */
  const activeOpsTripIdsSorted = useMemo(() => {
    if (showCompletedList) return "";
    const ids = tripsByStatus.map((t) => t.id).sort();
    return ids.join(",");
  }, [showCompletedList, tripsByStatus]);

  /** Persisted React Query cache is JSON — `Set` breaks after hydrate (`.has` missing). Store IDs as array, derive Set in memo. */
  const { data: tripIdsWithDocumentsRaw } = useQuery({
    queryKey: [
      "q",
      "trips",
      "doc-trip-ids",
      "v2",
      orgId ?? "",
      activeOpsTripIdsSorted,
    ],
    enabled: !!orgId && activeOpsTripIdsSorted.length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<string[]> => {
      const ids = activeOpsTripIdsSorted.split(",").filter(Boolean);
      if (ids.length === 0) return [];
      const { data, error } = await supabase()
        .from("trip_documents")
        .select("trip_id")
        .in("trip_id", ids);
      if (error) throw error;
      return (data ?? []).map((r) => (r as { trip_id: string }).trip_id);
    },
  });
  const tripIdsWithDocuments = useMemo(() => {
    if (tripIdsWithDocumentsRaw instanceof Set) {
      return tripIdsWithDocumentsRaw;
    }
    if (Array.isArray(tripIdsWithDocumentsRaw)) {
      return new Set(
        tripIdsWithDocumentsRaw
          .filter((value): value is string => typeof value === "string")
          .map((value) => value.trim())
          .filter(Boolean),
      );
    }
    return new Set<string>();
  }, [tripIdsWithDocumentsRaw]);

  const tripsForHubMetricCounts = useMemo(() => {
    let list = tripsByStatus.filter((t) =>
      tripMatchesSupplyFilter(
        t,
        supplyFilter,
        tripKindPillMetaByTripId.get(t.id),
        currentOrganization?.id,
      ),
    );
    if (dateRangeFilter !== "all") {
      list = list.filter((t) =>
        tripDayMatchesHubDateFilter(t, dateRangeFilter, {
          customFrom: customDateFrom,
          customTo: customDateTo,
        }),
      );
    }
    return list;
  }, [
    tripsByStatus,
    supplyFilter,
    tripKindPillMetaByTripId,
    currentOrganization?.id,
    dateRangeFilter,
    customDateFrom,
    customDateTo,
  ]);

  const metricCounts = useMemo(() => {
    const counts = countTripsByMetric(
      tripsForHubMetricCounts,
      tripIdsWithDocuments,
    );
    if (!showCompletedList) {
      const completedTripsCount = trips.filter(
        (t) =>
          isCompletedStatus(t.status) &&
          tripMatchesSupplyFilter(
            t,
            supplyFilter,
            tripKindPillMetaByTripId.get(t.id),
            currentOrganization?.id,
          ),
      ).length;
      counts.delivered_docs_pending += completedTripsCount;
    }
    return counts;
  }, [
    tripsForHubMetricCounts,
    tripIdsWithDocuments,
    showCompletedList,
    trips,
    supplyFilter,
    tripKindPillMetaByTripId,
    currentOrganization?.id,
  ]);

  const transactionsByTripId = useMemo(() => {
    const map = new Map<string, LedgerRow[]>();
    for (const tx of transactions) {
      if (!tx.trip_id) continue;
      const list = map.get(tx.trip_id);
      if (list) list.push(tx);
      else map.set(tx.trip_id, [tx]);
    }
    return map;
  }, [transactions]);

  // Apply trip-type and text filters for both tabs. Metric buckets are applied in a second pass.
  const baseFilteredTrips = useMemo(() => {
    let list = tripsByStatus;
    if (!showCompletedList) {
      if (activeMetricTab === "all") {
        // Keep all active trips visible across Intake + In motion.
        list = tripsByStatus;
      } else if (activeMetricTab === "delivered_docs_pending") {
        const deliveredDocsPendingTrips = tripsByStatus.filter(
          (t) => classifyTripMetric(t, tripIdsWithDocuments) === activeMetricTab,
        );
        const completedTrips = trips.filter((t) => isCompletedStatus(t.status));
        const seen = new Set(deliveredDocsPendingTrips.map((t) => t.id));
        list = deliveredDocsPendingTrips.concat(
          completedTrips.filter((t) => !seen.has(t.id)),
        );
      } else {
      list = list.filter(
        (t) => classifyTripMetric(t, tripIdsWithDocuments) === activeMetricTab,
      );
      }
    }
    if (supplyFilter !== "all") {
      list = list.filter((t) =>
        tripMatchesSupplyFilter(
          t,
          supplyFilter,
          tripKindPillMetaByTripId.get(t.id),
          currentOrganization?.id,
        ),
      );
    }

    if (paymentFilter !== "all") {
      list = list.filter((t) => {
        const status = (t.payment_status || "pending").toLowerCase();
        if (paymentFilter === "paid")
          return status === "paid" || status === "fully_paid";
        return status === paymentFilter;
      });
    }

    if (loadTypeFilter !== "all") {
      list = list.filter(
        (t) =>
          (t.load_type || "").toLowerCase() === loadTypeFilter.toLowerCase(),
      );
    }

    if (dateRangeFilter !== "all") {
      list = list.filter((t) =>
        tripDayMatchesHubDateFilter(t, dateRangeFilter, {
          customFrom: customDateFrom,
          customTo: customDateTo,
        }),
      );
    }

    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((t) => {
        const displayName = (
          shipperNameByTripId[t.id] ??
          t.client_name ??
          ""
        ).toLowerCase();
        const pickup = (t.pickup_area ?? "").toLowerCase();
        const drop = (t.drop_location ?? "").toLowerCase();
        const tripRef = `${t.trip_number ?? ""} ${t.display_trip_id ?? ""}`
          .trim()
          .toLowerCase();
        return (
          displayName.includes(q) ||
          pickup.includes(q) ||
          drop.includes(q) ||
          tripRef.includes(q)
        );
      });
    }

    let sorted = [...list];
    sorted.sort((a, b) => {
      switch (sortBy) {
        case "date_desc":
          return compareTripsByScheduleDesc(a, b);
        case "date_asc":
          return compareTripsByScheduleAsc(a, b);
        case "revenue_desc":
        case "revenue_asc": {
          const orgSort = currentOrganization?.id ?? null;
          const adjA = tripFinanceAdjForHubLookup(tripFinanceAdjForHub, a.id);
          const adjB = tripFinanceAdjForHubLookup(tripFinanceAdjForHub, b.id);
          const va = tripHubRevenue(a, orgSort, adjA);
          const vb = tripHubRevenue(b, orgSort, adjB);
          return sortBy === "revenue_desc" ? vb - va : va - vb;
        }
        case "client_asc":
          return (a.client_name || "").localeCompare(b.client_name || "");
        case "client_desc":
          return (b.client_name || "").localeCompare(a.client_name || "");
        default:
          return 0;
      }
    });

    return sorted;
  }, [
    tripsByStatus,
    trips,
    activeMetricTab,
    tripIdsWithDocuments,
    supplyFilter,
    tripKindPillMetaByTripId,
    searchQuery,
    shipperNameByTripId,
    showCompletedList,
    sortBy,
    paymentFilter,
    loadTypeFilter,
    dateRangeFilter,
    customDateFrom,
    customDateTo,
    currentOrganization?.id,
    tripFinanceAdjForHub,
  ]);

  const filtered = useMemo(() => {
    if (!showCompletedList || activeHistoryMetricTab == null) {
      return baseFilteredTrips;
    }
    return baseFilteredTrips.filter((trip) => {
      const adj = tripFinanceAdjForHubLookup(tripFinanceAdjForHub, trip.id);
      const { receivableDue, payableDue } = historyTripDueState(
        trip,
        transactionsByTripId.get(trip.id) ?? [],
        currentOrganization?.id ?? null,
        adj,
        hubSubcontractRateByTripId.get(trip.id) ?? null,
      );
      switch (activeHistoryMetricTab) {
        case "due_to_get":
          return receivableDue > 0;
        case "no_due_to_get":
          return receivableDue <= 0;
        case "due_to_pay":
          return payableDue > 0;
        case "no_due_to_pay":
          return payableDue <= 0;
        default:
          return true;
      }
    });
  }, [
    activeHistoryMetricTab,
    baseFilteredTrips,
    currentOrganization?.id,
    showCompletedList,
    transactionsByTripId,
    tripFinanceAdjForHub,
    hubSubcontractRateByTripId,
  ]);

  const tripsTableResetKey = useMemo(
    () =>
      [
        effectiveListLayout,
        filtered.length,
        searchQuery,
        tripFilter,
        activeMetricTab,
        activeHistoryMetricTab ?? "",
        activeOpsTripIdsSorted.slice(0, 120),
        supplyFilter,
        sortBy,
        paymentFilter,
        loadTypeFilter,
        dateRangeFilter,
        customDateFrom ?? "",
        customDateTo ?? "",
      ].join("|"),
    [
      effectiveListLayout,
      filtered.length,
      searchQuery,
      tripFilter,
      activeMetricTab,
      activeHistoryMetricTab,
      activeOpsTripIdsSorted,
      supplyFilter,
      sortBy,
      paymentFilter,
      loadTypeFilter,
      dateRangeFilter,
      customDateFrom,
      customDateTo,
    ],
  );

  const [tripsTablePageSize, setTripsTablePageSize] =
    useState<HubGridPageSize>(HUB_GRID_DEFAULT_PAGE_SIZE);
  const [tripsTablePage, setTripsTablePage] = useState(0);
  const [hubToolbarMatchCount, setHubToolbarMatchCount] = useState<
    number | null
  >(null);
  const [supplierNameFallbackById, setSupplierNameFallbackById] = useState<
    Record<string, string>
  >({});

  const tripsHubPaginationTotal =
    hubToolbarMatchCount ?? filtered.length;

  const tripsTableTotalPages = Math.max(
    1,
    Math.ceil(tripsHubPaginationTotal / tripsTablePageSize),
  );
  const tripsTablePageSafe = Math.min(tripsTablePage, tripsTableTotalPages - 1);

  useEffect(() => {
    setHubToolbarMatchCount(null);
  }, [tripsTableResetKey]);

  useEffect(() => {
    const total = hubToolbarMatchCount ?? filtered.length;
    const maxPage = Math.max(0, Math.ceil(total / tripsTablePageSize) - 1);
    setTripsTablePage((p) => Math.min(p, maxPage));
  }, [hubToolbarMatchCount, filtered.length, tripsTablePageSize]);

  useEffect(() => {
    setTripsTablePage(0);
  }, [tripsTableResetKey, tripsTablePageSize]);

  const handleTripsMainScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const p = tabBarScrollProps as {
        onScroll?: (ev?: NativeSyntheticEvent<NativeScrollEvent>) => void;
      };
      p.onScroll?.(e);
    },
    [tabBarScrollProps],
  );

  const loadTypeOptions = useMemo(() => {
    const types = new Set<string>();
    trips.forEach((t) => {
      if (t.load_type) types.add(t.load_type.trim());
    });
    return Array.from(types).sort();
  }, [trips]);

  /** Stable fingerprint of supplier ids needing name fallback — avoids effect churn when trip array identity changes without data changes */
  const supplierNameFallbackEffectKey = useMemo(() => {
    const knownSupplierIds = new Set(
      suppliers.map((s) => String(s.id).trim().toLowerCase()).filter(Boolean),
    );
    const missingSupplierIds = [
      ...new Set(
        trips
          .map((trip) => String(trip.supplier_id ?? "").trim().toLowerCase())
          .filter((id) => id.length > 0 && !knownSupplierIds.has(id)),
      ),
    ].sort();
    return missingSupplierIds.join("|");
  }, [trips, suppliers]);

  useEffect(() => {
    let cancelled = false;

    if (!supplierNameFallbackEffectKey) {
      setSupplierNameFallbackById((prev) =>
        Object.keys(prev).length === 0 ? prev : {},
      );
      return undefined;
    }

    const missingSupplierIds = supplierNameFallbackEffectKey.split("|").filter(
      Boolean,
    );

    void (async () => {
      const { data, error } = await supabase()
        .from("suppliers")
        .select("id, name, company_name, contact_person")
        .in("id", missingSupplierIds);
      if (cancelled) return;
      if (error) {
        setSupplierNameFallbackById((prev) =>
          Object.keys(prev).length === 0 ? prev : {},
        );
        return;
      }
      const next: Record<string, string> = {};
      for (const row of
        (data ?? []) as Array<{
          id: string;
          name?: string | null;
          company_name?: string | null;
          contact_person?: string | null;
        }>) {
        const key = String(row.id ?? "").trim().toLowerCase();
        if (!key) continue;
        const label =
          String(row.name ?? "").trim() ||
          String(row.company_name ?? "").trim() ||
          String(row.contact_person ?? "").trim();
        if (label) next[key] = label;
      }
      setSupplierNameFallbackById((prev) =>
        supplierNameFallbackMapsEqual(prev, next) ? prev : next,
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [supplierNameFallbackEffectKey]);

  const tripHubPartyMetaByTripId = useMemo(
    () =>
      buildTripHubPartyMetaByTripId(
        trips,
        clients,
        suppliers,
        drivers,
        transactions,
        supplierNameFallbackById,
      ),
    [trips, clients, suppliers, drivers, transactions, supplierNameFallbackById],
  );

  const tripLedgerExportReport = useMemo(() => {
    const columns: Array<{
      key: string;
      label: string;
      align?: "left" | "right" | "center";
    }> = [
      { key: "rowType", label: "Type", align: "center" },
      { key: "trip", label: "Trip" },
      { key: "date", label: "Date", align: "center" },
      { key: "status", label: "Status", align: "center" },
      { key: "route", label: "Route" },
      { key: "party", label: "Party" },
      { key: "supplier", label: "Supplier" },
      { key: "salesValue", label: "Sales Value", align: "right" },
      { key: "supplierCost", label: "Supplier Cost", align: "right" },
      { key: "received", label: "Received", align: "right" },
      { key: "paid", label: "Paid", align: "right" },
      { key: "pendingRecv", label: "Pending Recv", align: "right" },
      { key: "pendingPay", label: "Pending Pay", align: "right" },
      { key: "txnMode", label: "Txn Mode", align: "center" },
      { key: "reference", label: "Reference" },
      { key: "txnIn", label: "Txn In", align: "right" },
      { key: "txnOut", label: "Txn Out", align: "right" },
    ];
    const rows: Array<Record<string, string | number | null | undefined>> = [];
    const orgId = currentOrganization?.id ?? null;
    for (const trip of filtered) {
      const tripRef = (
        trip.display_trip_id ??
        trip.trip_number ??
        trip.id
      ).trim();
      const route = `${(trip.pickup_area ?? "—").trim()} → ${(trip.drop_location ?? "—").trim()}`;
      const stage = getStageLabelForTrip(trip);
      const tripDate = (() => {
        const raw =
          trip.pickup_date ??
          trip.started_at ??
          trip.completed_at ??
          trip.created_at ??
          "";
        return raw ? formatLedgerDate(raw) : "—";
      })();
      const clientName =
        (shipperNameByTripId[trip.id] ?? trip.client_name ?? "—").trim() || "—";
      const supplierName =
        (
          tripHubPartyMetaByTripId.get(trip.id)?.displaySupplierName ??
          trip.supplier_name ??
          "—"
        ).trim() || "—";
      const txns = [...(transactionsByTripId.get(trip.id) ?? [])].sort(
        (a, b) => {
          const da = String(a.transaction_date ?? a.created_at ?? "");
          const db = String(b.transaction_date ?? b.created_at ?? "");
          return db.localeCompare(da);
        },
      );
      const ledger = summarizeTripLedgerForHub(txns);
      const rowAdj = tripFinanceAdjForHubLookup(tripFinanceAdjForHub, trip.id);
      const salesValue = Math.max(tripHubRevenue(trip, orgId, rowAdj), 0);
      const supplierCost = Math.max(
        tripHubCost(trip, orgId, rowAdj, {
          subcontractRate: hubSubcontractRateByTripId.get(trip.id) ?? null,
          nonSupplierExpenseTotal: tripNonSupplierOutflowTotal(txns),
        }),
        0,
      );
      const received = Math.max(ledger.receivedTotal, 0);
      const paid = Math.max(ledger.paidTotal, 0);
      const pendingRecv = Math.max(salesValue - received, 0);
      const pendingPay = Math.max(supplierCost - paid, 0);
      rows.push({
        rowType: "TRIP",
        trip: tripRef,
        date: tripDate,
        status: stage,
        route,
        party: clientName,
        supplier: supplierName,
        salesValue,
        supplierCost,
        received,
        paid,
        pendingRecv,
        pendingPay,
        txnMode: "",
        reference: "",
        txnIn: "",
        txnOut: "",
      });
      for (const txn of txns) {
        rows.push({
          rowType: "TXN",
          trip: tripRef,
          date: formatLedgerDate(txn.transaction_date || txn.created_at || ""),
          status: (txn.reconciliation_status ?? "").toString().toUpperCase(),
          route: "",
          party:
            (txn.party_name ?? txn.driver_name ?? txn.contact_type ?? "—")
              .toString()
              .trim() || "—",
          supplier: "",
          salesValue: "",
          supplierCost: "",
          received: "",
          paid: "",
          pendingRecv: "",
          pendingPay: "",
          txnMode: (txn.payment_mode ?? "").toString().trim().toUpperCase(),
          reference: (txn.payment_reference ?? txn.trip_number ?? "")
            .toString()
            .trim(),
          txnIn: Number(txn.amount_in ?? 0),
          txnOut: Number(txn.amount_out ?? 0),
        });
      }
      rows.push({
        rowType: "BAL",
        trip: tripRef,
        date: "",
        status: "STATEMENT",
        route: "",
        party: "Trip Balance",
        supplier: "",
        salesValue,
        supplierCost,
        received,
        paid,
        pendingRecv,
        pendingPay,
        txnMode: "",
        reference: "",
        txnIn: "",
        txnOut: "",
      });
    }
    return { columns, rows };
  }, [
    currentOrganization?.id,
    filtered,
    getStageLabelForTrip,
    shipperNameByTripId,
    transactionsByTripId,
    tripHubPartyMetaByTripId,
    tripFinanceAdjForHub,
    hubSubcontractRateByTripId,
  ]);

  const historyMetricCards = useMemo(() => {
    const base: Record<
      HistoryTripMetricId,
      { count: number; amount: number; title: string; hint: string }
    > = {
      due_to_get: {
        count: 0,
        amount: 0,
        title: "Due to get",
        hint: "Receivable pending",
      },
      no_due_to_get: {
        count: 0,
        amount: 0,
        title: "No due to get",
        hint: "Receivable cleared",
      },
      due_to_pay: {
        count: 0,
        amount: 0,
        title: "Due to pay",
        hint: "Payable pending",
      },
      no_due_to_pay: {
        count: 0,
        amount: 0,
        title: "No due to pay",
        hint: "Payable cleared",
      },
    };

    if (!showCompletedList) return base;

    for (const trip of baseFilteredTrips) {
      const adj = tripFinanceAdjForHubLookup(tripFinanceAdjForHub, trip.id);
      const { receivableDue, payableDue } = historyTripDueState(
        trip,
        transactionsByTripId.get(trip.id) ?? [],
        currentOrganization?.id ?? null,
        adj,
        hubSubcontractRateByTripId.get(trip.id) ?? null,
      );

      if (receivableDue > 0) {
        base.due_to_get.count += 1;
        base.due_to_get.amount += receivableDue;
      } else {
        base.no_due_to_get.count += 1;
      }

      if (payableDue > 0) {
        base.due_to_pay.count += 1;
        base.due_to_pay.amount += payableDue;
      } else {
        base.no_due_to_pay.count += 1;
      }
    }

    return base;
  }, [
    baseFilteredTrips,
    currentOrganization?.id,
    showCompletedList,
    transactionsByTripId,
    tripFinanceAdjForHub,
    hubSubcontractRateByTripId,
  ]);

  const tripMainTabCounts = useMemo(() => {
    const matchesSupply = (t: TripRow) =>
      tripMatchesSupplyFilter(
        t,
        supplyFilter,
        tripKindPillMetaByTripId.get(t.id),
        currentOrganization?.id,
      );

    let active = 0;
    let history = 0;
    for (const t of trips) {
      if (!matchesSupply(t)) continue;
      if (isCompletedStatus(t.status)) {
        history += 1;
      } else if (!isTripCancelledForHub(t.status)) {
        active += 1;
      }
    }
    return { active, history };
  }, [
    trips,
    supplyFilter,
    tripKindPillMetaByTripId,
    currentOrganization?.id,
  ]);

  const formatMainTabLabel = useCallback(
    (label: string, count: number) => `${label} (${count})`,
    [],
  );

  const mainTabs = useMemo(
    () => [
      {
        id: "active" as const,
        label: tr("active"),
        count: tripMainTabCounts.active,
        isActive: tripFilter === "Active",
        onPress: () => {
          setTripFilter("Active");
          setActiveHistoryMetricTab(null);
        },
      },
      {
        id: "history" as const,
        label: tr("history"),
        count: tripMainTabCounts.history,
        isActive: tripFilter === "History",
        onPress: () => setTripFilter("History"),
      },
    ],
    [tr, tripFilter, tripMainTabCounts],
  );

  const subTabs = useMemo(
    () => [
      {
        id: "all" as const,
        label: tr("all"),
        isActive: supplyFilter === "all",
        onPress: () => setSupplyFilter("all"),
      },
      {
        id: "asset" as const,
        label: tr("tripAsset"),
        isActive: supplyFilter === "asset",
        onPress: () => setSupplyFilter("asset"),
      },
      {
        id: "aggregated" as const,
        label: tr("tripAggregate"),
        isActive: supplyFilter === "aggregated",
        onPress: () => setSupplyFilter("aggregated"),
      },
    ],
    [tr, supplyFilter],
  );

  const tripMetricCopy = useMemo(
    () =>
      ({
        all: {
          title: tr("all"),
          hint: tr("active"),
        },
        unassigned: {
          title: tr("tripMetricUnassigned"),
          hint: tr("tripMetricHintUnassigned"),
        },
        assigned: {
          title: tr("tripAssigned"),
          hint: tr("tripMetricHintAssigned"),
        },
        loading: {
          title: tr("tripMetricLoading"),
          hint: tr("tripMetricHintLoading"),
        },
        in_transit: {
          title: tr("tripMetricInTransit"),
          hint: tr("tripMetricHintInTransit"),
        },
        unloading: {
          title: tr("tripMetricUnloading"),
          hint: tr("tripMetricHintUnloading"),
        },
        delivered_docs_pending: {
          title: tr("tripMetricDeliveredDocsPending"),
          hint: tr("tripMetricHintDeliveredDocsPending"),
        },
      }) satisfies Record<ActiveMetricTabId, { title: string; hint: string }>,
    [tr],
  );
  const tripMetricVisual = useMemo(
    () =>
      ({
        all: {
          icon: "th-large",
          gradient: [Theme.financeHeroBg, Theme.financeCardSlateTo] as [
            string,
            string,
          ],
          accent: Theme.primary,
          micro: tr("active"),
        },
        unassigned: {
          icon: "user-times",
          gradient: [Theme.financeCardSlateFrom, "#1e293b"] as [string, string],
          accent: Theme.textSecondary,
          micro: tr("tripMetricHintUnassigned"),
        },
        assigned: {
          icon: "check-circle",
          gradient: [Theme.primary, Theme.financeCardBlueTo] as [
            string,
            string,
          ],
          accent: Theme.primaryLight,
          micro: tr("tripMetricHintAssigned"),
        },
        loading: {
          icon: "upload",
          gradient: [Theme.financeCardOrangeFrom, Theme.financeCardOrangeTo] as [
            string,
            string,
          ],
          accent: Theme.warning,
          micro: tr("tripMetricHintLoading"),
        },
        in_transit: {
          icon: "paper-plane",
          gradient: [Theme.financeCardBlueFrom, Theme.financeCardCashTo] as [
            string,
            string,
          ],
          accent: "#38bdf8",
          micro: tr("tripMetricHintInTransit"),
        },
        unloading: {
          icon: "map-marker",
          gradient: ["#5b21b6", "#312e81"] as [string, string],
          accent: "#a78bfa",
          micro: tr("tripMetricHintUnloading"),
        },
        delivered_docs_pending: {
          icon: "flag-checkered",
          gradient: [Theme.financeCardGreenFrom, Theme.financeCardGreenTo] as [
            string,
            string,
          ],
          accent: Theme.positive,
          micro: tr("tripMetricHintDeliveredDocsPending"),
        },
      }) satisfies Record<
        ActiveMetricTabId,
        {
          icon: React.ComponentProps<typeof FontAwesome>["name"];
          gradient: [string, string];
          accent: string;
          micro: string;
        }
      >,
    [tr],
  );

  const activeMetricIdsForRail = useMemo(
    () => ["all" as const, ...TRIP_METRIC_ORDER],
    [],
  );
  const activeAllCount = useMemo(
    () => tripsForHubMetricCounts.length,
    [tripsForHubMetricCounts],
  );

  const historyReceivableIds: HistoryTripMetricId[] = useMemo(
    () => ["due_to_get", "no_due_to_get"],
    [],
  );
  const historyPayableIds: HistoryTripMetricId[] = useMemo(
    () => ["due_to_pay", "no_due_to_pay"],
    [],
  );

  const clearTripFilters = useCallback(() => {
    setSortBy("date_desc");
    setSupplyFilter("all");
    setDateRangeFilter("all");
    setPaymentFilter("all");
    setLoadTypeFilter("all");
    setCustomDateFrom(null);
    setCustomDateTo(null);
  }, []);

  const dateFilterOptionLabel = useCallback(
    (f: "all" | "today" | "tomorrow" | "this_week" | "this_month") => {
      switch (f) {
        case "all":
          return tr("all");
        case "today":
          return tr("todayTrips");
        case "tomorrow":
          return tr("tomorrowTrips");
        case "this_week":
          return tr("thisWeekTrips");
        case "this_month":
          return tr("thisMonthTrips");
        default:
          return tr("all");
      }
    },
    [tr],
  );

  const paymentFilterOptionLabel = useCallback(
    (f: PaymentFilter) => (f === "all" ? tr("all") : tr(`${f}Payment`)),
    [tr],
  );

  const sortOptions = useMemo(
    () => [
      {
        id: "date_desc" as const,
        label: tr("newestFirst"),
        icon: "calendar" as const,
      },
      {
        id: "date_asc" as const,
        label: tr("oldestFirst"),
        icon: "calendar" as const,
      },
      {
        id: "revenue_desc" as const,
        label: tr("revenueHighToLow"),
        icon: "money" as const,
      },
      {
        id: "revenue_asc" as const,
        label: tr("revenueLowToHigh"),
        icon: "money" as const,
      },
      {
        id: "client_asc" as const,
        label: tr("clientAZ"),
        icon: "sort-alpha-asc" as const,
      },
      {
        id: "client_desc" as const,
        label: tr("clientZA"),
        icon: "sort-alpha-desc" as const,
      },
    ],
    [tr],
  );

  const historyMetricOrder = useMemo(
    () =>
      [...historyReceivableIds, ...historyPayableIds] as HistoryTripMetricId[],
    [historyReceivableIds, historyPayableIds],
  );

  const webTripsPagination =
    Platform.OS === "web"
      ? { page: tripsTablePageSafe, pageSize: tripsTablePageSize }
      : undefined;

  const showTripsPaginationFooter =
    Platform.OS === "web" && (hubToolbarMatchCount ?? filtered.length) > 0;

  if (!canAccess) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <Text style={styles.message}>{tr("noAccessTrips")}</Text>
          </View>
    );
  }

  if (orgBootPending || (loading && trips.length === 0)) {
    return <SceneLoadingSplash variant="preparing" message={tr("loading")} />;
  }

  return (
    <View style={[styles.container, { paddingTop: screenTopPad }]}>
      <TripsFilterBottomSheet
        visible={showSortModal}
        onClose={() => setShowSortModal(false)}
        onClearAll={clearTripFilters}
        title={tr("allFilters")}
        clearAllLabel={tr("clearAllFilters")}
        applyLabel={tr("applyTripFilters")}
        viewByLabel={tr("sortBy")}
        tripTypeLabel={tr("tripType")}
        dateFilterLabel={tr("dateFilter")}
        paymentStatusLabel={tr("paymentStatus")}
        loadTypeLabel={tr("loadType")}
        sortOptions={sortOptions}
        sortBy={sortBy}
        onSortByChange={setSortBy}
        supplyTabs={subTabs}
        dateFilters={["all", "today", "tomorrow", "this_week", "this_month"]}
        dateRangeFilter={dateRangeFilter}
        onDateFilterChange={setDateRangeFilter}
        dateFilterOptionLabel={dateFilterOptionLabel}
        paymentFilters={["all", "pending", "partial", "paid"]}
        paymentFilter={paymentFilter}
        onPaymentFilterChange={setPaymentFilter}
        paymentFilterOptionLabel={paymentFilterOptionLabel}
        loadTypeOptions={loadTypeOptions}
        loadTypeFilter={loadTypeFilter}
        onLoadTypeFilterChange={setLoadTypeFilter}
        allLabel={tr("all")}
        maxScrollHeight={width > 1024 ? 560 : 440}
      />

      <DateRangePickerModal
        visible={showDateRangePicker}
        initialFrom={customDateFrom}
        initialTo={customDateTo}
        onDismiss={() => setShowDateRangePicker(false)}
        onApply={(from, to) => {
          setCustomDateFrom(from);
          setCustomDateTo(to);
          setDateRangeFilter("custom");
          setShowDateRangePicker(false);
        }}
        onClear={() => {
          setCustomDateFrom(null);
          setCustomDateTo(null);
          setDateRangeFilter("all");
          setShowDateRangePicker(false);
        }}
      />

      <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: tripsScrollBottomPad },
          ]}
          showsVerticalScrollIndicator={false}
          {...tabBarScrollProps}
          onScroll={handleTripsMainScroll}
          scrollEventThrottle={
            effectiveListLayout === "table"
              ? 100
              : (tabBarScrollProps.scrollEventThrottle ?? 64)
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Theme.primary}
            />
          }
        >
          <View
            style={
              isMobileViewport
                ? styles.tripsBodyFiltersMobileInLayout
                : styles.tripsBodyFiltersBleed
            }
          >
            <View
              style={[
                styles.tripsInlineFilterPanel,
                isMobileViewport && styles.tripsInlineFilterPanelMobileLight,
              ]}
            >
              {isMobileViewport ? (
                <>
                  <View style={styles.mmtScreenHeaderRow}>
                    <Text style={styles.mmtScreenTitle}>{tr("myTrips")}</Text>
                    <TouchableOpacity
                      style={styles.mmtAddTripBtn}
                      onPress={() => router.push("/add-trip")}
                      activeOpacity={0.88}
                      accessibilityRole="button"
                      accessibilityLabel={tr("addTrip")}
                    >
                      <View style={styles.mmtAddTripIconBadge}>
                        <FontAwesome
                          name="plus"
                          size={9}
                          color={Theme.pulseIndigo}
                        />
                      </View>
                      <Text style={styles.mmtAddTripText}>{tr("addTrip")}</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.mmtTabHeaderRow}>
                    <TouchableOpacity
                      style={styles.mmtFilterBtn}
                      onPress={() => setShowSortModal(true)}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel={tr("sortBy")}
                    >
                      <FontAwesome
                        name="sliders"
                        size={15}
                        color={Theme.textPrimaryDark}
                      />
                    </TouchableOpacity>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      keyboardShouldPersistTaps="handled"
                      nestedScrollEnabled
                      style={styles.mmtPrimaryTabsScroll}
                      contentContainerStyle={styles.mmtPrimaryTabsContent}
                    >
                      {mainTabs.map((tab) => (
                        <TripsMmtUnderlineTab
                          key={tab.id}
                          label={formatMainTabLabel(tab.label, tab.count)}
                          isActive={tab.isActive}
                          onPress={tab.onPress}
                          accessibilityLabel={`${tab.label}, ${tab.count} trips`}
                        />
                      ))}
                    </ScrollView>
                  </View>
                  <View style={styles.mmtTabDivider} />
                </>
              ) : (
                <View style={styles.tripsInlineFilterPanelWeb}>
                  <View
                    style={[
                      chatChrome.filterHeaderRow,
                      isCompactWeb && styles.tripsFilterHeaderCompact,
                    ]}
                  >
                    {!isMobile ? (
                      <View style={[chatChrome.tabRow, chatChrome.tabRowHug]}>
                        {subTabs.map((tab) => (
                          <TouchableOpacity
                            key={tab.id}
                            style={[
                              chatChrome.tabPill,
                              chatChrome.tabPillHug,
                              tab.isActive && chatChrome.tabPillActive,
                            ]}
                            onPress={tab.onPress}
                            activeOpacity={0.75}
                            accessibilityRole="tab"
                            accessibilityState={{ selected: tab.isActive }}
                          >
                            <Text
                              style={[
                                chatChrome.tabPillLabel,
                                chatChrome.tabPillLabelHug,
                                tab.isActive && chatChrome.tabPillLabelActive,
                              ]}
                            >
                              {tab.label}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    ) : null}
                    <View
                      style={[
                        chatChrome.filterHeaderRight,
                        isCompactWeb && styles.tripsFilterHeaderRightCompact,
                      ]}
                    >
                      <View style={[chatChrome.tabRow, chatChrome.tabRowHug]}>
                        {mainTabs.map((tab) => (
                          <TouchableOpacity
                            key={tab.id}
                            style={[
                              chatChrome.tabPill,
                              chatChrome.tabPillHug,
                              tab.isActive && chatChrome.tabPillActive,
                            ]}
                            onPress={tab.onPress}
                            activeOpacity={0.75}
                            accessibilityRole="tab"
                            accessibilityState={{ selected: tab.isActive }}
                            accessibilityLabel={`${tab.label}, ${tab.count} trips`}
                          >
                            <Text
                              style={[
                                chatChrome.tabPillLabel,
                                chatChrome.tabPillLabelHug,
                                tab.isActive && chatChrome.tabPillLabelActive,
                              ]}
                            >
                              {formatMainTabLabel(tab.label, tab.count)}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                      {!isMobileViewport ? (
                        <View
                          style={chatChrome.iconToggleTray}
                          accessibilityRole="tablist"
                        >
                          <TouchableOpacity
                            style={[
                              chatChrome.iconToggleBtn,
                              listLayout === "cards" &&
                                chatChrome.iconToggleBtnActive,
                            ]}
                            onPress={() =>
                              setListLayoutWithPersistence("cards")
                            }
                            activeOpacity={0.85}
                            accessibilityRole="tab"
                            accessibilityState={{
                              selected: listLayout === "cards",
                            }}
                            accessibilityLabel={tr("tripsViewCards")}
                          >
                            <FontAwesome
                              name="th-large"
                              size={12}
                              color={
                                listLayout === "cards"
                                  ? "#ffffff"
                                  : CHAT_FILTER_MUTED
                              }
                            />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[
                              chatChrome.iconToggleBtn,
                              listLayout === "table" &&
                                chatChrome.iconToggleBtnActive,
                            ]}
                            onPress={() =>
                              setListLayoutWithPersistence("table")
                            }
                            activeOpacity={0.85}
                            accessibilityRole="tab"
                            accessibilityState={{
                              selected: listLayout === "table",
                            }}
                            accessibilityLabel={tr("tripsViewTable")}
                          >
                            <FontAwesome
                              name="list"
                              size={12}
                              color={
                                listLayout === "table"
                                  ? "#ffffff"
                                  : CHAT_FILTER_MUTED
                              }
                            />
                          </TouchableOpacity>
                        </View>
                      ) : null}
                    </View>
                  </View>
                </View>
              )}
            </View>
            {tripFilter === "Active" ? (
              isMobileViewport ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={styles.mmtMetricTabsContent}
                  style={styles.mmtMetricTabsScroll}
                >
                  {activeMetricIdsForRail.map((metricId) => {
                    const active = activeMetricTab === metricId;
                    const copy = tripMetricCopy[metricId];
                    const count =
                      metricId === "all"
                        ? activeAllCount
                        : metricCounts[metricId];
                    return (
                      <TripsMmtUnderlineTab
                        key={metricId}
                        label={`${copy.title} (${count})`}
                        isActive={active}
                        compact
                        onPress={() => setActiveMetricTab(metricId)}
                        accessibilityLabel={`${copy.title}, ${count} trips`}
                      />
                    );
                  })}
                </ScrollView>
              ) : (
                <TripsHubBentoMetrics
                  metricOrder={activeMetricIdsForRail}
                  activeMetricTab={activeMetricTab}
                  onSelectMetric={setActiveMetricTab}
                  getCount={(id) =>
                    id === "all" ? activeAllCount : metricCounts[id]
                  }
                  getTitle={(id) => tripMetricCopy[id].title}
                  getSubtitle={(id) => tripMetricVisual[id].micro}
                  getIcon={(id) => tripMetricVisual[id].icon}
                  missionPulseLabel={tr("tripsHubMissionStatus")}
                  sectionLabels={[
                    tr("all"),
                    tr("tripsHubMetricGroupIntake"),
                    tr("tripsHubMetricGroupInMotion"),
                  ]}
                  isDesktop={isLargeScreen}
                style={styles.tripMetricsScroll}
                />
              )
            ) : isMobileViewport ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.mmtMetricTabsContent}
                style={styles.mmtMetricTabsScroll}
              >
                {[...historyReceivableIds, ...historyPayableIds].map(
                  (metricId) => {
                    const active = activeHistoryMetricTab === metricId;
                    const copy = historyMetricCards[metricId];
                    return (
                      <TripsMmtUnderlineTab
                        key={metricId}
                        label={`${copy.title} (${copy.count})`}
                        isActive={active}
                        compact
                        onPress={() =>
                          setActiveHistoryMetricTab((current) =>
                            current === metricId ? null : metricId,
                          )
                        }
                        accessibilityLabel={`${copy.title}, ${copy.count} trips`}
                      />
                    );
                  },
                )}
              </ScrollView>
            ) : (
              <TripsHubHistoryBentoMetrics
                metricOrder={historyMetricOrder}
                activeMetricTab={activeHistoryMetricTab}
                onSelectMetric={setActiveHistoryMetricTab}
                getMetric={(id) => historyMetricCards[id]}
                missionPulseLabel={tr("tripsHubSettlementPulse")}
                receivableSectionLabel={tr("tripsHubMetricGroupReceivable")}
                payableSectionLabel={tr("tripsHubMetricGroupPayable")}
                isDesktop={isLargeScreen}
                style={styles.tripMetricsScroll}
              />
            )}
          </View>

          {effectiveListLayout === "table" ? (
            <View>
            <ScrollView
              horizontal
              nestedScrollEnabled
              showsHorizontalScrollIndicator
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.tripsTableHScrollContent}
            >
              <View
                style={[
                  styles.tripsTableMinWidth,
                  {
                    minWidth: Math.max(
                      width - Layout.screenPaddingHorizontal * 2,
                        isMobile ? 980 : 1140,
                    ),
                  },
                ]}
              >
                <TripsHubTableView
                  trips={filtered}
                  pagination={webTripsPagination}
                  onDisplayedTripsLengthChange={setHubToolbarMatchCount}
                  currentOrganizationId={currentOrganization?.id ?? null}
                  getStageLabel={getStageLabelForTrip}
                  transactionsByTripId={transactionsByTripId}
                    financeAdjustmentsByTripId={tripFinanceAdjForHub}
                  subcontractRateByTripId={hubSubcontractRateByTripId}
                  onOpenTripDetails={(trip) =>
                    router.push(`/trip/${trip.id}` as const)
                  }
                  tr={tr}
                  dateRangeFilter={toolbarDateRangeFilter}
                  onDateRangeFilterChange={(next: DateFilter) => {
                    setDateRangeFilter(next);
                    if (next !== "custom") {
                      setCustomDateFrom(null);
                      setCustomDateTo(null);
                    }
                  }}
                  onOpenDateRangePicker={() => setShowDateRangePicker(true)}
                    onExportLedger={() => setTripLedgerExportOpen(true)}
                  clientNameByTripId={shipperNameByTripId}
                  linkedOrgByOrganizationId={linkedOrgByOrganizationId}
                  partyMetaByTripId={tripHubPartyMetaByTripId}
                />
                {filtered.length === 0 ? (
                  <Text style={styles.empty} accessibilityLiveRegion="polite">
                    {showCompletedList ? tr("noCompletedTrips") : tr("noTripsYet")}
                  </Text>
                ) : null}
              </View>
            </ScrollView>
              {showTripsPaginationFooter ? (
                <HubListPaginationBar
                  page={tripsTablePageSafe}
                  totalPages={tripsTableTotalPages}
                  totalItems={tripsHubPaginationTotal}
                  pageSize={tripsTablePageSize}
                  onPageSizeChange={setTripsTablePageSize}
                  itemLabel="trips"
                  onPrev={() => setTripsTablePage((p) => Math.max(0, p - 1))}
                  onNext={() =>
                    setTripsTablePage((p) =>
                      Math.min(tripsTableTotalPages - 1, p + 1),
                    )
                  }
                />
              ) : null}
            </View>
          ) : (
            <View>
              <TripsHubTableView
                trips={filtered}
                pagination={webTripsPagination}
                onDisplayedTripsLengthChange={setHubToolbarMatchCount}
                currentOrganizationId={currentOrganization?.id ?? null}
                getStageLabel={getStageLabelForTrip}
                transactionsByTripId={transactionsByTripId}
                financeAdjustmentsByTripId={tripFinanceAdjForHub}
                subcontractRateByTripId={hubSubcontractRateByTripId}
                onOpenTripDetails={(trip) =>
                  router.push(`/trip/${trip.id}` as const)
                }
                tr={tr}
                dateRangeFilter={toolbarDateRangeFilter}
                onDateRangeFilterChange={(next: DateFilter) => {
                  setDateRangeFilter(next);
                  if (next !== "custom") {
                    setCustomDateFrom(null);
                    setCustomDateTo(null);
                  }
                }}
                onOpenDateRangePicker={() => setShowDateRangePicker(true)}
                onExportLedger={() => setTripLedgerExportOpen(true)}
                clientNameByTripId={shipperNameByTripId}
                linkedOrgByOrganizationId={linkedOrgByOrganizationId}
                partyMetaByTripId={tripHubPartyMetaByTripId}
                renderBody={(rows) =>
                  rows.length === 0 ? (
                    <Text style={styles.empty} accessibilityLiveRegion="polite">
                      {showCompletedList ? tr("noCompletedTrips") : tr("noTripsYet")}
                    </Text>
                  ) : isLargeScreen ? (
                  <View style={styles.gridContainer}>
                    {rows.map((t) => {
                      const stage = getStageLabelForTrip(t);
                      const displayClientName =
                        shipperNameByTripId[t.id] ?? t.client_name ?? "—";
                      const cardLedgerRows = transactionsByTripId.get(t.id) ?? [];
                      const hubLedger = summarizeTripLedgerForHub(cardLedgerRows);
                      const party = tripHubPartyMetaByTripId.get(t.id);
                      const clientOrgFields = linkedOrgAvatarFields(
                        party?.clientLinkedOrgId,
                        linkedOrgByOrganizationId,
                      );
                      const supplierOrgFields = linkedOrgAvatarFields(
                        party?.supplierLinkedOrgId,
                        linkedOrgByOrganizationId,
                      );
                      return (
                        <View key={t.id} style={styles.gridItem}>
                          <TripsHubTripCard
                            hubGrid
                            trip={t}
                            currentOrganizationId={
                              currentOrganization?.id ?? null
                            }
                            kindPillMeta={
                              party
                                ? {
                                    supplierLinkedOrgId:
                                      party.supplierLinkedOrgId,
                                    driverTrackingOnly:
                                      party.driverTrackingOnly,
                                  }
                                : null
                            }
                            financeAdjustments={tripFinanceAdjForHubLookup(
                              tripFinanceAdjForHub,
                              t.id,
                            )}
                            hubCostContext={{
                              subcontractRate:
                                hubSubcontractRateByTripId.get(t.id) ?? null,
                              nonSupplierExpenseTotal:
                                tripNonSupplierOutflowTotal(cardLedgerRows),
                            }}
                            displayClientName={displayClientName}
                            displaySupplierName={party?.displaySupplierName ?? ""}
                            displayDriverName={party?.displayDriverName ?? ""}
                            clientAvatarUrl={party?.clientAvatarUrl ?? null}
                            clientAvatarSeed={party?.clientAvatarSeed ?? null}
                            clientAvatarFallbackSeed={party?.clientFallbackSeed}
                            clientOrganizationImageUrl={
                              clientOrgFields.organizationImageUrl
                            }
                            clientOrganizationAvatarSeed={
                              clientOrgFields.organizationAvatarSeed
                            }
                            supplierAvatarUrl={party?.supplierAvatarUrl ?? null}
                            supplierAvatarSeed={party?.supplierAvatarSeed ?? null}
                            supplierAvatarFallbackSeed={
                              party?.supplierFallbackSeed
                            }
                            supplierOrganizationImageUrl={
                              supplierOrgFields.organizationImageUrl
                            }
                            supplierOrganizationAvatarSeed={
                              supplierOrgFields.organizationAvatarSeed
                            }
                            driverAvatarUrl={party?.driverAvatarUrl ?? null}
                            driverAvatarSeed={party?.driverAvatarSeed ?? null}
                            cardDate={getTripCardDate(t)}
                            stageLabel={stage}
                            onPress={() =>
                              router.push(`/trip/${t.id}` as const)
                            }
                            tr={tr}
                            ledgerReceivedTotal={hubLedger.receivedTotal}
                            ledgerPaidTotal={hubLedger.paidTotal}
                            ledgerTxnCount={hubLedger.count}
                            lastLedgerDateLabel={
                              hubLedger.lastAtIso
                                ? formatLedgerDate(hubLedger.lastAtIso)
                                : undefined
                            }
                            rowWebStyle={
                              Platform.OS === "web"
                                ? ({ cursor: "pointer" } as ViewStyle)
                                : undefined
                            }
                          />
                        </View>
                      );
                    })}
                  </View>
                  ) : (
                  <TripsHubMobileTripListCanvas>
                    {rows.map((t) => {
                      const stage = getStageLabelForTrip(t);
                      const displayClientName =
                        shipperNameByTripId[t.id] ?? t.client_name ?? "—";
                      const cardLedgerRows = transactionsByTripId.get(t.id) ?? [];
                      const hubLedger = summarizeTripLedgerForHub(cardLedgerRows);
                      const party = tripHubPartyMetaByTripId.get(t.id);
                      const clientOrgFields = linkedOrgAvatarFields(
                        party?.clientLinkedOrgId,
                        linkedOrgByOrganizationId,
                      );
                      const supplierOrgFields = linkedOrgAvatarFields(
                        party?.supplierLinkedOrgId,
                        linkedOrgByOrganizationId,
                      );
                      return (
                        <TripsHubTripCard
                          key={t.id}
                          trip={t}
                          currentOrganizationId={
                            currentOrganization?.id ?? null
                          }
                          kindPillMeta={
                            party
                              ? {
                                  supplierLinkedOrgId: party.supplierLinkedOrgId,
                                  driverTrackingOnly: party.driverTrackingOnly,
                                }
                              : null
                          }
                          financeAdjustments={tripFinanceAdjForHubLookup(
                            tripFinanceAdjForHub,
                            t.id,
                          )}
                          hubCostContext={{
                            subcontractRate:
                              hubSubcontractRateByTripId.get(t.id) ?? null,
                            nonSupplierExpenseTotal:
                              tripNonSupplierOutflowTotal(cardLedgerRows),
                          }}
                          displayClientName={displayClientName}
                          displaySupplierName={party?.displaySupplierName ?? ""}
                          displayDriverName={party?.displayDriverName ?? ""}
                          clientAvatarUrl={party?.clientAvatarUrl ?? null}
                          clientAvatarSeed={party?.clientAvatarSeed ?? null}
                          clientAvatarFallbackSeed={party?.clientFallbackSeed}
                          clientOrganizationImageUrl={
                            clientOrgFields.organizationImageUrl
                          }
                          clientOrganizationAvatarSeed={
                            clientOrgFields.organizationAvatarSeed
                          }
                          supplierAvatarUrl={party?.supplierAvatarUrl ?? null}
                          supplierAvatarSeed={party?.supplierAvatarSeed ?? null}
                          supplierAvatarFallbackSeed={party?.supplierFallbackSeed}
                          supplierOrganizationImageUrl={
                            supplierOrgFields.organizationImageUrl
                          }
                          supplierOrganizationAvatarSeed={
                            supplierOrgFields.organizationAvatarSeed
                          }
                          driverAvatarUrl={party?.driverAvatarUrl ?? null}
                          driverAvatarSeed={party?.driverAvatarSeed ?? null}
                          cardDate={getTripCardDate(t)}
                          stageLabel={stage}
                          onPress={() =>
                            router.push(`/trip/${t.id}` as const)
                          }
                          tr={tr}
                          ledgerReceivedTotal={hubLedger.receivedTotal}
                          ledgerPaidTotal={hubLedger.paidTotal}
                          ledgerTxnCount={hubLedger.count}
                          lastLedgerDateLabel={
                            hubLedger.lastAtIso
                              ? formatLedgerDate(hubLedger.lastAtIso)
                              : undefined
                          }
                        />
                      );
                    })}
                  </TripsHubMobileTripListCanvas>
                  )
                }
              />
              {showTripsPaginationFooter ? (
                <HubListPaginationBar
                  page={tripsTablePageSafe}
                  totalPages={tripsTableTotalPages}
                  totalItems={tripsHubPaginationTotal}
                  pageSize={tripsTablePageSize}
                  onPageSizeChange={setTripsTablePageSize}
                  itemLabel="trips"
                  onPrev={() => setTripsTablePage((p) => Math.max(0, p - 1))}
                  onNext={() =>
                    setTripsTablePage((p) =>
                      Math.min(tripsTableTotalPages - 1, p + 1),
                    )
                  }
                />
              ) : null}
            </View>
          )}
        </ScrollView>
      {canAccess && !isMobileViewport ? (
        <View
          style={[
            styles.fabWrap,
            {
              zIndex: 40,
              right: Layout.screenPaddingHorizontal,
              bottom: tripsFabBottom,
            },
          ]}
        >
          <FinanceFAB
            onPress={() => router.push("/add-trip")}
            accessibilityLabel={tr("addTrip")}
            icon="road"
          />
        </View>
      ) : null}
      <TripsLedgerExportModalGate
        active={tripLedgerExportOpen}
        visible={tripLedgerExportOpen}
        onClose={() => setTripLedgerExportOpen(false)}
        transactions={[]}
        title="Trips Ledger Export"
        hideCashSummary
        customReport={tripLedgerExportReport}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: TRIPS_PAGE_BG },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  message: { fontSize: 16, color: Theme.textSecondary },
  headerBlock: {
    backgroundColor: Theme.darkBackground,
    width: "100%",
    paddingTop: 12,
  },
  tabRowWeb: {
    flexDirection: "row",
    justifyContent: "center",
    paddingHorizontal: Layout.screenPaddingHorizontal,
    marginTop: 2,
    marginBottom: 4,
    paddingBottom: 6,
  },
  tabRowScroll: {
    flexGrow: 0,
    borderBottomWidth: 0,
  },
  tabRowWebSub: {
    flexDirection: "row",
    justifyContent: "center",
    paddingHorizontal: Layout.screenPaddingHorizontal,
    marginTop: 2,
    marginBottom: 4,
    paddingBottom: 6,
  },
  tabRowScrollSub: {
    flexGrow: 0,
    borderBottomWidth: 0,
  },
  tripsMobileTopFilterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 8,
    paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  tripsMobileMainTabs: {
    flex: 0.75,
    minWidth: 0,
    borderBottomWidth: 0,
  },
  tripsMobileSubTabs: {
    flex: 1.25,
    minWidth: 0,
    borderBottomWidth: 0,
  },
  tripsMobileTab: {
    minWidth: 62,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 34,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  tripsMobileSubTabText: {
    fontSize: 7,
    letterSpacing: 1.1,
  },
  tabRowScrollContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 0,
    paddingTop: 4,
    paddingBottom: 4,
  },
  tab: {
    position: "relative" as const,
    minWidth: 80,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  tabWeb: {
    flex: 1,
    minWidth: 56,
    position: "relative" as const,
    paddingVertical: 6,
    justifyContent: "center",
    alignItems: "center",
  },
  tabActive: {
    backgroundColor: Theme.screenBackground,
  },
  tabText: {
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1.6,
    color: Theme.textMuted,
  },
  tabTextActive: { color: Theme.textPrimaryDark },
  tabActiveMobileDark: {
    backgroundColor: Theme.screenBackground,
    borderColor: Theme.screenBackground,
  },
  tabTextMobileDark: {
    color: Theme.textOnDarkMuted,
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 1.3,
  },
  tabTextActiveMobileDark: {
    color: Theme.textPrimaryDark,
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 1.3,
  },
  tabUnderline: {
    position: "absolute",
    bottom: 2,
    left: 10,
    right: 10,
    height: 2.5,
    backgroundColor: Theme.teslaRed,
    borderRadius: 999,
  },
  /** Native: one horizontal track for main (underline) + sub (pills) — no double underline. */
  tripsMobileTabsScroll: {
    maxHeight: 50,
    minWidth: 0,
    alignSelf: "stretch",
    ...Platform.select({
      web: { width: "100%" as const, maxWidth: "100%" as const },
    }),
  },
  tripsMobileTabsScrollContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingLeft: 0,
    paddingRight: 0,
    paddingTop: 8,
    paddingBottom: Layout.spacingMedium,
    flexGrow: 0,
  },
  tripsFilterGroupSeparator: {
    width: 1,
    height: 22,
    backgroundColor: Theme.borderLight,
    marginHorizontal: 10,
    flexShrink: 0,
  },
  tabSubPill: {
    minWidth: 74,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: Theme.liquidPillBg,
    borderWidth: 1,
    borderColor: Theme.liquidPillBorder,
    justifyContent: "center",
    alignItems: "center",
  },
  tabSubPillActive: {
    backgroundColor: Theme.darkBackground,
    borderColor: Theme.darkBackground,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 2,
  },
  tabSubPillText: {
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.9,
    color: Theme.textSecondary,
  },
  tabSubPillTextActive: {
    color: Theme.textOnDark,
  },
  /** Native: search + sort + date chips in one side-scrollable row. */
  tripsToolbarScroll: {
    maxHeight: 58,
    minWidth: 0,
    alignSelf: "stretch",
    ...Platform.select({
      web: { width: "100%" as const, maxWidth: "100%" as const },
    }),
  },
  tripsToolbarScrollContent: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 2,
    paddingBottom: 10,
    gap: 8,
  },
  /** In horizontal scroll, do not use flex:1 (avoids zero-width search). */
  tripsSearchWrapInToolbarScroll: {
    flexGrow: 0,
    flexShrink: 0,
    flex: 0,
    width: 220,
    minHeight: 40,
  },
  /** Network / Treasury-style: search + supply chips (stacked narrow, row on wide web). */
  tripsToolbar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 10,
    paddingBottom: 10,
    backgroundColor: "transparent",
    gap: 10,
  },
  tripsLayoutToggle: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Theme.screenBackground,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    padding: 3.5,
    gap: 3,
  },
  tripsLayoutToggleBtn: {
    width: 38,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  tripsLayoutToggleBtnActive: {
    backgroundColor: Theme.darkBackground,
  },
  tripsToolbarActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 0,
    flexShrink: 0,
    minWidth: 0,
  },
  tripsSearchWrap: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    minHeight: 40,
    borderRadius: 13,
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    paddingHorizontal: 13,
    paddingVertical: 0,
    minWidth: 0,
  },
  tripsSearchWrapRow: {
    flex: 1,
  },
  /** Web: avoid default focus ring clashing with dark field (RN web). */
  tripsSearchWrapWeb: {
    outlineStyle: "none",
    outlineWidth: 0,
  } as unknown as ViewStyle,
  tripsSearchWrapWebCompact: {
    flex: 0,
    width: 240,
    minWidth: 160,
    maxWidth: 300,
  },
  tripsSearchIcon: { marginRight: 8 },
  tripsSearchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    paddingVertical: 0,
  },
  tripsSearchInputWeb: {
    outlineStyle: "none",
    outlineWidth: 0,
  } as unknown as TextStyle,
  tripsFilterIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      web: {
        outlineStyle: "none",
      } as object,
    }),
  },
  tripsFilterCountBadge: {
    position: "absolute",
    top: -5,
    right: -5,
    minWidth: 15,
    height: 15,
    borderRadius: 999,
    paddingHorizontal: 3,
    backgroundColor: Theme.teslaRed,
    alignItems: "center",
    justifyContent: "center",
  },
  tripsFilterCountBadgeText: {
    color: Theme.textOnDark,
    fontSize: 8,
    fontWeight: "800",
    lineHeight: 10,
  },
  tripsMobileDateInlineRow: {
    flex: 1,
    minWidth: 96,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  tripsMobileDateChip: {
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  tripsDateFilterRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 10,
    paddingBottom: 12,
    gap: 10,
    backgroundColor: "#000000",
    borderBottomWidth: 1,
    borderBottomColor: Theme.separatorDark,
  },
  tripsDateChipsScroll: {
    flex: 1,
    flexGrow: 1,
    flexShrink: 1,
  },
  tripsDateChipsContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 6,
    paddingRight: 4,
    paddingLeft: 0,
  },
  tripsDateChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: Theme.darkSurface,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    flexDirection: "row",
    alignItems: "center",
  },
  tripsDateChipActive: {
    backgroundColor: "rgba(255,255,255,0.16)",
    borderColor: "rgba(255,255,255,0.22)",
  },
  tripsDateChipCustom: {
    backgroundColor: Theme.teslaRed,
    borderColor: Theme.teslaRed,
    gap: 6,
  },
  tripsDateChipCustomIcon: {
    marginRight: 2,
  },
  tripsDateChipCustomClose: {
    marginLeft: 4,
    paddingLeft: 6,
    borderLeftWidth: 1,
    borderLeftColor: "rgba(255,255,255,0.25)",
  },
  tripsDateChipText: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textOnDarkMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  tripsDateChipTextActive: {
    color: Theme.textOnDark,
  },
  tripsDateRangeIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: Theme.separatorDark,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  tripsDateRangeIconBtnActive: {
    backgroundColor: Theme.teslaRed,
    borderColor: Theme.teslaRed,
  },
  dropdownItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    position: "relative",
  },
  dropdownItemActive: {
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  dropdownItemAccent: {
    position: "absolute",
    left: 0,
    top: 10,
    bottom: 10,
    width: 3,
    borderRadius: 2,
    backgroundColor: Theme.teslaRed,
  },
  dropdownItemIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  dropdownItemIconWrapActive: {
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  dropdownItemText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textOnDark,
    letterSpacing: 0.2,
  },
  dropdownItemTextActive: {
    color: Theme.textOnDark,
    fontWeight: "700",
  },
  dropdownItemCheck: {
    marginLeft: 6,
  },
  tripsSupplyChipsScroll: {
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
  },
  tripsSupplyChipsScrollRow: {
    flexGrow: 0,
    flexShrink: 0,
    alignSelf: "auto",
  },
  tripsSupplyChipsScrollInner: {
    alignItems: "center",
    justifyContent: "flex-start",
    paddingRight: 2,
  },
  tripsSupplyChipsRail: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
    alignSelf: "flex-start",
    backgroundColor: Theme.darkSurface,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 6,
    paddingVertical: 4,
    gap: 3,
  },
  tripsSupplyChip: {
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 999,
  },
  tripsSupplyChipWeb: { cursor: "pointer" } as ViewStyle,
  tripsSupplyChipActive: {
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  tripsSupplyChipText: {
    fontSize: 8,
    fontWeight: "500",
    color: Theme.textOnDarkMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  tripsSupplyChipTextActive: {
    color: Theme.textOnDark,
  },
  gridContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -4,
    alignItems: "stretch",
  },
  /** Desktop trips grid — 4 cards per row (25% each). */
  gridItem: {
    width: "25%",
    maxWidth: "25%",
    flexBasis: "25%",
    paddingHorizontal: 4,
    marginBottom: 12,
    alignSelf: "stretch",
  },
  tripsTableHScrollContent: {
    paddingBottom: 8,
    flexGrow: 1,
  },
  tripsTableMinWidth: {
    flexGrow: 1,
  },
  tripsTablePaginationRow: {
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingHorizontal: 2,
  },
  tripsTablePaginationMeta: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  tripsTablePaginationRowBottom: {
    marginTop: 8,
    marginBottom: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingHorizontal: 2,
  },
  tripsTablePaginationRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  tripsTablePageSizeWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 999,
    padding: 2,
  },
  tripsTablePageSizePill: {
    minWidth: 34,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  tripsTablePageSizePillActive: {
    backgroundColor: Theme.darkBackground,
  },
  tripsTablePageSizeText: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textMuted,
    letterSpacing: 0.35,
  },
  tripsTablePageSizeTextActive: {
    color: Theme.textOnDark,
  },
  tripsTablePageNavBtn: {
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  tripsTablePageNavBtnDisabled: {
    opacity: 0.4,
  },
  tripsTablePageNavText: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.35,
    textTransform: "uppercase",
  },
  scroll: { flex: 1, backgroundColor: TRIPS_PAGE_BG },
  scrollContent: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 4,
    flexGrow: 1,
    backgroundColor: TRIPS_PAGE_BG,
    /** Web: allow column children (e.g. horizontal ScrollViews) to shrink to viewport, not min-content width. */
    ...Platform.select({
      web: { minWidth: 0, maxWidth: "100%" as const },
    }),
  },
  /** Status + date filters (moved from header) — full-bleed strip above list/table */
  tripsBodyFiltersBleed: {
    marginHorizontal: -Layout.screenPaddingHorizontal,
    marginBottom: 8,
    paddingTop: 8,
    paddingBottom: 10,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    backgroundColor: Theme.screenBackground,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
    ...Platform.select({
      web: { minWidth: 0 },
    }),
  },
  /** Mobile: keep filter block inside page layout flow (no full-bleed strip). */
  tripsBodyFiltersMobileInLayout: {
    marginBottom: 6,
    marginHorizontal: -Layout.screenPaddingHorizontal,
    paddingTop: 2,
    paddingBottom: 6,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    backgroundColor: Theme.screenBackground,
    borderRadius: 0,
    borderWidth: 0,
    borderColor: "transparent",
    overflow: "hidden",
  },
  mmtScreenHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 4,
    paddingBottom: 10,
    gap: 12,
  },
  mmtScreenTitle: {
    flex: 1,
    fontSize: 22,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.4,
  },
  mmtAddTripBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    flexShrink: 0,
    height: 28,
    paddingLeft: 4,
    paddingRight: 9,
    borderRadius: 14,
    backgroundColor: Theme.pulseIndigo,
    borderWidth: 1,
    borderColor: Theme.pulseIndigo,
    shadowColor: Theme.pulseIndigo,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.28,
    shadowRadius: 6,
    elevation: 3,
  },
  mmtAddTripIconBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Theme.textOnPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  mmtAddTripText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textOnPrimary,
    letterSpacing: -0.1,
  },
  mmtTabHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    minHeight: 36,
  },
  mmtFilterBtn: {
    width: 34,
    height: 34,
    marginRight: 2,
    marginBottom: 1,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  mmtPrimaryTabsScroll: {
    flex: 1,
    minWidth: 0,
  },
  mmtPrimaryTabsContent: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingRight: 4,
  },
  mmtTabItem: {
    position: "relative",
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 8,
    marginRight: 2,
    justifyContent: "flex-end",
    minHeight: 34,
  },
  mmtTabItemCompact: {
    paddingHorizontal: 8,
    paddingTop: 4,
    paddingBottom: 7,
    minHeight: 30,
    marginRight: 0,
  },
  mmtTabLabel: {
    fontSize: 13,
    fontWeight: "500",
    color: Theme.textRouteCard,
    letterSpacing: -0.2,
  },
  mmtTabLabelCompact: {
    fontSize: 11,
    letterSpacing: -0.25,
  },
  mmtTabLabelActive: {
    fontWeight: "600",
    color: TRIPS_HUB_ACCENT,
  },
  mmtTabUnderline: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 0,
    height: 2,
    borderRadius: 1,
    backgroundColor: TRIPS_HUB_ACCENT,
  },
  mmtTabUnderlineCompact: {
    left: 8,
    right: 8,
    height: 2,
  },
  mmtTabDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Theme.borderLight,
    marginBottom: 0,
  },
  mmtMetricTabsScroll: {
    minWidth: 0,
    alignSelf: "stretch",
    marginTop: 2,
    marginBottom: 2,
  },
  mmtMetricTabsContent: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingRight: 4,
    paddingBottom: 0,
    gap: 0,
  },
  /** Narrow web / mobile: one continuous dark strip (tabs + date chips + metric rail). */
  tripsBodyFiltersBleedMobileDark: {
    marginHorizontal: 0,
    paddingHorizontal: 0,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: Theme.darkBackground,
    borderBottomColor: Theme.separatorDark,
  },
  tripsInlineFilterPanel: {
    marginBottom: 12,
    backgroundColor: Theme.screenBackground,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 20,
    overflow: "hidden",
  },
  tripsInlineFilterPanelMobileLight: {
    marginBottom: 0,
    backgroundColor: Theme.screenBackground,
    borderTopWidth: 0,
    borderBottomWidth: 0,
    borderColor: "transparent",
    borderRadius: 0,
    overflow: "visible",
  },
  tripsInlineFilterRowWeb: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingVertical: 8,
  },
  tripsInlineFilterPanelWeb: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 10,
    paddingBottom: 10,
    gap: 10,
  },
  tripsFilterHeaderCompact: {
    flexDirection: "column",
    alignItems: "stretch",
    gap: 8,
  },
  tripsFilterHeaderRightCompact: {
    marginLeft: 0,
    width: "100%",
    justifyContent: "flex-end",
    flexWrap: "wrap",
    rowGap: 8,
  },
  tripsTopHeaderRowWeb: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    minHeight: 36,
  },
  tripsMainTabsRowWeb: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexShrink: 0,
  },
  tripsMainTabsRowWebCompact: {
    width: "auto" as const,
    alignSelf: "auto",
    justifyContent: "flex-end",
    marginLeft: "auto",
    flexShrink: 0,
  },
  tripsTopHeaderSpacer: {
    flex: 1,
  },
  tripsMainTabsPillWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    padding: 4,
    borderRadius: 999,
    backgroundColor: Theme.liquidPillBg,
    borderWidth: 1,
    borderColor: Theme.liquidPillBorder,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 0,
  },
  tripsMainTabsPillWrapMobile: {
    gap: 2,
    padding: 3,
  },
  tripsMainPillWeb: {
    minWidth: 104,
    borderRadius: 999,
    paddingVertical: 9,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      web: {
        outlineStyle: "none",
      } as object,
    }),
  },
  tripsMainPillWebMobile: {
    minWidth: 86,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  tripsMainPillActiveWeb: {
    backgroundColor: Theme.darkBackground,
    shadowOpacity: 0,
    elevation: 0,
  },
  tripsMainPillTextWeb: {
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1.1,
    color: Theme.textMuted,
  },
  tripsMainPillTextActiveWeb: {
    color: Theme.textOnDark,
  },
  tripsBottomHeaderRowWeb: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "nowrap",
  },
  tripsBottomHeaderRowWebCompact: {
    flexDirection: "column",
    alignItems: "stretch",
    gap: 10,
  },
  tripsTabClusterWeb: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    flexShrink: 0,
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
  tripsTabClusterWebCompact: {
    alignSelf: "center",
    maxWidth: "100%",
    flexWrap: "wrap",
  },
  tripsScopePillWeb: {
    minWidth: 92,
    borderRadius: 999,
    backgroundColor: "transparent",
    borderColor: "transparent",
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 14,
    ...Platform.select({
      web: {
        outlineStyle: "none",
      } as object,
    }),
  },
  tripsScopePillActiveWeb: {
    backgroundColor: Theme.darkBackground,
    borderColor: Theme.darkBackground,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.16,
    shadowRadius: 7,
    elevation: 2,
  },
  tripsScopePillTextWeb: {
    color: Theme.textMuted,
    letterSpacing: 1,
  },
  tripsScopePillTextActiveWeb: {
    color: Theme.textOnDark,
  },
  tabWebCompact: {
    minWidth: 66,
    position: "relative" as const,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  /** Sub-tabs on web: same pill look as native (not a second red underline). */
  tabSubPillWeb: {
    minWidth: 58,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  tabTextSubCompact: {
    fontSize: 7,
    letterSpacing: 1.2,
  },
  tripsToolbarWeb: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    flexWrap: "nowrap",
    justifyContent: "flex-end",
    paddingHorizontal: 0,
    paddingVertical: 0,
    backgroundColor: "transparent",
  },
  tripsToolbarWebCompact: {
    width: "100%",
    justifyContent: "space-between",
    flexWrap: "nowrap",
    rowGap: 0,
    alignItems: "center",
  },
  tripsSearchWrapWebFluid: {
    flex: 1,
    width: "auto" as const,
    minWidth: 190,
    maxWidth: "100%" as const,
  },
  tripsSearchWrapWebMobile: {
    minWidth: 140,
  },
  tripsDateInlineRowWeb: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
    marginLeft: 2,
  },
  tripMetricsGrid: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingBottom: 8,
    paddingRight: 4,
  },
  tripMetricsScroll: {
    marginBottom: 8,
    paddingBottom: 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  tripMetricTabsScroll: {
    marginBottom: 10,
    borderRadius: 22,
    backgroundColor: Theme.darkBackground,
    borderWidth: 1,
    borderColor: Theme.separatorDark,
  },
  tripMetricTabsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  tripHistoryMobileTabsWrap: {
    marginBottom: 8,
  },
  tripMetricTabPill: {
    minWidth: 104,
    paddingVertical: 9,
    paddingHorizontal: 14,
  },
  tripMetricTabPillDark: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  tripMetricTabPillDarkActive: {
    backgroundColor: Theme.primary,
    borderColor: Theme.primary,
  },
  tripMetricTabText: {
    letterSpacing: 0.9,
    color: "rgba(255,255,255,0.66)",
  },
  tripMetricTabTextDarkActive: {
    color: Theme.textOnDark,
  },
  metricTagRailScrollMobile: {
    marginBottom: 2,
    borderRadius: 0,
    backgroundColor: "transparent",
    borderWidth: 0,
    borderColor: "transparent",
    minWidth: 0,
    alignSelf: "stretch",
    ...Platform.select({
      web: { width: "100%" as const, maxWidth: "100%" as const },
    }),
  },
  metricTagRailMobile: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 0,
    paddingTop: Layout.spacingMedium,
    paddingBottom: 4,
    marginTop: Layout.spacingMedium,
    borderTopWidth: 1,
    borderTopColor: Theme.separatorDark,
  },
  metricTagChipMobile: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
    backgroundColor: "rgba(255,255,255,0.05)",
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  metricTagChipMobileActive: {
    backgroundColor: Theme.screenBackground,
    borderColor: Theme.screenBackground,
  },
  metricTagLabelMobile: {
    fontSize: 8,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1.3,
    color: Theme.textOnDarkMuted,
  },
  metricTagLabelMobileActive: {
    color: Theme.textPrimaryDark,
  },
  metricTagCountMobile: {
    width: 24,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.10)",
  },
  metricTagCountMobileActive: {
    backgroundColor: "rgba(15,23,42,0.10)",
  },
  metricTagCountTextMobile: {
    fontSize: 9,
    fontWeight: "800",
    color: "rgba(255,255,255,0.72)",
    fontVariant: ["tabular-nums"],
  },
  metricTagCountTextMobileActive: {
    color: Theme.textPrimaryDark,
  },
  metricTabHintMobile: {
    marginTop: 2,
    fontSize: 9,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  metricTabHintMobileActive: {
    color: "rgba(241,245,249,0.75)",
  },
  metricTabCountMobile: {
    minWidth: 30,
    paddingHorizontal: 8,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15,23,42,0.08)",
    borderWidth: 1,
    borderColor: "rgba(15,23,42,0.12)",
  },
  metricTabCountMobileActive: {
    backgroundColor: "rgba(255,255,255,0.18)",
    borderColor: "rgba(255,255,255,0.28)",
  },
  metricTabCountTextMobile: {
    fontSize: 12,
    fontWeight: "900",
    color: Theme.textPrimaryDark,
  },
  metricTabCountTextMobileActive: {
    color: Theme.textOnDark,
  },
  tripMetricsGridWeb: {
    justifyContent: "flex-start",
    alignItems: "stretch",
    gap: 8,
    width: "100%" as const,
    paddingRight: 0,
  },
  tripMetricsGroupColumn: {
    flexDirection: "column",
    alignItems: "flex-start",
    flexShrink: 0,
    marginRight: 4,
  },
  tripMetricsGroupColumnWeb: {
    flex: 1,
    minWidth: 0,
    marginRight: 0,
  },
  tripMetricsGroupColumnAllWeb: {
    flex: 0.85,
    minWidth: 0,
    maxWidth: "12%" as const,
    marginRight: 0,
  },
  tripMetricsGroupColumnIntakeWeb: {
    flex: 1,
    minWidth: 0,
    maxWidth: "14%" as const,
    marginRight: 0,
  },
  tripMetricsGroupColumnInMotionWeb: {
    flex: 5,
    minWidth: 0,
    marginRight: 0,
  },
  metricGroupLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1.1,
    marginBottom: 6,
    paddingLeft: 2,
  },
  tripMetricsBundleRail: {
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "stretch",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: "rgba(15, 23, 42, 0.06)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(15, 23, 42, 0.08)",
  },
  tripMetricsBundleRailWeb: {
    width: "100%" as const,
  },
  tripHistoryPairRail: {
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "stretch",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: "rgba(15, 23, 42, 0.06)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(15, 23, 42, 0.08)",
  },
  tripHistoryPairRailWeb: {
    width: "100%" as const,
  },
  tripMetricBento: {
    backgroundColor: "transparent",
    padding: 0,
    overflow: "hidden",
    borderColor: "rgba(255, 255, 255, 0.12)",
  },
  tripMetricBentoActive: {
    borderColor: Theme.primary,
    borderWidth: 2,
    backgroundColor: "transparent",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 7,
    transform: [{ translateY: -2 }],
  },
  tripMetricBentoInactive: {
    backgroundColor: Theme.cardWhite,
    borderColor: Theme.cinematicCardBorder,
    ...Platform.select({
      web: {
        boxShadow: "0 1px 2px rgba(15,23,42,0.06), 0 4px 12px rgba(15,23,42,0.04)",
      },
      default: {
        shadowColor: Theme.shadow,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 6,
        elevation: 2,
      },
    }),
  },
  historyMetricAccentBar: {
    position: "absolute",
    left: 0,
    top: 12,
    bottom: 12,
    width: 3,
    borderTopRightRadius: 3,
    borderBottomRightRadius: 3,
    backgroundColor: Theme.primary,
    opacity: 0.85,
    zIndex: 2,
  },
  historyMetricAccentBarActive: {
    opacity: 1,
    top: 10,
    bottom: 10,
    width: 4,
  },
  tripMetricTileShrinkNone: {
    flexShrink: 0,
    alignSelf: "stretch",
  },
  metricCardHintAtBottom: {
    marginTop: "auto" as const,
  },
  metricBentoHeadRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  metricBentoIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.35)",
    backgroundColor: "rgba(15,23,42,0.45)",
  },
  metricBentoIconWrapLight: {
    borderColor: "rgba(15,23,42,0.18)",
    backgroundColor: "rgba(15,23,42,0.08)",
  },
  tripMetricTile: {
    width: 188,
    minHeight: Platform.OS === "web" ? 118 : 102,
    paddingVertical: Platform.OS === "web" ? 18 : 14,
    paddingHorizontal: 16,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
  },
  tripMetricTileHero: {
    width: 220,
    backgroundColor: Theme.darkBackground,
    borderColor: Theme.darkBackground,
  },
  tripMetricTileWeb: {
    flex: 1,
    flexBasis: 0,
    width: "auto" as const,
    minWidth: 110,
    minHeight: 124,
  },
  tripMetricTileHeroWeb: {
    width: 248,
  },
  tripMetricTileActive: {
    borderColor: Theme.primary,
    backgroundColor: Theme.surface,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 2,
  },
  tripMetricTileHeroActive: {
    backgroundColor: Theme.darkBackground,
    borderColor: Theme.primary,
  },
  historyMetricCardShell: {
    padding: 0,
    overflow: "hidden",
    backgroundColor: "transparent",
  },
  /** Bento content: flex so hint can sit at bottom when row stretch aligns card heights. */
  historyMetricInner: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    paddingVertical: 14,
    paddingHorizontal: 15,
    paddingLeft: 18,
    zIndex: 1,
    width: "100%" as const,
    flexDirection: "column",
  },
  /** Bento tile typography — tuned for 188px card width, left-aligned, even vertical rhythm. */
  metricBentoValue: {
    fontSize: Platform.OS === "web" ? 28 : 22,
    fontWeight: "900",
    fontStyle: "italic",
    letterSpacing: -0.4,
    lineHeight: Platform.OS === "web" ? 31 : 26,
    marginBottom: 4,
    textAlign: "left" as const,
  },
  metricBentoValueOnDark: {
    color: Theme.textOnDark,
  },
  metricBentoValueOnLight: {
    color: Theme.textPrimaryDark,
  },
  metricBentoLabel: {
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    lineHeight: 13,
    textAlign: "left" as const,
    width: "100%" as const,
  },
  metricBentoLabelOnDark: {
    color: "rgba(255,255,255,0.88)",
  },
  metricBentoLabelOnLight: {
    color: Theme.textPrimaryDark,
  },
  metricBentoLabelOnDarkActive: {
    color: "rgba(255,255,255,0.97)",
  },
  metricBentoSubtext: {
    fontSize: 9,
    fontWeight: "500",
    lineHeight: 12,
    textAlign: "left" as const,
    width: "100%" as const,
  },
  metricBentoSubtextOnDark: {
    color: "rgba(255,255,255,0.55)",
  },
  metricBentoSubtextOnLight: {
    color: Theme.textSecondary,
  },
  historyMetricWatermarkOrbs: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
  },
  historyWmLightBlobA: {
    position: "absolute",
    top: -44,
    right: -32,
    width: 128,
    height: 128,
    borderRadius: 64,
    backgroundColor: "rgba(15, 23, 42, 0.05)",
  },
  historyWmLightBlobB: {
    position: "absolute",
    bottom: -26,
    left: -20,
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "rgba(26, 35, 126, 0.06)",
  },
  historyWmReceiveBlobA: {
    backgroundColor: "rgba(21, 128, 61, 0.1)",
  },
  historyWmReceiveBlobB: {
    backgroundColor: "rgba(4, 120, 87, 0.07)",
  },
  historyWmClearedPayBlobA: {
    backgroundColor: "rgba(21, 128, 61, 0.08)",
  },
  historyWmClearedPayBlobB: {
    backgroundColor: "rgba(15, 23, 42, 0.06)",
  },
  historyWmPayBlobA: {
    backgroundColor: "rgba(232, 33, 39, 0.1)",
  },
  historyWmPayBlobB: {
    backgroundColor: "rgba(15, 23, 42, 0.06)",
  },
  historyWmHeroBlobA: {
    position: "absolute",
    top: -56,
    right: -40,
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: "rgba(255, 255, 255, 0.07)",
  },
  historyWmHeroBlobB: {
    position: "absolute",
    bottom: -28,
    left: -32,
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "rgba(99, 102, 241, 0.12)",
  },
  historyMetricTileAttention: {
    borderColor: Theme.teslaRed,
    borderWidth: 1.5,
    shadowColor: "rgba(220, 38, 38, 0.2)",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 3,
  },
  historyMetricAmountOnDark: {
    color: "rgba(248, 250, 252, 0.55)",
  },
  historyMetricAmountOnLight: {
    color: Theme.textSecondary,
  },
  historyMetricTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  historyMetricAmount: {
    marginTop: 0,
    flexShrink: 1,
    fontSize: 12,
    fontWeight: "900",
    color: Theme.textSecondary,
    letterSpacing: -0.1,
  },
  historyMetricAmountBento: {
    fontSize: 10.5,
    lineHeight: 13.5,
  },
  historyMetricAmountDue: {
    color: Theme.teslaRed,
  },
  tripMetricCount: {
    fontSize: 24,
    fontWeight: "900",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.6,
    marginBottom: 6,
  },
  tripMetricCountHero: {
    color: Theme.textOnDark,
  },
  tripMetricCountActive: {
    color: Theme.textOnDark,
  },
  tripMetricCountHeroActive: {
    color: Theme.textOnDark,
  },
  tripMetricTitle: {
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: Theme.textMuted,
    lineHeight: 15,
  },
  tripMetricTitleHero: {
    color: "rgba(255,255,255,0.84)",
  },
  tripMetricTitleActive: {
    color: Theme.textPrimaryDark,
  },
  tripMetricTitleHeroActive: {
    color: "rgba(255,255,255,0.92)",
  },
  tripMetricHint: {
    marginTop: 6,
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textSecondary,
    lineHeight: 13,
  },
  tripMetricHintHero: {
    color: "rgba(255,255,255,0.56)",
  },
  tripsBodyStatusRowWeb: {
    flexDirection: "row",
    justifyContent: "center",
    paddingBottom: 10,
    marginBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  tripsBodyStatusScroll: {
    flexGrow: 0,
    marginBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  tripsBodyStatusScrollContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    paddingVertical: 4,
    gap: 4,
  },
  tripsBodyStatusTabWeb: {
    flex: 1,
    minWidth: 72,
    position: "relative" as const,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  tripsBodyStatusTab: {
    position: "relative" as const,
    minWidth: 72,
    paddingVertical: 8,
    paddingHorizontal: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  tripsBodyStatusTabActive: {},
  tripsBodyStatusTabText: {
    fontSize: 8,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1.5,
    color: Theme.textMuted,
  },
  tripsBodyStatusTabTextActive: {
    color: Theme.textPrimaryDark,
  },
  tripsBodyStatusUnderline: {
    position: "absolute",
    bottom: 0,
    left: 8,
    right: 8,
    height: 2,
    backgroundColor: Theme.teslaRed,
    borderRadius: 1,
  },
  tripsBodyDateFilterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingTop: 2,
  },
  tripsBodyDateChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    flexDirection: "row",
    alignItems: "center",
  },
  tripsBodyDateChipActive: {
    backgroundColor: Theme.screenBackground,
    borderColor: Theme.textPrimaryDark,
  },
  tripsBodyDateChipText: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  tripsBodyDateChipTextActive: {
    color: Theme.textPrimaryDark,
  },
  tripsBodyDateChipMobileDark: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: "rgba(255,255,255,0.10)",
  },
  tripsBodyDateChipActiveMobileDark: {
    backgroundColor: "rgba(255,255,255,0.14)",
    borderColor: "rgba(255,255,255,0.22)",
  },
  tripsBodyDateChipTextMobileDark: {
    color: "rgba(255,255,255,0.62)",
  },
  tripsBodyDateChipTextActiveMobileDark: {
    color: Theme.textOnDark,
  },
  tripsBodyDateRangeIconBtnMobileDark: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderColor: "rgba(255,255,255,0.12)",
  },
  tripsBodyDateRangeIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  empty: {
    padding: 24,
    textAlign: "center",
    color: Theme.textSecondary,
  },
  fabWrap: {
    position: "absolute",
  },
  card: {
    borderWidth: 1,
    borderColor: Theme.borderLight,
    padding: 12,
    marginBottom: 10,
    backgroundColor: Theme.screenBackground,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 10,
  },
  cardTopRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  sourcePill: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 1,
    backgroundColor: Theme.surfaceBorder,
  },
  sourcePillShared: {
    backgroundColor: Theme.positiveMuted,
    borderWidth: 1,
    borderColor: Theme.darkGreen,
  },
  tripTypePillAggregate: {
    backgroundColor: Theme.aggregatePillBg,
    borderWidth: 1,
    borderColor: Theme.aggregatePillBorder,
  },
  tripTypePillTextAggregate: {
    color: Theme.aggregatePillText,
  },
  sourcePillText: {
    fontSize: 5,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.5,
  },
  cardClient: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    flex: 1,
    marginRight: 8,
  },
  cardId: { fontSize: 6, fontWeight: "700", color: Theme.textMutedDemo },
  stagePill: {
    backgroundColor: Theme.buttonPrimary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 1,
  },
  stageText: {
    fontSize: 6,
    fontWeight: "800",
    color: Theme.buttonPrimaryText,
    letterSpacing: 0.5,
  },
  cardRoute: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Theme.surfaceLight,
    marginBottom: 12,
  },
  routeCol: { flex: 1 },
  routeColRight: { alignItems: "flex-end" },
  routeLabel: {
    fontSize: 5,
    fontWeight: "700",
    color: Theme.textMutedDemo,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  routeValue: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
  },
  cardMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
    marginBottom: 8,
  },
  metaCol: { flex: 1 },
  metaColRight: { alignItems: "flex-end" },
  metaLabel: {
    fontSize: 5,
    fontWeight: "700",
    color: Theme.textMutedDemo,
    textTransform: "uppercase",
    marginBottom: 1,
  },
  metaValue: {
    fontSize: 8,
    fontWeight: "600",
    color: Theme.textSecondary,
    textTransform: "uppercase",
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardMeta: {
    fontSize: 7,
    fontWeight: "700",
    color: Theme.textMutedDemo,
    textTransform: "uppercase",
    flex: 1,
  },
  cardMetaTotal: { color: Theme.textMutedDemo, fontWeight: "600" },
  cardDue: { fontSize: 10, fontWeight: "800", color: Theme.textPrimaryDark },
  cardDueLabel: { fontSize: 5, color: Theme.teslaRed, marginLeft: 2 },
});
