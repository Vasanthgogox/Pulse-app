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
import { useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type ActiveStatusTab = "all" | "unassigned" | "assigned" | "in_transit";
type SupplyFilter = "all" | "asset" | "aggregated";

export default function TripsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t: tr } = useLanguage();
  const { currentOrganization } = useOrganization();
  const { profile } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [tripFilter, setTripFilter] = useState<"Active" | "Completed">(
    "Active",
  );
  const [clientQuery, setClientQuery] = useState("");
  const [locationQuery, setLocationQuery] = useState("");
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
    const cq = clientQuery.trim().toLowerCase();
    if (cq) {
      list = list.filter((t) => {
        const displayName = shipperNameByTripId[t.id] ?? t.client_name ?? "";
        return displayName.toLowerCase().includes(cq);
      });
    }
    const lq = locationQuery.trim().toLowerCase();
    if (lq) {
      list = list.filter(
        (t) =>
          (t.pickup_area ?? "").toLowerCase().includes(lq) ||
          (t.drop_location ?? "").toLowerCase().includes(lq),
      );
    }
    return list;
  }, [
    tripsByStatus,
    activeStatusTab,
    supplyFilter,
    clientQuery,
    locationQuery,
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

  if (!canAccess) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <Text style={styles.message}>{tr("noAccessTrips")}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TeslaHeader
        title={tr("tripsControl")}
        subtitle={tr("logisticNodes")}
        onLoadClick={() => router.push("/load-board")}
        onNetworkClick={() => router.push("/(tabs)/network")}
        onProfileClick={() => router.push("/(tabs)/profile")}
      />
      <View style={styles.headerBlock}>
        <View style={styles.tabSection}>
          <View style={styles.tabRow}>
            <TouchableOpacity
              style={[
                styles.tab,
                tripFilter === "Active" &&
                  activeStatusTab === "all" &&
                  styles.tabActive,
              ]}
              onPress={() => {
                setTripFilter("Active");
                setActiveStatusTab("all");
              }}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.tabText,
                  tripFilter === "Active" &&
                    activeStatusTab === "all" &&
                    styles.tabTextActive,
                ]}
              >
                {tr("active")}
              </Text>
              {tripFilter === "Active" && activeStatusTab === "all" && (
                <View style={styles.tabUnderline} />
              )}
            </TouchableOpacity>
            {(
              [
                { id: "unassigned" as const, label: tr("unassigned") },
                { id: "assigned" as const, label: "Assigned" },
                { id: "in_transit" as const, label: "In Transit" },
              ] as const
            ).map(({ id, label }) => (
              <TouchableOpacity
                key={id}
                style={[
                  styles.tab,
                  tripFilter === "Active" &&
                    activeStatusTab === id &&
                    styles.tabActive,
                ]}
                onPress={() => {
                  setTripFilter("Active");
                  setActiveStatusTab(id);
                }}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.tabText,
                    tripFilter === "Active" &&
                      activeStatusTab === id &&
                      styles.tabTextActive,
                  ]}
                >
                  {label}
                </Text>
                {tripFilter === "Active" && activeStatusTab === id && (
                  <View style={styles.tabUnderline} />
                )}
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[
                styles.tab,
                tripFilter === "Completed" && styles.tabActive,
              ]}
              onPress={() => setTripFilter("Completed")}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.tabText,
                  tripFilter === "Completed" && styles.tabTextActive,
                ]}
              >
                {tr("history")}
              </Text>
              {tripFilter === "Completed" && (
                <View style={styles.tabUnderline} />
              )}
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.filterWrap}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterPillRow}
          >
            {(
              [
                { id: "all" as const, label: tr("all") },
                { id: "asset" as const, label: "Asset" },
                { id: "aggregated" as const, label: "Aggregated" },
              ] as const
            ).map(({ id, label }) => (
              <TouchableOpacity
                key={id}
                style={[
                  styles.filterPill,
                  supplyFilter === id && styles.filterPillActive,
                ]}
                onPress={() => setSupplyFilter(id)}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.filterPillText,
                    supplyFilter === id && styles.filterPillTextActive,
                  ]}
                  numberOfLines={1}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <View style={styles.filterInputRow}>
            <TextInput
              style={styles.filterInput}
              placeholder={tr("client") || "Client"}
              placeholderTextColor={Theme.textMuted}
              value={clientQuery}
              onChangeText={setClientQuery}
              maxLength={80}
            />
            <TextInput
              style={styles.filterInput}
              placeholder={tr("location") || "Location"}
              placeholderTextColor={Theme.textMuted}
              value={locationQuery}
              onChangeText={setLocationQuery}
              maxLength={80}
            />
          </View>
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
            <>
              {filtered.map((t) => {
                const stage =
                  t.driver_id == null
                    ? tr("unassigned").toUpperCase()
                    : (t.status || "ACTIVE").toUpperCase();
                const isAggregate = isAggregateTrip(t);
                const tripLedgerEntries = transactionsByTripId.get(t.id) ?? [];
                const displayClientName = shipperNameByTripId[t.id] ?? t.client_name ?? undefined;
                return (
                  <TripExpandableCard
                    key={t.id}
                    trip={t}
                    tripLedgerEntries={tripLedgerEntries}
                    cardDate={getTripCardDate(t)}
                    stage={stage}
                    isAggregate={isAggregate}
                    displayClientName={displayClientName}
                    onAssignmentUpdated={onRefresh}
                    onPress={() => router.push(`/trip/${t.id}` as const)}
                  />
                );
              })}
            </>
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
  container: { flex: 1, backgroundColor: Theme.screenBackground },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  message: { fontSize: 16, color: Theme.textSecondary },
  headerBlock: {
    backgroundColor: Theme.darkBackground,
    borderBottomWidth: 1,
    borderBottomColor: Theme.separatorDark,
    paddingBottom: 8,
  },
  tabSection: {
    backgroundColor: Theme.darkBackground,
    width: "100%",
    paddingTop: 4,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: Theme.separatorDark,
  },
  tabRow: {
    flexDirection: "row",
    gap: 16,
    marginHorizontal: 20,
    marginTop: 0,
    marginBottom: 0,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: Theme.separatorDark,
  },
  tab: { position: "relative" as const, paddingVertical: 4 },
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
  },
  filterPillRow: {
    flexDirection: "row",
    gap: 8,
    paddingBottom: 10,
  },
  filterPill: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  filterPillActive: {
    backgroundColor: Theme.darkBackground,
    borderColor: Theme.darkBackground,
  },
  filterPillText: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  filterPillTextActive: {
    color: Theme.textOnDark,
  },
  filterWrap: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 8,
    backgroundColor: Theme.surfaceGray,
    borderRadius: 20,
    padding: 10,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  filterInputRow: {
    flexDirection: "row",
    gap: 10,
  },
  filterInput: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 12,
    color: Theme.textPrimaryDark,
    minHeight: 0,
  },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 12 },
  empty: { padding: 24, textAlign: "center", color: Theme.textSecondary },
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
