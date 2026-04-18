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
  summarizeTripLedgerForHub,
  TripsHubTableView,
  TripsHubTripCard,
  type TripRow,
} from "@/features/trips";
import { canAccessTrips, getCapabilitiesFromProfile } from "@/lib/capabilities";
import { isAggregateTrip } from "@/lib/driverUtils";
import { formatLedgerDate } from "@/lib/format";
import {
  useAssignmentAuditQuery,
  useRealtimeTransactionsInvalidation,
  useRealtimeTripsInvalidation,
  useShipperDisplayNamesQuery,
  useTransactionsQuery,
  useTripsQuery,
} from "@/lib/queries";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
    Modal,
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

type ActiveStatusTab = "unassigned" | "assigned" | "in_transit";
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
  const [activeStatusTab, setActiveStatusTab] =
    useState<ActiveStatusTab>("unassigned");
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
  const tripIds = useMemo(() => trips.map((t) => t.id), [trips]);
  const { refetch: refetchAssignment } = useAssignmentAuditQuery(tripIds);

  useRealtimeTripsInvalidation(orgId);
  useRealtimeTransactionsInvalidation(orgId);

  const loading = tripsLoading;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      refetchTrips(),
      refetchTransactions(),
      refetchAssignment(),
    ]);
    setRefreshing(false);
  }, [refetchTrips, refetchTransactions, refetchAssignment]);

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
        : trips.filter((t) => !isCompletedStatus(t.status)),
    [showCompletedList, trips],
  );

  // Apply trip-type and text filters for both tabs; status tabs apply only on Active.
  const filtered = useMemo(() => {
    const isInTransitStatus = (s: string | null | undefined) => {
      const v = (s ?? "").toLowerCase();
      return (
        v === "in_progress" ||
        v === "in_transit" ||
        v === "dispatched" ||
        v === "picked_up" ||
        v === "pickup"
      );
    };

    let list = tripsByStatus;
    if (!showCompletedList) {
      list = list.filter((t) => {
        const completed = isCompletedStatus(t.status);
        const inTransitLike = isInTransitStatus(t.status);
        const hasDriver = t.driver_id != null;
        if (activeStatusTab === "unassigned") return !hasDriver;
        if (activeStatusTab === "assigned")
          return hasDriver && !completed && !inTransitLike;
        return inTransitLike;
      });
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
    activeStatusTab,
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

  const activeStatusTabs = useMemo(
    () => [
      {
        id: "unassigned" as const,
        label: tr("unassigned"),
        isActive: activeStatusTab === "unassigned",
        onPress: () => {
          setActiveStatusTab("unassigned");
        },
      },
      {
        id: "assigned" as const,
        label: tr("tripAssigned"),
        isActive: activeStatusTab === "assigned",
        onPress: () => {
          setActiveStatusTab("assigned");
        },
      },
      {
        id: "in_transit" as const,
        label: tr("tripInTransit"),
        isActive: activeStatusTab === "in_transit",
        onPress: () => {
          setActiveStatusTab("in_transit");
        },
      },
    ],
    [tr, activeStatusTab],
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
        {tripFilter === "Active" ? (
          Platform.OS === "web" ? (
            <View style={styles.tabRowWebSub}>
              {activeStatusTabs.map((tab) => (
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
              style={styles.tabRowScrollSub}
            >
              {activeStatusTabs.map((tab) => (
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
          )
        ) : null}

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
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={[
                styles.tripsSupplyChipsScroll,
                isLargeScreen && styles.tripsSupplyChipsScrollRow,
              ]}
              contentContainerStyle={styles.tripsSupplyChipsScrollInner}
            >
              <View style={styles.tripsSupplyChipsRail}>
                {(
                  [
                    { id: "all" as const, label: tr("all") },
                    { id: "asset" as const, label: tr("tripAsset") },
                    { id: "aggregated" as const, label: tr("tripAggregate") },
                  ] as const
                ).map(({ id, label }) => (
                  <TouchableOpacity
                    key={id}
                    style={[
                      styles.tripsSupplyChip,
                      supplyFilter === id && styles.tripsSupplyChipActive,
                      Platform.OS === "web" && styles.tripsSupplyChipWeb,
                    ]}
                    onPress={() => setSupplyFilter(id)}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        styles.tripsSupplyChipText,
                        supplyFilter === id && styles.tripsSupplyChipTextActive,
                      ]}
                      numberOfLines={1}
                    >
                      {label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
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

        {/* Date-range quick filter row */}
        <View style={styles.tripsDateFilterRow}>
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
                  styles.tripsDateChip,
                  dateRangeFilter === id && styles.tripsDateChipActive,
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
                    styles.tripsDateChipText,
                    dateRangeFilter === id && styles.tripsDateChipTextActive,
                  ]}
                  numberOfLines={1}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
            {dateRangeFilter === "custom" && customDateFrom && customDateTo ? (
              <View style={[styles.tripsDateChip, styles.tripsDateChipCustom]}>
                <FontAwesome
                  name="calendar"
                  size={9}
                  color={Theme.textOnDark}
                  style={styles.tripsDateChipCustomIcon}
                />
                <Text
                  style={[styles.tripsDateChipText, styles.tripsDateChipTextActive]}
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
                  <FontAwesome name="times" size={9} color={Theme.textOnDark} />
                </TouchableOpacity>
              </View>
            ) : null}
          </ScrollView>
          <TouchableOpacity
            style={[
              styles.tripsDateRangeIconBtn,
              dateRangeFilter === "custom" && styles.tripsDateRangeIconBtnActive,
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
              color={Theme.textOnDark}
            />
          </TouchableOpacity>
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
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Theme.primary}
            />
          }
        >
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
                      isMobile ? 1020 : 1280,
                    ),
                  },
                ]}
              >
                <TripsHubTableView
                  trips={filtered}
                  currentOrganizationId={currentOrganization?.id ?? null}
                  getStageLabel={getStageLabelForTrip}
                  transactionsByTripId={transactionsByTripId}
                  onOpenTripDetails={(trip) =>
                    router.push(`/trip/${trip.id}` as const)
                  }
                  tr={tr}
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
                return (
                  <View
                    key={t.id}
                    style={isLargeScreen ? styles.gridItem : undefined}
                  >
                    <TripsHubTripCard
                      trip={t}
                      currentOrganizationId={currentOrganization?.id ?? null}
                      displayClientName={displayClientName}
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
    paddingTop: 12,
    flexGrow: 1,
    backgroundColor: TRIPS_PAGE_BG,
  },
  empty: {
    padding: 24,
    textAlign: "center",
    color: Theme.textOnDarkMuted,
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
