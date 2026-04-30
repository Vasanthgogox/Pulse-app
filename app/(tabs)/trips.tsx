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
import { LedgerReportModal } from "@/features/finance";
import type { LedgerRow } from "@/features/finance/services/finance.service";
import type { TripAdjustment } from "@/features/trips/services/tripAdjustments";
import {
  buildTripHubPartyMetaByTripId,
  summarizeTripLedgerForHub,
  TripsHubTableView,
  TripsHubTripCard,
  tripFinanceAdjForHubLookup,
  tripHubCost,
  tripHubDue,
  tripHubRevenue,
  type TripRow,
} from "@/features/trips";
import {
  classifyTripMetric,
  countTripsByMetric,
  isTripCancelledForHub,
  TRIP_METRIC_ORDER,
  type TripMetricId,
} from "@/features/trips/utils/tripHubMetrics";
import { canAccessTrips, getCapabilitiesFromProfile } from "@/lib/capabilities";
import { queryKeys } from "@/lib/queryKeys";
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
  useTripFinanceAdjustmentsMap,
  useTripsQuery,
} from "@/lib/queries";
import { supabase } from "@/lib/supabase";
import { useLinkedOrgProfileMap } from "@/lib/useLinkedOrgProfileMap";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useFocusEffect } from "@react-navigation/native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
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

const TRIPS_FAB_SIZE_MOBILE = 40;
const TRIPS_FAB_SIZE_DESKTOP = 46;
const CHAT_FAB_STACK_OFFSET = 60;

type TripsListLayout = "cards" | "table";
type HistoryTripMetricId =
  | "due_to_get"
  | "no_due_to_get"
  | "due_to_pay"
  | "no_due_to_pay";

const TRIPS_PAGE_BG = "#f4f5f7";

function formatCompactINR(value: number): string {
  const safe = Math.max(0, Number(value) || 0);
  if (safe >= 10000000) return `₹${(safe / 10000000).toFixed(1)}Cr`;
  if (safe >= 100000) return `₹${(safe / 100000).toFixed(1)}L`;
  if (safe >= 1000) return `₹${(safe / 1000).toFixed(1)}K`;
  return `₹${Math.round(safe)}`;
}

