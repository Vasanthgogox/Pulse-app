/**
 * Trips Control — demo2 trips tab. Active | History, trip cards, Add Trip.
 * Private Book = driver/vehicle assigned by you; Shared Ledger = assigned by another user.
 */
import { CenteredLoadingView } from "@/components/CenteredLoadingView";
import { DateRangePickerModal } from "@/components/DateRangePickerModal";
import { FinanceFAB } from "@/components/FinanceFAB";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { useAuth } from "@/contexts/AuthContext";
import { useTabBarAwareScrollProps } from "@/contexts/DemoTabBarScrollContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import type { LedgerRow } from "@/features/finance/services/finance.service";
import {
  buildTripHubPartyMetaByTripId,
  summarizeTripLedgerForHub,
  TripsHubTableView,
  TripsHubTripCard,
  type TripRow,
} from "@/features/trips";
import {
  TRIP_METRIC_ORDER,
  type TripMetricId,
  classifyTripMetric,
  countTripsByMetric,
  isTripCancelledForHub,
} from "@/features/trips/utils/tripHubMetrics";
import { canAccessTrips, getCapabilitiesFromProfile } from "@/lib/capabilities";
import { usePaginatedScroll } from "@/lib/usePaginatedScroll";
import { isAggregateTrip } from "@/lib/driverUtils";
import { formatLedgerDate } from "@/lib/format";
import {
  useAssignmentAuditQuery,
  useClientsQuery,
  useDriversQuery,
  useRealtimeTransactionsInvalidation,
  useRealtimeTripsInvalidation,
  useShipperDisplayNamesQuery,
  useSuppliersQuery,
  useTransactionsQuery,
  useTripsQuery,
} from "@/lib/queries";
import { useLinkedOrgProfileMap } from "@/lib/useLinkedOrgProfileMap";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import {
    Modal,
    NativeScrollEvent,
    NativeSyntheticEvent,
    Platform,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    useWindowDimensions,
    View,
    type TextStyle,
    type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase";

type SupplyFilter = "all" | "asset" | "aggregated";
type SortBy =
  | "date_desc"
  | "date_asc"
  | "revenue_desc"
  | "revenue_asc"
  | "client_asc"
  | "client_desc";
type PaymentFilter = "all" | "pending" | "partial" | "paid";
type DateFilter =
  | "all"
  | "today"
  | "yesterday"
  | "tomorrow"
  | "this_week"
  | "this_month"
  | "custom";

type TripsListLayout = "cards" | "table";

const TRIPS_PAGE_BG = "#f4f5f7";

export default function TripsScreen() {
  const { width } = useWindowDimensions();
  const isLargeScreen = Platform.OS === "web" && width >= 1024;
  const isMobile = width < 560;
  const insets = useSafeAreaInsets();
  const tabBarScrollProps = useTabBarAwareScrollProps();
  const screenTopPad =
    Platform.OS === "web" ? 0 : insets.top + Layout.headerPaddingBelowInset;
  const tripsScrollBottomPad =
    24 + Layout.demoTabBarScrollBottomInset + insets.bottom + 16;
  const router = useRouter();
  const { t: tr } = useLanguage();
  const { currentOrganization } = useOrganization();
  const { profile } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [tripFilter, setTripFilter] = useState<"Active" | "History">("Active");
  const [searchQuery, setSearchQuery] = useState("");
  const queryClient = useQueryClient();
  const [activeMetricTab, setActiveMetricTab] =
    useState<TripMetricId>("unassigned");
  const [supplyFilter, setSupplyFilter] = useState<SupplyFilter>("all");
  const [sortBy, setSortBy] = useState<SortBy>("date_desc");
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>("all");
  const [loadTypeFilter, setLoadTypeFilter] = useState<string>("all");
  const [dateRangeFilter, setDateRangeFilter] = useState<DateFilter>("all");
  const [customDateFrom, setCustomDateFrom] = useState<string | null>(null);
  const [customDateTo, setCustomDateTo] = useState<string | null>(null);
  const [showDateRangePicker, setShowDateRangePicker] = useState(false);
  const [showSortModal, setShowSortModal] = useState(false);
  const [sortAnchorY, setSortAnchorY] = useState(0);
  const [listLayout, setListLayout] = useState<TripsListLayout>("cards");

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
  const { refetch: refetchAssignment } = useAssignmentAuditQuery(tripIds);

  useRealtimeTripsInvalidation(orgId);
  useRealtimeTransactionsInvalidation(orgId);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      refetchTrips(),
      refetchTransactions(),
      refetchAssignment(),
      queryClient.invalidateQueries({
        queryKey: ["q", "trips", "doc-trip-ids", orgId ?? ""],
      }),
    ]);
    setRefreshing(false);
  }, [refetchTrips, refetchTransactions, refetchAssignment, queryClient, orgId]);

  useFocusEffect(
    useCallback(() => {
      onRefresh();
    }, [onRefresh])
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
              !isCompletedStatus(t.status) &&
              !isTripCancelledForHub(t.status),
          ),
    [showCompletedList, trips],
  );

  /** Active ops trips only — used to resolve which trips have any uploaded document (POD split). */
  const activeOpsTripIdsSorted = useMemo(() => {
    if (showCompletedList) return "";
    const ids = tripsByStatus.map((t) => t.id).sort();
    return ids.join(",");
  }, [showCompletedList, tripsByStatus]);

  const { data: tripIdsWithDocuments = new Set<string>() } = useQuery({
    queryKey: ["q", "trips", "doc-trip-ids", orgId ?? "", activeOpsTripIdsSorted],
    enabled: !!orgId && activeOpsTripIdsSorted.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const ids = activeOpsTripIdsSorted.split(",").filter(Boolean);
      if (ids.length === 0) return new Set<string>();
      const next = new Set<string>();
      const chunkSize = 200;
      for (let i = 0; i < ids.length; i += chunkSize) {
        const slice = ids.slice(i, i + chunkSize);
        const { data, error } = await supabase()
          .from("trip_documents")
          .select("trip_id")
          .in("trip_id", slice);
        if (error) throw error;
        for (const row of data ?? []) {
          const tid = (row as { trip_id?: string }).trip_id;
          if (tid) next.add(tid);
        }
      }
      return next;
    },
  });

  const metricCounts = useMemo(
    () => countTripsByMetric(tripsByStatus, tripIdsWithDocuments),
    [tripsByStatus, tripIdsWithDocuments],
  );

  // Apply trip-type and text filters for both tabs; metric bucket applies only on Active.
  const filtered = useMemo(() => {
    let list = tripsByStatus;
    if (!showCompletedList) {
      list = list.filter(
        (t) => classifyTripMetric(t, tripIdsWithDocuments) === activeMetricTab,
      );
    }
    if (supplyFilter !== "all") {
      list = list.filter((t) => {
        const aggregateTrip = isAggregateTrip(t);
        if (supplyFilter === "aggregated") return aggregateTrip;
        return !aggregateTrip;
      });
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
      const nowBase = new Date();
      const startOfDay = new Date(
        nowBase.getFullYear(),
        nowBase.getMonth(),
        nowBase.getDate(),
      ).getTime();
      const endOfDay = startOfDay + 24 * 60 * 60 * 1000;
      const yesterdayStart = startOfDay - 24 * 60 * 60 * 1000;
      const yesterdayEnd = startOfDay;
      const tomorrowStart = endOfDay;
      const tomorrowEnd = tomorrowStart + 24 * 60 * 60 * 1000;

      const weekCursor = new Date(nowBase);
      const startOfWeek = new Date(
        weekCursor.setDate(weekCursor.getDate() - weekCursor.getDay()),
      ).getTime();
      const startOfMonth = new Date(
        nowBase.getFullYear(),
        nowBase.getMonth(),
        1,
      ).getTime();

      let customFromMs: number | null = null;
      let customToMs: number | null = null;
      if (dateRangeFilter === "custom" && customDateFrom && customDateTo) {
        const [fy, fm, fd] = customDateFrom.split("-").map(Number);
        const [ty, tm, td] = customDateTo.split("-").map(Number);
        customFromMs = new Date(fy, fm - 1, fd).getTime();
        customToMs = new Date(ty, tm - 1, td).getTime() + 24 * 60 * 60 * 1000;
      }

      list = list.filter((t) => {
        const date = new Date(t.pickup_date || t.created_at).getTime();
        if (dateRangeFilter === "today")
          return date >= startOfDay && date < endOfDay;
        if (dateRangeFilter === "yesterday")
          return date >= yesterdayStart && date < yesterdayEnd;
        if (dateRangeFilter === "tomorrow")
          return date >= tomorrowStart && date < tomorrowEnd;
        if (dateRangeFilter === "this_week") return date >= startOfWeek;
        if (dateRangeFilter === "this_month") return date >= startOfMonth;
        if (dateRangeFilter === "custom") {
          if (customFromMs == null || customToMs == null) return true;
          return date >= customFromMs && date < customToMs;
        }
        return true;
      });
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
          return (
            new Date(b.pickup_date || b.created_at).getTime() -
            new Date(a.pickup_date || a.created_at).getTime()
          );
        case "date_asc":
          return (
            new Date(a.pickup_date || a.created_at).getTime() -
            new Date(b.pickup_date || b.created_at).getTime()
          );
        case "revenue_desc":
          return (b.client_price || 0) - (a.client_price || 0);
        case "revenue_asc":
          return (a.client_price || 0) - (b.client_price || 0);
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
    activeMetricTab,
    tripIdsWithDocuments,
    supplyFilter,
    searchQuery,
    shipperNameByTripId,
    showCompletedList,
    sortBy,
    paymentFilter,
    loadTypeFilter,
    dateRangeFilter,
    customDateFrom,
    customDateTo,
  ]);

  const tripsTableResetKey = useMemo(
    () =>
      [
        listLayout,
        filtered.length,
        searchQuery,
        tripFilter,
        activeMetricTab,
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
      listLayout,
      filtered.length,
      searchQuery,
      tripFilter,
      activeMetricTab,
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

  const {
    visible: tripsTableVisible,
    onScroll: onTripsTablePaginatedScroll,
  } = usePaginatedScroll(filtered, {
    pageSize: 15,
    resetKey: tripsTableResetKey,
    enabled: listLayout === "table",
  });

  const handleTripsMainScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const p = tabBarScrollProps as {
        onScroll?: (ev?: NativeSyntheticEvent<NativeScrollEvent>) => void;
      };
      p.onScroll?.(e);
      if (listLayout === "table") onTripsTablePaginatedScroll(e);
    },
    [tabBarScrollProps, listLayout, onTripsTablePaginatedScroll],
  );

  const loadTypeOptions = useMemo(() => {
    const types = new Set<string>();
    trips.forEach((t) => {
      if (t.load_type) types.add(t.load_type.trim());
    });
    return Array.from(types).sort();
  }, [trips]);

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

  const tripHubPartyMetaByTripId = useMemo(
    () =>
      buildTripHubPartyMetaByTripId(
        trips,
        clients,
        suppliers,
        drivers,
        transactions,
      ),
    [trips, clients, suppliers, drivers, transactions],
  );

  const mainTabs = useMemo(
    () => [
      {
        id: "active" as const,
        label: tr("active"),
        isActive: tripFilter === "Active",
        onPress: () => setTripFilter("Active"),
      },
      {
        id: "history" as const,
        label: tr("history"),
        isActive: tripFilter === "History",
        onPress: () => setTripFilter("History"),
      },
    ],
    [tr, tripFilter],
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
        unassigned: {
          title: tr("tripMetricUnassigned"),
          hint: tr("tripMetricHintUnassigned"),
        },
        assigned: {
          title: tr("tripAssigned"),
          hint: tr("tripMetricHintLoading"),
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
        pod_pending: {
          title: tr("tripMetricPodPending"),
          hint: tr("tripMetricHintPodPending"),
        },
      }) satisfies Record<
        TripMetricId,
        { title: string; hint: string }
      >,
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

  if (!canAccess) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <Text style={styles.message}>{tr("noAccessTrips")}</Text>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.container,
        { paddingTop: screenTopPad },
      ]}
    >
      <View style={styles.headerBlock}>
        {Platform.OS === "web" ? (
          <View style={styles.tabRowWeb}>
            {mainTabs.map((tab) => (
              <TouchableOpacity
                key={tab.id}
                style={[styles.tabWeb, tab.isActive && styles.tabActive]}
                onPress={tab.onPress}
                activeOpacity={0.7}
              >
                <Text
                  style={[styles.tabText, tab.isActive && styles.tabTextActive]}
                >
                  {tab.label}
                </Text>
                {tab.isActive ? <View style={styles.tabUnderline} /> : null}
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabRowScrollContent}
            style={styles.tabRowScroll}
          >
            {mainTabs.map((tab) => (
              <TouchableOpacity
                key={tab.id}
                style={[styles.tab, tab.isActive && styles.tabActive]}
                onPress={tab.onPress}
                activeOpacity={0.7}
              >
                <Text
                  style={[styles.tabText, tab.isActive && styles.tabTextActive]}
                >
                  {tab.label}
                </Text>
                {tab.isActive ? <View style={styles.tabUnderline} /> : null}
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* SUB-TABS: ALL | ASSET | AGGREGATED */}
        {Platform.OS === "web" ? (
          <View style={styles.tabRowWebSub}>
            {subTabs.map((tab) => (
              <TouchableOpacity
                key={tab.id}
                style={[styles.tabWeb, tab.isActive && styles.tabActive]}
                onPress={tab.onPress}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.tabText,
                    { fontSize: 7 },
                    tab.isActive && styles.tabTextActive,
                  ]}
                >
                  {tab.label}
                </Text>
                {tab.isActive ? <View style={styles.tabUnderline} /> : null}
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabRowScrollContent}
            style={styles.tabRowScrollSub}
          >
            {subTabs.map((tab) => (
              <TouchableOpacity
                key={tab.id}
                style={[styles.tab, tab.isActive && styles.tabActive]}
                onPress={tab.onPress}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.tabText,
                    { fontSize: 7 },
                    tab.isActive && styles.tabTextActive,
                  ]}
                >
                  {tab.label}
                </Text>
                {tab.isActive ? <View style={styles.tabUnderline} /> : null}
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        <View style={styles.tripsToolbar}>
          <View style={styles.tripsLayoutToggle} accessibilityRole="tablist">
            <TouchableOpacity
              style={[
                styles.tripsLayoutToggleBtn,
                listLayout === "cards" && styles.tripsLayoutToggleBtnActive,
              ]}
              onPress={() => setListLayout("cards")}
              activeOpacity={0.85}
              accessibilityRole="tab"
              accessibilityState={{ selected: listLayout === "cards" }}
              accessibilityLabel={tr("tripsViewCards")}
            >
              <FontAwesome
                name="th-large"
                size={14}
                color={
                  listLayout === "cards"
                    ? Theme.textPrimaryDark
                    : Theme.textOnDarkMuted
                }
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.tripsLayoutToggleBtn,
                listLayout === "table" && styles.tripsLayoutToggleBtnActive,
              ]}
              onPress={() => setListLayout("table")}
              activeOpacity={0.85}
              accessibilityRole="tab"
              accessibilityState={{ selected: listLayout === "table" }}
              accessibilityLabel={tr("tripsViewTable")}
            >
              <FontAwesome
                name="list"
                size={14}
                color={
                  listLayout === "table"
                    ? Theme.textPrimaryDark
                    : Theme.textOnDarkMuted
                }
              />
            </TouchableOpacity>
          </View>
          <View
            style={[
              styles.tripsSearchWrap,
              Platform.OS === "web" && styles.tripsSearchWrapWeb,
              isLargeScreen && styles.tripsSearchWrapRow,
            ]}
          >
            <FontAwesome
              name="search"
              size={12}
              color={Theme.textOnDarkMuted}
              style={styles.tripsSearchIcon}
            />
            <TextInput
              style={[
                styles.tripsSearchInput,
                Platform.OS === "web" && styles.tripsSearchInputWeb,
              ]}
              placeholder={
                isLargeScreen ? "Find by name..." : tr("searchTripsPlaceholder")
              }
              placeholderTextColor={Theme.textOnDarkMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              returnKeyType="search"
              autoCorrect={false}
              spellCheck={false}
              autoComplete="off"
              maxLength={120}
            />
          </View>
          <View style={styles.tripsToolbarActions}>
            <TouchableOpacity
              style={[
                styles.tripsFilterIconBtn,
                Platform.OS === "web" && styles.tripsSupplyChipWeb,
              ]}
              onPress={(e) => {
                // @ts-ignore - capture location for dropdown anchor on native
                const target = e.currentTarget;
                if (target && typeof target.measureInWindow === "function") {
                  target.measureInWindow(
                    (_x: number, y: number, _w: number, h: number) => {
                      setSortAnchorY(y + h + 6);
                      setShowSortModal(true);
                    },
                  );
                } else {
                  setSortAnchorY(100);
                  setShowSortModal(true);
                }
              }}
              activeOpacity={0.7}
            >
              <FontAwesome name="sort" size={12} color={Theme.textOnDark} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <Modal
        visible={showSortModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSortModal(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowSortModal(false)}>
          <View style={styles.modalOverlay}>
            <View
              style={[
                styles.sortModalCard,
                { top: sortAnchorY || insets.top + 100 },
              ]}
            >
              <View style={styles.modalHandle} />
              <ScrollView
                showsVerticalScrollIndicator={false}
                style={{ maxHeight: width > 1024 ? 600 : 450 }}
              >
                {/* SORT BY SECTION */}
                <View style={styles.modalSectionRow}>
                  <FontAwesome
                    name="sort"
                    size={11}
                    color={Theme.teslaRed}
                    style={styles.modalSectionIcon}
                  />
                  <Text style={styles.modalSectionLabel}>{tr("sortBy")}</Text>
                </View>
                <View style={styles.filterChipRow}>
                  {sortOptions.map((opt) => (
                    <TouchableOpacity
                      key={opt.id}
                      style={[
                        styles.filterChip,
                        sortBy === opt.id && styles.filterChipActive,
                      ]}
                      onPress={() => setSortBy(opt.id)}
                    >
                      <FontAwesome
                        name={opt.icon}
                        size={10}
                        color={
                          sortBy === opt.id ? "#fff" : Theme.textOnDarkMuted
                        }
                        style={{ marginRight: 4 }}
                      />
                      <Text
                        style={[
                          styles.filterChipText,
                          sortBy === opt.id && styles.filterChipTextActive,
                        ]}
                      >
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <View style={styles.modalDivider} />

                {/* DATE FILTER SECTION */}
                <View style={styles.modalSectionRow}>
                  <FontAwesome
                    name="calendar"
                    size={11}
                    color={Theme.teslaRed}
                    style={styles.modalSectionIcon}
                  />
                  <Text style={styles.modalSectionLabel}>
                    {tr("dateFilter")}
                  </Text>
                </View>
                <View style={styles.filterChipRow}>
                  {(
                    [
                      "all",
                      "today",
                      "tomorrow",
                      "this_week",
                      "this_month",
                    ] as const
                  ).map((f) => (
                    <TouchableOpacity
                      key={f}
                      style={[
                        styles.filterChip,
                        dateRangeFilter === f && styles.filterChipActive,
                      ]}
                      onPress={() => setDateRangeFilter(f)}
                    >
                      <Text
                        style={[
                          styles.filterChipText,
                          dateRangeFilter === f && styles.filterChipTextActive,
                        ]}
                      >
                        {f === "all" ? tr("all") : tr(`${f}Trips`)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <View style={styles.modalDivider} />

                {/* PAYMENT STATUS SECTION */}
                <View style={styles.modalSectionRow}>
                  <FontAwesome
                    name="money"
                    size={11}
                    color={Theme.teslaRed}
                    style={styles.modalSectionIcon}
                  />
                  <Text style={styles.modalSectionLabel}>
                    {tr("paymentStatus")}
                  </Text>
                </View>
                <View style={styles.filterChipRow}>
                  {(["all", "pending", "partial", "paid"] as const).map((f) => (
                    <TouchableOpacity
                      key={f}
                      style={[
                        styles.filterChip,
                        paymentFilter === f && styles.filterChipActive,
                      ]}
                      onPress={() => setPaymentFilter(f)}
                    >
                      <Text
                        style={[
                          styles.filterChipText,
                          paymentFilter === f && styles.filterChipTextActive,
                        ]}
                      >
                        {f === "all" ? tr("all") : tr(`${f}Payment`)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {loadTypeOptions.length > 0 && (
                  <>
                    <View style={styles.modalDivider} />
                    <View style={styles.modalSectionRow}>
                      <FontAwesome
                        name="cube"
                        size={11}
                        color={Theme.teslaRed}
                        style={styles.modalSectionIcon}
                      />
                      <Text style={styles.modalSectionLabel}>
                        {tr("loadType")}
                      </Text>
                    </View>
                    <View style={styles.filterChipRow}>
                      <TouchableOpacity
                        style={[
                          styles.filterChip,
                          loadTypeFilter === "all" && styles.filterChipActive,
                        ]}
                        onPress={() => setLoadTypeFilter("all")}
                      >
                        <Text
                          style={[
                            styles.filterChipText,
                            loadTypeFilter === "all" &&
                              styles.filterChipTextActive,
                          ]}
                        >
                          {tr("all")}
                        </Text>
                      </TouchableOpacity>
                      {loadTypeOptions.map((lt) => (
                        <TouchableOpacity
                          key={lt}
                          style={[
                            styles.filterChip,
                            loadTypeFilter === lt && styles.filterChipActive,
                          ]}
                          onPress={() => setLoadTypeFilter(lt)}
                        >
                          <Text
                            style={[
                              styles.filterChipText,
                              loadTypeFilter === lt &&
                                styles.filterChipTextActive,
                            ]}
                          >
                            {lt}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                )}

                <View style={{ height: 20 }} />
                <TouchableOpacity
                  style={styles.modalApplyBtn}
                  onPress={() => setShowSortModal(false)}
                >
                  <Text style={styles.modalApplyBtnText}>Apply Filters</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

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

      {loading ? (
        <View style={styles.scroll}>
          <CenteredLoadingView message={tr("loading")} />
        </View>
      ) : (
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
            listLayout === "table"
              ? 100
              : tabBarScrollProps.scrollEventThrottle ?? 64
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Theme.primary}
            />
          }
        >
          <View style={styles.tripsBodyFiltersBleed}>
            {tripFilter === "Active" ? (
              <View
                style={[
                  styles.tripMetricsGrid,
                  isLargeScreen && styles.tripMetricsGridWeb,
                ]}
              >
                {TRIP_METRIC_ORDER.map((metricId) => {
                  const count = metricCounts[metricId];
                  const active = activeMetricTab === metricId;
                  const copy = tripMetricCopy[metricId];
                  return (
                    <TouchableOpacity
                      key={metricId}
                      style={[
                        styles.tripMetricTile,
                        isLargeScreen && styles.tripMetricTileWeb,
                        active && styles.tripMetricTileActive,
                      ]}
                      onPress={() => setActiveMetricTab(metricId)}
                      activeOpacity={0.85}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={`${copy.title}, ${count} trips`}
                    >
                      <Text
                        style={[
                          styles.tripMetricCount,
                          active && styles.tripMetricCountActive,
                        ]}
                      >
                        {count}
                      </Text>
                      <Text
                        style={[
                          styles.tripMetricTitle,
                          active && styles.tripMetricTitleActive,
                        ]}
                        numberOfLines={2}
                      >
                        {copy.title}
                      </Text>
                      <Text style={styles.tripMetricHint} numberOfLines={2}>
                        {copy.hint}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : null}

            <View style={styles.tripsBodyDateFilterRow}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.tripsDateChipsContent}
                style={styles.tripsDateChipsScroll}
              >
                {(
                  [
                    { id: "all" as const, label: tr("all") },
                    { id: "today" as const, label: tr("todayTrips") },
                    { id: "yesterday" as const, label: tr("yesterdayTrips") },
                    { id: "this_week" as const, label: tr("thisWeekTrips") },
                    { id: "this_month" as const, label: tr("thisMonthTrips") },
                  ] as const
                ).map(({ id, label }) => (
                  <TouchableOpacity
                    key={id}
                    style={[
                      styles.tripsBodyDateChip,
                      dateRangeFilter === id && styles.tripsBodyDateChipActive,
                      Platform.OS === "web" && styles.tripsSupplyChipWeb,
                    ]}
                    onPress={() => {
                      setDateRangeFilter(id);
                      setCustomDateFrom(null);
                      setCustomDateTo(null);
                    }}
                    activeOpacity={0.85}
                  >
                    <Text
                      style={[
                        styles.tripsBodyDateChipText,
                        dateRangeFilter === id &&
                          styles.tripsBodyDateChipTextActive,
                      ]}
                      numberOfLines={1}
                    >
                      {label}
                    </Text>
                  </TouchableOpacity>
                ))}
                {dateRangeFilter === "custom" && customDateFrom && customDateTo ? (
                  <View
                    style={[styles.tripsBodyDateChip, styles.tripsDateChipCustom]}
                  >
                    <FontAwesome
                      name="calendar"
                      size={9}
                      color={Theme.textOnDark}
                      style={styles.tripsDateChipCustomIcon}
                    />
                    <Text
                      style={[
                        styles.tripsDateChipText,
                        styles.tripsDateChipTextActive,
                      ]}
                      numberOfLines={1}
                    >
                      {formatLedgerDate(customDateFrom).toUpperCase()} →{" "}
                      {formatLedgerDate(customDateTo).toUpperCase()}
                    </Text>
                    <TouchableOpacity
                      onPress={() => {
                        setDateRangeFilter("all");
                        setCustomDateFrom(null);
                        setCustomDateTo(null);
                      }}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      style={styles.tripsDateChipCustomClose}
                    >
                      <FontAwesome
                        name="times"
                        size={9}
                        color={Theme.textOnDark}
                      />
                    </TouchableOpacity>
                  </View>
                ) : null}
              </ScrollView>
              <TouchableOpacity
                style={[
                  styles.tripsBodyDateRangeIconBtn,
                  dateRangeFilter === "custom" &&
                    styles.tripsDateRangeIconBtnActive,
                  Platform.OS === "web" && styles.tripsSupplyChipWeb,
                ]}
                onPress={() => setShowDateRangePicker(true)}
                activeOpacity={0.8}
                accessibilityLabel={tr("dateRangeLabel")}
                accessibilityRole="button"
              >
                <FontAwesome
                  name="calendar"
                  size={12}
                  color={
                    dateRangeFilter === "custom"
                      ? Theme.textOnDark
                      : Theme.textPrimaryDark
                  }
                />
              </TouchableOpacity>
            </View>
          </View>

          {filtered.length === 0 ? (
            <Text style={styles.empty}>
              {showCompletedList ? tr("noCompletedTrips") : tr("noTripsYet")}
            </Text>
          ) : listLayout === "table" ? (
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
                      isMobile ? 1240 : 1580,
                    ),
                  },
                ]}
              >
                <TripsHubTableView
                  trips={tripsTableVisible}
                  currentOrganizationId={currentOrganization?.id ?? null}
                  getStageLabel={getStageLabelForTrip}
                  transactionsByTripId={transactionsByTripId}
                  onOpenTripDetails={(trip) =>
                    router.push(`/trip/${trip.id}` as const)
                  }
                  tr={tr}
                  clientNameByTripId={shipperNameByTripId}
                  linkedOrgByOrganizationId={linkedOrgByOrganizationId}
                  partyMetaByTripId={tripHubPartyMetaByTripId}
                />
              </View>
            </ScrollView>
          ) : (
            <View style={isLargeScreen ? styles.gridContainer : undefined}>
              {filtered.map((t) => {
                const stage = getStageLabelForTrip(t);
                const displayClientName =
                  shipperNameByTripId[t.id] ?? t.client_name ?? "—";
                const hubLedger = summarizeTripLedgerForHub(
                  transactionsByTripId.get(t.id) ?? [],
                );
                const party = tripHubPartyMetaByTripId.get(t.id);
                return (
                  <View
                    key={t.id}
                    style={isLargeScreen ? styles.gridItem : undefined}
                  >
                    <TripsHubTripCard
                      trip={t}
                      currentOrganizationId={currentOrganization?.id ?? null}
                      displayClientName={displayClientName}
                      displaySupplierName={party?.displaySupplierName ?? ""}
                      clientAvatarUrl={party?.clientAvatarUrl ?? null}
                      clientAvatarSeed={party?.clientAvatarSeed ?? null}
                      clientAvatarFallbackSeed={party?.clientFallbackSeed}
                      supplierAvatarUrl={party?.supplierAvatarUrl ?? null}
                      supplierAvatarSeed={party?.supplierAvatarSeed ?? null}
                      supplierAvatarFallbackSeed={party?.supplierFallbackSeed}
                      cardDate={getTripCardDate(t)}
                      stageLabel={stage}
                      onPress={() => router.push(`/trip/${t.id}` as const)}
                      tr={tr}
                      ledgerReceivedTotal={hubLedger.receivedTotal}
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
          )}
        </ScrollView>
      )}
      {canAccess && (
        <View
          style={[
            styles.fabWrap,
            {
              bottom:
                Layout.demoTabBarScrollBottomInset +
                insets.bottom +
                Layout.tabBarBottomPaddingMin,
            },
          ]}
        >
          <FinanceFAB
            onPress={() => router.push("/add-trip")}
            accessibilityLabel={tr("addTrip")}
            icon="road"
          />
        </View>
      )}
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
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: Theme.separatorDark,
  },
  tabRowScroll: {
    flexGrow: 0,
    borderBottomWidth: 1,
    borderBottomColor: Theme.separatorDark,
  },
  tabRowWebSub: {
    flexDirection: "row",
    justifyContent: "center",
    paddingHorizontal: Layout.screenPaddingHorizontal,
    marginTop: 2,
    marginBottom: 4,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: Theme.separatorDark,
  },
  tabRowScrollSub: {
    flexGrow: 0,
    borderBottomWidth: 1,
    borderBottomColor: Theme.separatorDark,
  },
  tabRowScrollContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 4,
    paddingBottom: 4,
  },
  tab: {
    position: "relative" as const,
    minWidth: 72,
    paddingVertical: 8,
    paddingHorizontal: 10,
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
  tabActive: {},
  tabText: {
    fontSize: 8,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 2,
    color: Theme.textOnDarkMuted,
  },
  tabTextActive: { color: Theme.textOnDark },
  tabUnderline: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 1.5,
    backgroundColor: Theme.teslaRed,
    borderRadius: 1,
  },
  /** Network / Treasury-style: search + supply chips (stacked narrow, row on wide web). */
  tripsToolbar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 12,
    paddingBottom: 16,
    backgroundColor: "#000000",
    borderBottomWidth: 1,
    borderBottomColor: Theme.separatorDark,
    gap: 16,
  },
  tripsLayoutToggle: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Theme.darkSurface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderOnDark,
    padding: 3,
    gap: 2,
  },
  tripsLayoutToggleBtn: {
    width: 36,
    height: 32,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  tripsLayoutToggleBtnActive: {
    backgroundColor: Theme.textOnDark,
  },
  tripsToolbarActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
    minWidth: 0,
  },
  tripsSearchWrap: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    minHeight: 38,
    borderRadius: 11,
    backgroundColor: Theme.darkSurface,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 12,
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
  tripsSearchIcon: { marginRight: 8 },
  tripsSearchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "600",
    color: Theme.textOnDark,
    paddingVertical: 0,
  },
  tripsSearchInputWeb: {
    outlineStyle: "none",
    outlineWidth: 0,
  } as unknown as TextStyle,
  tripsFilterIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: Theme.separatorDark,
    alignItems: "center",
    justifyContent: "center",
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
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  sortModalCard: {
    position: "absolute",
    left: 20,
    right: 20,
    backgroundColor: Theme.darkBackground,
    borderTopWidth: 2,
    borderTopColor: Theme.teslaRed,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 12,
  },
  modalHandle: {
    width: 32,
    height: 3,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignSelf: "center",
    marginBottom: 8,
  },
  modalSectionRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  modalSectionIcon: {
    marginRight: 6,
  },
  modalSectionLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMutedDemo,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  modalDivider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
    marginVertical: 16,
  },
  filterChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  filterChip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    flexDirection: "row",
    alignItems: "center",
  },
  filterChipActive: {
    backgroundColor: Theme.teslaRed,
    borderColor: Theme.teslaRed,
  },
  filterChipText: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textOnDarkMuted,
  },
  filterChipTextActive: {
    color: "#fff",
  },
  modalApplyBtn: {
    backgroundColor: Theme.primary,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    marginTop: "auto",
  },
  modalApplyBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
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
    marginHorizontal: -8,
  },
  gridItem: {
    width: "33.333%",
    paddingHorizontal: 8,
  },
  tripsTableHScrollContent: {
    paddingBottom: 8,
    flexGrow: 1,
  },
  tripsTableMinWidth: {
    flexGrow: 1,
  },
  scroll: { flex: 1, backgroundColor: TRIPS_PAGE_BG },
  scrollContent: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 4,
    flexGrow: 1,
    backgroundColor: TRIPS_PAGE_BG,
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
  },
  tripMetricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingBottom: 10,
    marginBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  tripMetricsGridWeb: {
    justifyContent: "space-between",
    gap: 10,
  },
  tripMetricTile: {
    flexBasis: "31%",
    flexGrow: 1,
    minWidth: "31%",
    maxWidth: "48%",
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
  },
  tripMetricTileWeb: {
    flexBasis: "15.5%",
    minWidth: "15%",
    maxWidth: "16.5%",
    flexGrow: 1,
  },
  tripMetricTileActive: {
    borderColor: Theme.primary,
    backgroundColor: Theme.screenBackground,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  tripMetricCount: {
    fontSize: 22,
    fontWeight: "900",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  tripMetricCountActive: {
    color: Theme.primary,
  },
  tripMetricTitle: {
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    color: Theme.textMuted,
    lineHeight: 13,
  },
  tripMetricTitleActive: {
    color: Theme.textPrimaryDark,
  },
  tripMetricHint: {
    marginTop: 4,
    fontSize: 9,
    fontWeight: "600",
    color: Theme.textSecondary,
    lineHeight: 12,
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
    right: Layout.fabRightOffset,
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
