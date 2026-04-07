/**
 * Trips Control — demo2 trips tab. Active | History, trip cards, Add Trip.
 * Private Book = driver/vehicle assigned by you; Shared Ledger = assigned by another user.
 */
import { CenteredLoadingView } from "@/components/CenteredLoadingView";
import { FinanceFAB } from "@/components/FinanceFAB";
import { TeslaHeader } from "@/components/TeslaHeader";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import {
  TripExpandableCard,
  type TripRow
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
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type ActiveStatusTab = "all" | "unassigned" | "assigned" | "in_transit";
type SupplyFilter = "all" | "asset" | "aggregated";

export default function TripsScreen() {
  const { width } = useWindowDimensions();
  const isLargeScreen = Platform.OS === "web" && width >= 1024;
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t: tr } = useLanguage();
  const { currentOrganization } = useOrganization();
  const { profile } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [tripFilter, setTripFilter] = useState<"Active" | "Completed">(
    "Active",
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [activeStatusTab, setActiveStatusTab] =
    useState<ActiveStatusTab>("all");
  const [supplyFilter, setSupplyFilter] = useState<SupplyFilter>("all");

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

  /** Show completed trips only on the History tab. */
  const showCompletedList = tripFilter === "Completed";

  const tripsByStatus = useMemo(
    () =>
      showCompletedList
        // History tab: show only completed trips that had a driver assigned (no filtering)
        ? trips.filter(
            (t) => isCompletedStatus(t.status) && t.driver_id != null,
          )
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
        if (activeStatusTab === "all") return true;
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
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((t) => {
        const displayName = (
          shipperNameByTripId[t.id] ?? t.client_name ?? ""
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
    return list;
  }, [
    tripsByStatus,
    activeStatusTab,
    supplyFilter,
    searchQuery,
    shipperNameByTripId,
    showCompletedList,
  ]);

  const transactionsByTripId = useMemo(() => {
    const map = new Map<string, typeof transactions>();
    for (const tx of transactions) {
      if (!tx.trip_id) continue;
      const list = map.get(tx.trip_id);
      if (list) {
        list.push(tx);
      } else {
        map.set(tx.trip_id, [tx]);
      }
    }
    return map;
  }, [transactions]);

  const statusTabs = useMemo(
    () => [
      {
        id: "all" as const,
        label: tr("active"),
        isActive: tripFilter === "Active" && activeStatusTab === "all",
        onPress: () => {
          setTripFilter("Active");
          setActiveStatusTab("all");
        },
      },
      {
        id: "unassigned" as const,
        label: tr("unassigned"),
        isActive: tripFilter === "Active" && activeStatusTab === "unassigned",
        onPress: () => {
          setTripFilter("Active");
          setActiveStatusTab("unassigned");
        },
      },
      {
        id: "assigned" as const,
        label: tr("tripAssigned"),
        isActive: tripFilter === "Active" && activeStatusTab === "assigned",
        onPress: () => {
          setTripFilter("Active");
          setActiveStatusTab("assigned");
        },
      },
      {
        id: "in_transit" as const,
        label: tr("tripInTransit"),
        isActive: tripFilter === "Active" && activeStatusTab === "in_transit",
        onPress: () => {
          setTripFilter("Active");
          setActiveStatusTab("in_transit");
        },
      },
      {
        id: "history" as const,
        label: tr("history"),
        isActive: tripFilter === "Completed",
        onPress: () => setTripFilter("Completed"),
      },
    ],
    [tr, tripFilter, activeStatusTab],
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
        { paddingTop: insets.top + Layout.tabBarHeight + 20 },
      ]}
    >
      <TeslaHeader
        title={tr("tripsControl")}
        subtitle={tr("logisticNodes")}
        skipSafeAreaTop
        onLoadClick={() => router.push("/load-board")}
        onNetworkClick={() => router.push("/(tabs)/network")}
        onProfileClick={() => router.push("/(tabs)/profile")}
      />
      <View style={styles.headerBlock}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabRowScrollContent}
          style={styles.tabRowScroll}
        >
          {statusTabs.map((tab) => (
            <TouchableOpacity
              key={tab.id}
              style={[styles.tab, tab.isActive && styles.tabActive]}
              onPress={tab.onPress}
              activeOpacity={0.7}
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
        </ScrollView>

        <View style={styles.tripsToolbar}>
          <View
            style={[
              styles.tripsSearchWrap,
              Platform.OS === "web" && styles.tripsSearchWrapWeb,
              isLargeScreen && styles.tripsSearchWrapRow,
            ]}
          >
            <FontAwesome
              name="search"
              size={14}
              color={Theme.textOnDarkMuted}
              style={styles.tripsSearchIcon}
            />
            <TextInput
              style={[
                styles.tripsSearchInput,
                Platform.OS === "web" && styles.tripsSearchInputWeb,
              ]}
              placeholder={tr("searchTripsPlaceholder")}
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
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={[
              styles.tripsSupplyChipsScroll,
              isLargeScreen && styles.tripsSupplyChipsScrollRow,
            ]}
            contentContainerStyle={[
              styles.tripsSupplyChipsScrollInner,
              { flexGrow: isLargeScreen ? 0 : 1 },
            ]}
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
        </View>
      </View>

      {loading ? (
        <View style={styles.scroll}>
          <CenteredLoadingView message={tr("loading")} />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: 24 + insets.bottom + 80 },
          ]}
          showsVerticalScrollIndicator={false}
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
              {showCompletedList
                ? tr("noCompletedTrips")
                : tr("noTripsYet")}
            </Text>
          ) : (
            <View style={isLargeScreen ? styles.gridContainer : undefined}>
              {filtered.map((t) => {
                const stage =
                  t.driver_id == null
                    ? tr("unassigned").toUpperCase()
                    : (t.status || "ACTIVE").toUpperCase();
                const isAggregate = isAggregateTrip(t);
                const tripLedgerEntries = transactionsByTripId.get(t.id) ?? [];
                const displayClientName = shipperNameByTripId[t.id] ?? t.client_name ?? undefined;
                return (
                  <View key={t.id} style={isLargeScreen ? styles.gridItem : undefined}>
                    <TripExpandableCard
                      trip={t}
                      tripLedgerEntries={tripLedgerEntries}
                      cardDate={getTripCardDate(t)}
                      stage={stage}
                      isAggregate={isAggregate}
                      displayClientName={displayClientName}
                      onAssignmentUpdated={onRefresh}
                      onPress={() => router.push(`/trip/${t.id}` as const)}
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
            { bottom: Layout.fabBottomOffset + insets.bottom },
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
  container: { flex: 1, backgroundColor: Theme.darkBackground },
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
  },
  tabRowScroll: {
    flexGrow: 0,
    borderBottomWidth: 1,
    borderBottomColor: Theme.separatorDark,
  },
  tabRowScrollContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 4,
    paddingBottom: 6,
  },
  tab: { position: "relative" as const, paddingVertical: 6 },
  tabActive: {},
  tabText: {
    fontSize: 9,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1.2,
    color: Theme.textOnDarkMuted,
  },
  tabTextActive: { color: Theme.textOnDark },
  tabUnderline: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: Theme.teslaRed,
    borderRadius: 1,
  },
  /** Network / Treasury-style: search + supply chips (stacked narrow, row on wide web). */
  tripsToolbar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 10,
    paddingBottom: 12,
    backgroundColor: Theme.darkBackground,
    borderBottomWidth: 1,
    borderBottomColor: Theme.separatorDark,
    gap: 10,
  },
  tripsToolbarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  tripsSearchWrap: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 32,
    borderRadius: 12,
    backgroundColor: Theme.darkSurface,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 12,
    paddingVertical: 0,
  },
  tripsSearchWrapRow: {
    flex: 1,
    minWidth: 200,
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
    paddingVertical: 6,
    color: Theme.textOnDark,
  },
  tripsSearchInputWeb: {
    outlineStyle: "none",
    outlineWidth: 0,
  } as unknown as TextStyle,
  tripsSupplyChipsScroll: {
    flexGrow: 1,
    paddingBottom: 2,
  },
  tripsSupplyChipsScrollRow: {
    flexGrow: 0,
    flexShrink: 0,
    alignSelf: "center",
  },
  tripsSupplyChipsScrollInner: {
    paddingBottom: 2,
    justifyContent: "flex-start",
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
  scroll: { flex: 1, backgroundColor: Theme.darkBackground },
  scrollContent: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 12,
    flexGrow: 1,
    backgroundColor: Theme.darkBackground,
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