function historyTripDueState(
  trip: TripRow,
  ledgerRows: LedgerRow[],
  currentOrganizationId: string | null | undefined,
  adjustments?: TripAdjustment[] | null,
): { receivableDue: number; payableDue: number } {
  const ledger = summarizeTripLedgerForHub(ledgerRows);
  const receivableTarget = Math.max(
    tripHubRevenue(trip, currentOrganizationId, adjustments),
    0,
  );
  const payableTarget = Math.max(
    tripHubCost(trip, currentOrganizationId, adjustments),
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
  const isLargeScreen = Platform.OS === "web" && width >= 1280;
  const isCompactWeb = Platform.OS === "web" && width < 1180;
  const isMobile = width < 560;
  const tripsFabSize = isMobile ? TRIPS_FAB_SIZE_MOBILE : TRIPS_FAB_SIZE_DESKTOP;
  const insets = useSafeAreaInsets();
  const tripsFabBottom =
    insets.bottom + Layout.tabBarBottomPaddingMin + CHAT_FAB_STACK_OFFSET;
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
    useState<TripMetricId>("assigned");
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
  const [sortAnchorY, setSortAnchorY] = useState(0);
  /** Mobile view defaults to cards; wider web defaults to table. */
  const [listLayout, setListLayout] = useState<TripsListLayout>(() =>
    Platform.OS === "web" && !isMobile ? "table" : "cards",
  );

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
    await Promise.all([
      refetchTrips(),
      refetchTransactions(),
      refetchAssignment(),
      queryClient.invalidateQueries({
        queryKey: ["q", "trips", "doc-trip-ids", orgId],
      }),
      queryClient.invalidateQueries({
        queryKey: [...queryKeys.tripFinanceAdjustmentsRoot],
      }),
    ]);
    setRefreshing(false);
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
      onRefresh();
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

  /** Active ops trips only — used to resolve which trips have any uploaded document (POD split). */
  const activeOpsTripIdsSorted = useMemo(() => {
    if (showCompletedList) return "";
    const ids = tripsByStatus.map((t) => t.id).sort();
    return ids.join(",");
  }, [showCompletedList, tripsByStatus]);

  const { data: tripIdsWithDocuments = new Set<string>() } = useQuery({
    queryKey: [
      "q",
      "trips",
      "doc-trip-ids",
      orgId ?? "",
      activeOpsTripIdsSorted,
    ],
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

  const metricCounts = useMemo(() => {
    const counts = countTripsByMetric(tripsByStatus, tripIdsWithDocuments);
    if (!showCompletedList) {
      const completedTripsCount = trips.filter((t) => isCompletedStatus(t.status)).length;
      counts.delivered_docs_pending += completedTripsCount;
    }
    return counts;
  }, [tripsByStatus, tripIdsWithDocuments, showCompletedList, trips]);

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
      if (activeMetricTab === "delivered_docs_pending") {
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
  ]);

  const tripsTableResetKey = useMemo(
    () =>
      [
        listLayout,
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
      listLayout,
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

  const [tripsTablePageSize, setTripsTablePageSize] = useState<25 | 50>(25);
  const [tripsTablePage, setTripsTablePage] = useState(0);
  const [supplierNameFallbackById, setSupplierNameFallbackById] = useState<
    Record<string, string>
  >({});
  const tripsTableTotalPages = Math.max(
    1,
    Math.ceil(filtered.length / tripsTablePageSize),
  );
  const tripsTablePageSafe = Math.min(tripsTablePage, tripsTableTotalPages - 1);
  const tripsTableVisible = useMemo(() => {
    if (listLayout !== "table") return filtered;
    const start = tripsTablePageSafe * tripsTablePageSize;
    return filtered.slice(start, start + tripsTablePageSize);
  }, [filtered, listLayout, tripsTablePageSafe, tripsTablePageSize]);

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

  useEffect(() => {
    let cancelled = false;
    const loadMissingSupplierNames = async () => {
      const knownSupplierIds = new Set(
        suppliers.map((s) => String(s.id).trim().toLowerCase()).filter(Boolean),
      );
      const missingSupplierIds = Array.from(
        new Set(
          trips
            .map((trip) => String(trip.supplier_id ?? "").trim().toLowerCase())
            .filter((id) => id.length > 0 && !knownSupplierIds.has(id)),
        ),
      );
      if (missingSupplierIds.length === 0) {
        if (!cancelled) setSupplierNameFallbackById({});
        return;
      }
      const { data, error } = await supabase()
        .from("suppliers")
        .select("id, name, company_name, contact_person")
        .in("id", missingSupplierIds);
      if (cancelled) return;
      if (error) {
        setSupplierNameFallbackById({});
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
      setSupplierNameFallbackById(next);
    };
    void loadMissingSupplierNames();
    return () => {
      cancelled = true;
    };
  }, [trips, suppliers]);

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
      const supplierCost = Math.max(tripHubCost(trip, orgId, rowAdj), 0);
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
  ]);

  const mainTabs = useMemo(
    () => [
      {
        id: "active" as const,
        label: tr("active"),
        isActive: tripFilter === "Active",
        onPress: () => {
          setTripFilter("Active");
          setActiveHistoryMetricTab(null);
        },
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
      }) satisfies Record<TripMetricId, { title: string; hint: string }>,
    [tr],
  );

  const activeInMotionIds = useMemo(
    () => TRIP_METRIC_ORDER.filter((id) => id !== "unassigned"),
    [],
  );

  const historyReceivableIds: HistoryTripMetricId[] = useMemo(
    () => ["due_to_get", "no_due_to_get"],
    [],
  );
  const historyPayableIds: HistoryTripMetricId[] = useMemo(
    () => ["due_to_pay", "no_due_to_pay"],
    [],
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

  const renderHistoryMetricButton = (metricId: HistoryTripMetricId) => {
    const metric = historyMetricCards[metricId];
    const showsAmount = metricId === "due_to_get" || metricId === "due_to_pay";
    const active = activeHistoryMetricTab === metricId;
    const isReceivablePrimary = metricId === "due_to_get";
    const isPayableDue = metricId === "due_to_pay";
    const isReceivableCleared = metricId === "no_due_to_get";
    const isPayableCleared = metricId === "no_due_to_pay";
    return (
      <TouchableOpacity
        key={metricId}
        style={[
          styles.tripMetricTile,
          styles.tripMetricBento,
          styles.tripMetricTileShrinkNone,
          styles.historyMetricCardShell,
          isLargeScreen && styles.tripMetricTileWeb,
          active && styles.tripMetricBentoActive,
          showsAmount && metric.amount > 0 && styles.historyMetricTileAttention,
        ]}
        onPress={() =>
          setActiveHistoryMetricTab((current) =>
            current === metricId ? null : metricId,
          )
        }
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        accessibilityLabel={`${metric.title}, ${metric.count} trips`}
      >
        <LinearGradient
          colors={[Theme.darkBackground, "#1e293b"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.historyMetricWatermarkOrbs} pointerEvents="none">
          {isReceivablePrimary ? (
            <>
              <View style={styles.historyWmHeroBlobA} />
              <View style={styles.historyWmHeroBlobB} />
            </>
          ) : isPayableDue ? (
            <>
              <View
                style={[styles.historyWmLightBlobA, styles.historyWmPayBlobA]}
              />
              <View
                style={[styles.historyWmLightBlobB, styles.historyWmPayBlobB]}
              />
            </>
          ) : isReceivableCleared || isPayableCleared ? (
            <>
    <View
      style={[
                  styles.historyWmLightBlobA,
                  isPayableCleared
                    ? styles.historyWmClearedPayBlobA
                    : styles.historyWmReceiveBlobA,
                ]}
              />
              <View
                style={[
                  styles.historyWmLightBlobB,
                  isPayableCleared
                    ? styles.historyWmClearedPayBlobB
                    : styles.historyWmReceiveBlobB,
                ]}
              />
            </>
          ) : null}
          </View>
        <View style={styles.historyMetricInner}>
          <View style={styles.historyMetricTopRow}>
                <Text
              style={[
                styles.metricBentoValue,
                active
                  ? styles.tripMetricCountActive
                  : styles.metricBentoValueOnDark,
              ]}
            >
              {metric.count}
                </Text>
            {showsAmount ? (
                <Text
                  style={[
                  styles.historyMetricAmount,
                  styles.historyMetricAmountBento,
                  styles.historyMetricAmountOnDark,
                  metric.amount > 0 && styles.historyMetricAmountDue,
                ]}
                numberOfLines={1}
              >
                {formatCompactINR(metric.amount)}
                </Text>
            ) : null}
          </View>
                <Text
                  style={[
              styles.metricBentoLabel,
              active
                ? styles.metricBentoLabelOnDarkActive
                : styles.metricBentoLabelOnDark,
            ]}
            numberOfLines={2}
          >
            {metric.title}
                </Text>
          <Text
              style={[
              styles.metricBentoSubtext,
              styles.metricBentoSubtextOnDark,
              styles.metricCardHintAtBottom,
            ]}
            numberOfLines={3}
          >
            {metric.hint}
          </Text>
        </View>
            </TouchableOpacity>
    );
  };

  if (!canAccess) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <Text style={styles.message}>{tr("noAccessTrips")}</Text>
          </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: screenTopPad }]}>
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
          <View style={styles.tripsBodyFiltersBleed}>
            <View style={styles.tripsInlineFilterPanel}>
              {Platform.OS !== "web" ? (
                <>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    nestedScrollEnabled
                    contentContainerStyle={styles.tripsMobileTabsScrollContent}
                    style={styles.tripsMobileTabsScroll}
                  >
                    {mainTabs.map((tab) => (
                      <TouchableOpacity
                        key={tab.id}
                        style={[
                          styles.tab,
                          styles.tripsMobileTab,
                          tab.isActive && styles.tabActive,
                        ]}
                        onPress={tab.onPress}
                        activeOpacity={0.7}
                        accessibilityRole="tab"
                        accessibilityState={{ selected: tab.isActive }}
                      >
                        <Text
                          style={[
                            styles.tabText,
                            tab.isActive && styles.tabTextActive,
                          ]}
                        >
                          {tab.label}
                        </Text>
                        {tab.isActive ? (
                          <View style={styles.tabUnderline} />
                        ) : null}
                      </TouchableOpacity>
                    ))}
                    <View style={styles.tripsFilterGroupSeparator} />
                    {subTabs.map((tab) => (
                      <TouchableOpacity
                        key={tab.id}
                        style={[
                          styles.tab,
                          styles.tripsMobileTab,
                          styles.tabSubPill,
                          tab.isActive && styles.tabSubPillActive,
                        ]}
                        onPress={tab.onPress}
                        activeOpacity={0.7}
                        accessibilityRole="tab"
                        accessibilityState={{ selected: tab.isActive }}
                      >
                        <Text
                          style={[
                            styles.tabSubPillText,
                            tab.isActive && styles.tabSubPillTextActive,
                          ]}
                        >
                          {tab.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    nestedScrollEnabled
                    contentContainerStyle={styles.tripsToolbarScrollContent}
                    style={styles.tripsToolbarScroll}
                  >
              <View
                      style={styles.tripsLayoutToggle}
                      accessibilityRole="tablist"
                    >
                      <TouchableOpacity
                style={[
                          styles.tripsLayoutToggleBtn,
                          listLayout === "cards" &&
                            styles.tripsLayoutToggleBtnActive,
                        ]}
                        onPress={() => setListLayout("cards")}
                        activeOpacity={0.85}
                        accessibilityRole="tab"
                        accessibilityState={{
                          selected: listLayout === "cards",
                        }}
                        accessibilityLabel={tr("tripsViewCards")}
                      >
                        <FontAwesome
                          name="th-large"
                          size={14}
                          color={
                            listLayout === "cards"
                              ? Theme.textOnDark
                              : Theme.textSecondary
                          }
                        />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.tripsLayoutToggleBtn,
                          listLayout === "table" &&
                            styles.tripsLayoutToggleBtnActive,
                        ]}
                        onPress={() => setListLayout("table")}
                        activeOpacity={0.85}
                        accessibilityRole="tab"
                        accessibilityState={{
                          selected: listLayout === "table",
                        }}
                        accessibilityLabel={tr("tripsViewTable")}
                      >
                        <FontAwesome
                          name="list"
                          size={14}
                          color={
                            listLayout === "table"
                              ? Theme.textOnDark
                              : Theme.textSecondary
                          }
                        />
                      </TouchableOpacity>
                    </View>
                    {(
                      [
                        { id: "all" as const, label: tr("all") },
                        { id: "today" as const, label: tr("todayTrips") },
                        {
                          id: "yesterday" as const,
                          label: tr("yesterdayTrips"),
                        },
                        {
                          id: "this_week" as const,
                          label: tr("thisWeekTrips"),
                        },
                        {
                          id: "this_month" as const,
                          label: tr("thisMonthTrips"),
                        },
                      ] as const
                    ).map(({ id, label }) => (
                      <TouchableOpacity
                        key={id}
                        style={[
                          styles.tripsBodyDateChip,
                          styles.tripsMobileDateChip,
                          dateRangeFilter === id &&
                            styles.tripsBodyDateChipActive,
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
                    <TouchableOpacity
                      style={[
                        styles.tripsBodyDateRangeIconBtn,
                        dateRangeFilter === "custom" &&
                          styles.tripsDateRangeIconBtnActive,
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
                  </ScrollView>
                </>
              ) : (
                <View style={styles.tripsInlineFilterPanelWeb}>
                  <View
                    style={[
                      styles.tripsBottomHeaderRowWeb,
                      isCompactWeb && styles.tripsBottomHeaderRowWebCompact,
                    ]}
                  >
                    <View
                      style={[
                        styles.tripsTabClusterWeb,
                        isCompactWeb && styles.tripsTabClusterWebCompact,
                      ]}
                    >
                      {subTabs.map((tab) => (
                        <TouchableOpacity
                          key={tab.id}
                          style={[
                            styles.tabSubPill,
                            styles.tripsScopePillWeb,
                            tab.isActive && styles.tripsScopePillActiveWeb,
                          ]}
                          onPress={tab.onPress}
                          activeOpacity={0.75}
                          accessibilityRole="tab"
                          accessibilityState={{ selected: tab.isActive }}
                        >
                          <Text
                            style={[
                              styles.tabSubPillText,
                              styles.tripsScopePillTextWeb,
                              tab.isActive &&
                                styles.tripsScopePillTextActiveWeb,
                            ]}
                          >
                            {tab.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <View
                      style={[
                        styles.tripsToolbarWeb,
                        isCompactWeb && styles.tripsToolbarWebCompact,
                      ]}
                    >
                      <View
                        style={[
                          styles.tripsSearchWrap,
                          styles.tripsSearchWrapWeb,
                          styles.tripsSearchWrapWebCompact,
                          isCompactWeb && styles.tripsSearchWrapWebFluid,
                          isMobile && styles.tripsSearchWrapWebMobile,
                        ]}
                      >
                        <FontAwesome
                          name="search"
                          size={12}
                          color={Theme.textSecondary}
                          style={styles.tripsSearchIcon}
                        />
                        <TextInput
                          style={[
                            styles.tripsSearchInput,
                            styles.tripsSearchInputWeb,
                          ]}
                          placeholder={
                            isLargeScreen
                              ? "Find by name..."
                              : tr("searchTripsPlaceholder")
                          }
                          placeholderTextColor={Theme.textSecondary}
                          value={searchQuery}
                          onChangeText={setSearchQuery}
                          returnKeyType="search"
                          autoCorrect={false}
                          spellCheck={false}
                          autoComplete="off"
                          maxLength={120}
                        />
                      </View>
                      {!isMobile ? (
                        <View style={styles.tripsToolbarActions}>
                          <TouchableOpacity
                            style={[
                              styles.tripsFilterIconBtn,
                              styles.tripsSupplyChipWeb,
                            ]}
                            onPress={(e) => {
                              const target = e.currentTarget;
                              if (
                                target &&
                                typeof target.measureInWindow === "function"
                              ) {
                                target.measureInWindow(
                                  (
                                    _x: number,
                                    y: number,
                                    _w: number,
                                    h: number,
                                  ) => {
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
                            <FontAwesome
                              name="sort"
                              size={12}
                              color={Theme.textPrimaryDark}
                            />
                          </TouchableOpacity>
                        </View>
                      ) : null}
                      <View
                        style={[
                          styles.tripsMainTabsRowWeb,
                          isCompactWeb && styles.tripsMainTabsRowWebCompact,
                        ]}
                      >
                        <View
                          style={[
                            styles.tripsMainTabsPillWrap,
                            isMobile && styles.tripsMainTabsPillWrapMobile,
                          ]}
                        >
                          {mainTabs.map((tab) => (
                            <TouchableOpacity
                              key={tab.id}
                              style={[
                                styles.tripsMainPillWeb,
                                isMobile && styles.tripsMainPillWebMobile,
                                tab.isActive && styles.tripsMainPillActiveWeb,
                              ]}
                              onPress={tab.onPress}
                              activeOpacity={0.75}
                              accessibilityRole="tab"
                              accessibilityState={{ selected: tab.isActive }}
                            >
                              <Text
                                style={[
                                  styles.tripsMainPillTextWeb,
                                  tab.isActive &&
                                    styles.tripsMainPillTextActiveWeb,
                                ]}
                              >
                                {tab.label}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                        {!isMobile ? (
                          <View
                            style={styles.tripsLayoutToggle}
                            accessibilityRole="tablist"
                          >
                          <TouchableOpacity
                            style={[
                              styles.tripsLayoutToggleBtn,
                              listLayout === "cards" &&
                                styles.tripsLayoutToggleBtnActive,
                            ]}
                            onPress={() => setListLayout("cards")}
                            activeOpacity={0.85}
                            accessibilityRole="tab"
                            accessibilityState={{
                              selected: listLayout === "cards",
                            }}
                            accessibilityLabel={tr("tripsViewCards")}
                          >
                            <FontAwesome
                              name="th-large"
                              size={14}
                              color={
                                listLayout === "cards"
                                  ? Theme.textOnDark
                                  : Theme.textSecondary
                              }
                            />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[
                              styles.tripsLayoutToggleBtn,
                              listLayout === "table" &&
                                styles.tripsLayoutToggleBtnActive,
                            ]}
                            onPress={() => setListLayout("table")}
                            activeOpacity={0.85}
                            accessibilityRole="tab"
                            accessibilityState={{
                              selected: listLayout === "table",
                            }}
                            accessibilityLabel={tr("tripsViewTable")}
                          >
                            <FontAwesome
                              name="list"
                              size={14}
                              color={
                                listLayout === "table"
                                  ? Theme.textOnDark
                                  : Theme.textSecondary
                              }
                            />
                          </TouchableOpacity>
                          </View>
                        ) : null}
                      </View>
                    </View>
                  </View>
                </View>
              )}
            </View>
            {tripFilter === "Active" ? (
              isMobile ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.tripMetricTabsRow}
                  style={styles.tripMetricTabsScroll}
                >
                  {TRIP_METRIC_ORDER.map((metricId) => {
                    const active = activeMetricTab === metricId;
                    const copy = tripMetricCopy[metricId];
                    return (
                      <TouchableOpacity
                        key={metricId}
                        style={[
                          styles.tripsMainPillWeb,
                          styles.tripMetricTabPill,
                          active && styles.tripsMainPillActiveWeb,
                        ]}
                        onPress={() => setActiveMetricTab(metricId)}
                        activeOpacity={0.8}
                        accessibilityRole="tab"
                        accessibilityState={{ selected: active }}
                      >
                        <Text
                          style={[
                            styles.tripsMainPillTextWeb,
                            styles.tripMetricTabText,
                            active && styles.tripsMainPillTextActiveWeb,
                          ]}
                          numberOfLines={1}
                        >
                          {copy.title}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={[
                  styles.tripMetricsGrid,
                  isLargeScreen && styles.tripMetricsGridWeb,
                ]}
                style={styles.tripMetricsScroll}
              >
                <View
                  style={[
                    styles.tripMetricsGroupColumn,
                    isLargeScreen && styles.tripMetricsGroupColumnIntakeWeb,
                  ]}
                >
                  <Text
                    style={styles.metricGroupLabel}
                    accessibilityRole="header"
                  >
                    {tr("tripsHubMetricGroupIntake")}
                  </Text>
                  <View
                    style={[
                      styles.tripMetricsBundleRail,
                      isLargeScreen && styles.tripMetricsBundleRailWeb,
                    ]}
                  >
                    {TRIP_METRIC_ORDER.slice(0, 1).map((metricId) => {
                  const count = metricCounts[metricId];
                  const active = activeMetricTab === metricId;
                  const copy = tripMetricCopy[metricId];
                  return (
                    <TouchableOpacity
                      key={metricId}
                      style={[
                        styles.tripMetricTile,
                            styles.tripMetricBento,
                            styles.tripMetricTileShrinkNone,
                        isLargeScreen && styles.tripMetricTileWeb,
                            active && styles.tripMetricBentoActive,
                      ]}
                      onPress={() => setActiveMetricTab(metricId)}
                      activeOpacity={0.85}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={`${copy.title}, ${count} trips`}
                    >
                          <LinearGradient
                            colors={[Theme.darkBackground, "#1e293b"]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={StyleSheet.absoluteFill}
                          />
                          <View
                            style={styles.historyMetricWatermarkOrbs}
                            pointerEvents="none"
                          >
                            <View style={styles.historyWmHeroBlobA} />
                            <View style={styles.historyWmHeroBlobB} />
                          </View>
                          <View style={styles.historyMetricInner}>
                      <Text
                        style={[
                                styles.metricBentoValue,
                                active
                                  ? styles.tripMetricCountActive
                                  : styles.metricBentoValueOnDark,
                        ]}
                      >
                        {count}
                      </Text>
                      <Text
                        style={[
                                styles.metricBentoLabel,
                                active
                                  ? styles.metricBentoLabelOnDarkActive
                                  : styles.metricBentoLabelOnDark,
                        ]}
                        numberOfLines={2}
                      >
                        {copy.title}
                      </Text>
                            <Text
                              style={[
                                styles.metricBentoSubtext,
                                styles.metricBentoSubtextOnDark,
                                styles.metricCardHintAtBottom,
                              ]}
                              numberOfLines={3}
                            >
                        {copy.hint}
                      </Text>
                          </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
                </View>
                <View
                  style={[
                    styles.tripMetricsGroupColumn,
                    isLargeScreen && styles.tripMetricsGroupColumnInMotionWeb,
                  ]}
                >
                  <Text
                    style={styles.metricGroupLabel}
                    accessibilityRole="header"
                  >
                    {tr("tripsHubMetricGroupInMotion")}
                  </Text>
                  <View
                    style={[
                      styles.tripMetricsBundleRail,
                      isLargeScreen && styles.tripMetricsBundleRailWeb,
                    ]}
                  >
                    {activeInMotionIds.map((metricId) => {
                      const count = metricCounts[metricId];
                      const active = activeMetricTab === metricId;
                      const copy = tripMetricCopy[metricId];
                      return (
                        <TouchableOpacity
                          key={metricId}
                          style={[
                            styles.tripMetricTile,
                            styles.tripMetricBento,
                            styles.tripMetricTileShrinkNone,
                            isLargeScreen && styles.tripMetricTileWeb,
                            active && styles.tripMetricBentoActive,
                          ]}
                          onPress={() => setActiveMetricTab(metricId)}
                          activeOpacity={0.85}
                          accessibilityRole="button"
                          accessibilityState={{ selected: active }}
                          accessibilityLabel={`${copy.title}, ${count} trips`}
                        >
                          <LinearGradient
                            colors={[Theme.darkBackground, "#1e293b"]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={StyleSheet.absoluteFill}
                          />
                          <View
                            style={styles.historyMetricWatermarkOrbs}
                            pointerEvents="none"
                          >
                            <View style={styles.historyWmHeroBlobA} />
                            <View style={styles.historyWmHeroBlobB} />
                          </View>
                          <View style={styles.historyMetricInner}>
                            <Text
                              style={[
                                styles.metricBentoValue,
                                active
                                  ? styles.tripMetricCountActive
                                  : styles.metricBentoValueOnDark,
                              ]}
                            >
                              {count}
                            </Text>
                            <Text
                              style={[
                                styles.metricBentoLabel,
                                active
                                  ? styles.metricBentoLabelOnDarkActive
                                  : styles.metricBentoLabelOnDark,
                              ]}
                              numberOfLines={2}
                            >
                              {copy.title}
                            </Text>
                            <Text
                              style={[
                                styles.metricBentoSubtext,
                                styles.metricBentoSubtextOnDark,
                                styles.metricCardHintAtBottom,
                              ]}
                              numberOfLines={3}
                            >
                              {copy.hint}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              </ScrollView>
              )
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={[
                  styles.tripMetricsGrid,
                  isLargeScreen && styles.tripMetricsGridWeb,
                ]}
                style={styles.tripMetricsScroll}
              >
                <View
                  style={[
                    styles.tripMetricsGroupColumn,
                    isLargeScreen && styles.tripMetricsGroupColumnWeb,
                  ]}
                >
                  <Text
                    style={styles.metricGroupLabel}
                    accessibilityRole="header"
                  >
                    {tr("tripsHubMetricGroupReceivable")}
                  </Text>
                  <View
                    style={[
                      styles.tripHistoryPairRail,
                      isLargeScreen && styles.tripHistoryPairRailWeb,
                    ]}
                  >
                    {historyReceivableIds.map((id) =>
                      renderHistoryMetricButton(id),
                    )}
                  </View>
                </View>
                <View
                  style={[
                    styles.tripMetricsGroupColumn,
                    isLargeScreen && styles.tripMetricsGroupColumnWeb,
                  ]}
                >
                  <Text
                    style={styles.metricGroupLabel}
                    accessibilityRole="header"
                  >
                    {tr("tripsHubMetricGroupPayable")}
                  </Text>
                  <View
                    style={[
                      styles.tripHistoryPairRail,
                      isLargeScreen && styles.tripHistoryPairRailWeb,
                    ]}
                  >
                    {historyPayableIds.map((id) =>
                      renderHistoryMetricButton(id),
                    )}
                  </View>
                </View>
              </ScrollView>
            )}
            {isLargeScreen ? (
              <View style={styles.tripsDateInlineRowWeb}>
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
                      styles.tripsSupplyChipWeb,
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
                {dateRangeFilter === "custom" &&
                customDateFrom &&
                customDateTo ? (
                  <View
                    style={[
                      styles.tripsBodyDateChip,
                      styles.tripsDateChipCustom,
                    ]}
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
              <TouchableOpacity
                style={[
                  styles.tripsBodyDateRangeIconBtn,
                  styles.tripsSupplyChipWeb,
                ]}
                onPress={(e) => {
                  const target = e.currentTarget;
                  if (
                    target &&
                    typeof target.measureInWindow === "function"
                  ) {
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
                activeOpacity={0.8}
                accessibilityLabel="Sort filters"
                accessibilityRole="button"
              >
                <FontAwesome
                  name="sort"
                  size={12}
                  color={Theme.textPrimaryDark}
                />
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.tripsBodyDateRangeIconBtn,
                  dateRangeFilter === "custom" &&
                    styles.tripsDateRangeIconBtnActive,
                    styles.tripsSupplyChipWeb,
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
            ) : null}
          </View>

          {filtered.length === 0 ? (
            <Text style={styles.empty}>
              {showCompletedList ? tr("noCompletedTrips") : tr("noTripsYet")}
            </Text>
          ) : listLayout === "table" ? (
            <View>
              <View style={styles.tripsTablePaginationRow}>
                <Text style={styles.tripsTablePaginationMeta}>
                  {`Page ${tripsTablePageSafe + 1}/${tripsTableTotalPages} · ${filtered.length}`}
                </Text>
                <View style={styles.tripsTablePaginationRight}>
                  <View style={styles.tripsTablePageSizeWrap}>
                    {[25, 50].map((n) => (
                      <TouchableOpacity
                        key={n}
                        style={[
                          styles.tripsTablePageSizePill,
                          tripsTablePageSize === n &&
                            styles.tripsTablePageSizePillActive,
                        ]}
                        onPress={() => setTripsTablePageSize(n as 25 | 50)}
                        activeOpacity={0.85}
                        accessibilityRole="button"
                        accessibilityState={{
                          selected: tripsTablePageSize === n,
                        }}
                      >
                        <Text
                          style={[
                            styles.tripsTablePageSizeText,
                            tripsTablePageSize === n &&
                              styles.tripsTablePageSizeTextActive,
                          ]}
                        >
                          {n}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <TouchableOpacity
                    style={[
                      styles.tripsTablePageNavBtn,
                      tripsTablePageSafe <= 0 &&
                        styles.tripsTablePageNavBtnDisabled,
                    ]}
                    onPress={() => setTripsTablePage((p) => Math.max(0, p - 1))}
                    disabled={tripsTablePageSafe <= 0}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.tripsTablePageNavText}>Prev</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.tripsTablePageNavBtn,
                      tripsTablePageSafe >= tripsTableTotalPages - 1 &&
                        styles.tripsTablePageNavBtnDisabled,
                    ]}
                    onPress={() =>
                      setTripsTablePage((p) =>
                        Math.min(tripsTableTotalPages - 1, p + 1),
                      )
                    }
                    disabled={tripsTablePageSafe >= tripsTableTotalPages - 1}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.tripsTablePageNavText}>Next</Text>
                  </TouchableOpacity>
                </View>
              </View>
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
                  trips={tripsTableVisible}
                  currentOrganizationId={currentOrganization?.id ?? null}
                  getStageLabel={getStageLabelForTrip}
                  transactionsByTripId={transactionsByTripId}
                    financeAdjustmentsByTripId={tripFinanceAdjForHub}
                  onOpenTripDetails={(trip) =>
                    router.push(`/trip/${trip.id}` as const)
                  }
                  tr={tr}
                    onExportLedger={() => setTripLedgerExportOpen(true)}
                  clientNameByTripId={shipperNameByTripId}
                  linkedOrgByOrganizationId={linkedOrgByOrganizationId}
                  partyMetaByTripId={tripHubPartyMetaByTripId}
                />
              </View>
            </ScrollView>
              <View style={styles.tripsTablePaginationRowBottom}>
                <Text style={styles.tripsTablePaginationMeta}>
                  {`Page ${tripsTablePageSafe + 1}/${tripsTableTotalPages} · ${filtered.length}`}
                </Text>
                <View style={styles.tripsTablePaginationRight}>
                  <View style={styles.tripsTablePageSizeWrap}>
                    {[25, 50].map((n) => (
                      <TouchableOpacity
                        key={`bottom-${n}`}
                        style={[
                          styles.tripsTablePageSizePill,
                          tripsTablePageSize === n &&
                            styles.tripsTablePageSizePillActive,
                        ]}
                        onPress={() => setTripsTablePageSize(n as 25 | 50)}
                        activeOpacity={0.85}
                        accessibilityRole="button"
                        accessibilityState={{
                          selected: tripsTablePageSize === n,
                        }}
                      >
                        <Text
                          style={[
                            styles.tripsTablePageSizeText,
                            tripsTablePageSize === n &&
                              styles.tripsTablePageSizeTextActive,
                          ]}
                        >
                          {n}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <TouchableOpacity
                    style={[
                      styles.tripsTablePageNavBtn,
                      tripsTablePageSafe <= 0 &&
                        styles.tripsTablePageNavBtnDisabled,
                    ]}
                    onPress={() => setTripsTablePage((p) => Math.max(0, p - 1))}
                    disabled={tripsTablePageSafe <= 0}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.tripsTablePageNavText}>Prev</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.tripsTablePageNavBtn,
                      tripsTablePageSafe >= tripsTableTotalPages - 1 &&
                        styles.tripsTablePageNavBtnDisabled,
                    ]}
                    onPress={() =>
                      setTripsTablePage((p) =>
                        Math.min(tripsTableTotalPages - 1, p + 1),
                      )
                    }
                    disabled={tripsTablePageSafe >= tripsTableTotalPages - 1}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.tripsTablePageNavText}>Next</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
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
                      financeAdjustments={tripFinanceAdjForHubLookup(
                        tripFinanceAdjForHub,
                        t.id,
                      )}
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
            size={tripsFabSize}
            iconSize={isMobile ? 17 : 20}
          />
        </View>
      )}
      <LedgerReportModal
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
    paddingHorizontal: 8,
    paddingVertical: 9,
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
  },
  tripsMobileTabsScrollContent: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 8,
    paddingBottom: 6,
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
      } as any,
    }),
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
    fontSize: 12,
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
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    flexDirection: "row",
    alignItems: "center",
  },
  filterChipActive: {
    backgroundColor: Theme.teslaRed,
    borderColor: Theme.teslaRed,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textOnDark,
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
  tripsInlineFilterPanel: {
    marginBottom: 12,
    backgroundColor: Theme.screenBackground,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 20,
    overflow: "hidden",
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
      } as any,
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
      } as any,
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
    gap: 10,
    paddingBottom: 12,
    paddingRight: 8,
  },
  tripMetricsScroll: {
    marginBottom: 10,
    paddingBottom: 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  tripMetricTabsScroll: {
    marginBottom: 10,
    paddingBottom: 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  tripMetricTabsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingBottom: 10,
  },
  tripMetricTabPill: {
    minWidth: 104,
    paddingVertical: 9,
    paddingHorizontal: 14,
  },
  tripMetricTabText: {
    letterSpacing: 0.9,
  },
  tripMetricsGridWeb: {
    justifyContent: "flex-start",
    gap: 12,
    width: "100%" as const,
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
  tripMetricsGroupColumnIntakeWeb: {
    flex: 1.1,
    minWidth: 0,
    marginRight: 0,
  },
  tripMetricsGroupColumnInMotionWeb: {
    flex: 4.9,
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
    backgroundColor: "transparent",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.22,
    shadowRadius: 6,
    elevation: 3,
  },
  tripMetricTileShrinkNone: {
    flexShrink: 0,
    alignSelf: "stretch",
  },
  metricCardHintAtBottom: {
    marginTop: "auto" as const,
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
    paddingHorizontal: 14,
    zIndex: 1,
    width: "100%" as const,
    flexDirection: "column",
  },
  /** Bento tile typography — tuned for 188px card width, left-aligned, even vertical rhythm. */
  metricBentoValue: {
    fontSize: Platform.OS === "web" ? 24 : 20,
    fontWeight: "900",
    fontStyle: "italic",
    letterSpacing: -0.4,
    lineHeight: Platform.OS === "web" ? 28 : 24,
    marginBottom: 5,
    textAlign: "left" as const,
  },
  metricBentoValueOnDark: {
    color: Theme.textOnDark,
  },
  metricBentoLabel: {
    fontSize: 10.5,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    lineHeight: 13.5,
    textAlign: "left" as const,
    width: "100%" as const,
  },
  metricBentoLabelOnDark: {
    color: "rgba(255,255,255,0.88)",
  },
  metricBentoLabelOnDarkActive: {
    color: "rgba(255,255,255,0.97)",
  },
  metricBentoSubtext: {
    fontSize: 9.5,
    fontWeight: "500",
    lineHeight: 12.5,
    textAlign: "left" as const,
    width: "100%" as const,
  },
  metricBentoSubtextOnDark: {
    color: "rgba(255,255,255,0.55)",
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
    color: Theme.primary,
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
