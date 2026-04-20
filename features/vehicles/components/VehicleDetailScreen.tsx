import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Image,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { CenteredLoadingView } from "@/components/CenteredLoadingView";
import { FinanceFAB } from "@/components/FinanceFAB";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { LedgerTransactionListView } from "@/features/finance/components/LedgerTransactionListView";
import {
  createLedgerEntry,
  getTransactionsByOrganization,
  type LedgerRow,
} from "@/features/finance";
import { useOrganization } from "@/contexts/OrganizationContext";
import { canAccessFinance, getCapabilitiesFromProfile } from "@/lib/capabilities";
import { formatINR, formatLedgerDate, formatRelative, normalizeVehicleNumberForMatch } from "@/lib/format";
import { getTripLedgerEntries } from "@/features/finance/utils/getTripLedgerEntries";
import { getDriversByOrganization, type DriverRow } from "@/features/drivers";
import {
  getTripsByOrganization,
  getTripsWhereOrgIsSupplier,
  getTripDisplayNumber,
  type TripRow,
} from "@/features/trips/services/trips.service";
import { VehicleHealthBadge } from "@/features/ai";
import { buildTripPnL, getExpenseLinesForTripPnL } from "@/features/vehicles/pnl";
import { getVehicleTypeImage } from "../utils/trucks.util";
import { getVehicleById, type VehicleRow } from "../services/vehicles.service";
import {
  AddVehicleEntryModal,
  type TripOption,
  type DriverOption,
} from "./AddVehicleEntryModal";
import { VehicleDocumentsSection } from "./VehicleDocumentsSection";

export interface VehicleDetailScreenProps {
  vehicleId: string;
  onBack: () => void;
}

export default function VehicleDetailScreen({ vehicleId, onBack }: VehicleDetailScreenProps) {
  const { t } = useLanguage();
  const { profile } = useAuth();
  const { currentOrganization } = useOrganization();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const capabilities = getCapabilitiesFromProfile(
    profile ? { role: profile.role, aggregated: profile.aggregated, asset: profile.asset } : null,
  );
  const canAddTransaction = canAccessFinance(capabilities);
  const [vehicle, setVehicle] = useState<VehicleRow | null>(null);
  const [trips, setTrips] = useState<TripRow[]>([]);
  const [transactions, setTransactions] = useState<LedgerRow[]>([]);
  const [drivers, setDrivers] = useState<DriverOption[]>([]);
  const [driverRowsForLedger, setDriverRowsForLedger] = useState<DriverRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddTransactionModal, setShowAddTransactionModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [detailSubTab, setDetailSubTab] = useState<"trips" | "cash">("trips");
  const [refreshing, setRefreshing] = useState(false);
  const isRefreshingRef = useRef(false);
  const initialLoadDoneRef = useRef(false);

  const load = useCallback(() => {
    if (!vehicleId || !currentOrganization?.id) {
      setLoading(false);
      return;
    }
    if (!isRefreshingRef.current && !initialLoadDoneRef.current) setLoading(true);
    setError(null);
    const orgId = currentOrganization.id;
    Promise.all([
      getVehicleById(orgId, vehicleId),
      getTripsByOrganization(orgId),
      getTripsWhereOrgIsSupplier(orgId),
      getDriversByOrganization(orgId),
      getTransactionsByOrganization(orgId),
    ]).then(([res, ownerRes, supplierRes, driversRes, txRes]) => {
      if (res.error) {
        setError(res.error.message);
        setVehicle(null);
      } else {
        setVehicle(res.vehicle ?? null);
      }
      const ownerTrips = ownerRes.error ? [] : ownerRes.trips ?? [];
      const supplierTrips = supplierRes.error ? [] : supplierRes.trips ?? [];
      const byId = new Map(ownerTrips.map((t) => [t.id, t]));
      for (const t of supplierTrips) if (!byId.has(t.id)) byId.set(t.id, t);
      setTrips(Array.from(byId.values()));
      const driverList = driversRes?.error ? [] : (driversRes?.drivers ?? []);
      setDriverRowsForLedger(driverList);
      setDrivers(driverList.map((d) => ({ id: d.id, name: d.name ?? d.phone ?? t('driver') })));
      const allTx =
        (txRes.error ? [] : ((txRes.transactions ?? []) as LedgerRow[])) ?? [];
      setTransactions(allTx);
    }).finally(() => {
      setLoading(false);
      initialLoadDoneRef.current = true;
      isRefreshingRef.current = false;
      setRefreshing(false);
    });
  }, [vehicleId, currentOrganization?.id]);

  useEffect(() => load(), [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  /** Include trips by vehicle_id or by vehicle_display_number matching this vehicle (indent-based/own/supplier). */
  const tripMatchesVehicle = useCallback(
    (t: TripRow) => {
      if (t.vehicle_id === vehicleId) return true;
      if (!vehicle) return false;
      const displayNum = (t.vehicle_display_number ?? "").trim();
      if (!displayNum) return false;
      return (
        normalizeVehicleNumberForMatch(displayNum) ===
        normalizeVehicleNumberForMatch(vehicle.vehicle_number)
      );
    },
    [vehicleId, vehicle],
  );

  const tripOptions: TripOption[] = useMemo(
    () =>
      trips
        .filter(tripMatchesVehicle)
        .map((t) => ({
          id: t.id,
          trip_number: getTripDisplayNumber(t),
          route_label: [t.pickup_area, t.drop_location].filter(Boolean).join(' → ') || null,
          trip_date: formatLedgerDate(t.pickup_date || t.created_at),
          driver_id: t.driver_id ?? null,
        })),
    [trips, tripMatchesVehicle],
  );

  const vehicleTrips = useMemo(
    () => trips.filter(tripMatchesVehicle),
    [trips, tripMatchesVehicle],
  );

  const vehicleTransactions = useMemo(() => {
    const tripIds = new Set(vehicleTrips.map((t) => t.id));
    const targetVehicleNum = vehicle ? normalizeVehicleNumberForMatch(vehicle.vehicle_number) : null;
    return transactions.filter(
      (tx) => {
        if (tx.trip_id != null && tripIds.has(tx.trip_id)) return true;
        if (targetVehicleNum && tx.vehicle_number) {
          return normalizeVehicleNumberForMatch(tx.vehicle_number) === targetVehicleNum;
        }
        return false;
      }
    );
  }, [vehicleTrips, transactions, vehicle]);

  const vehicleTransactionsByTripId = useMemo(() => {
    const map = new Map<string, LedgerRow[]>();
    for (const trip of vehicleTrips) {
      map.set(trip.id, getTripLedgerEntries(vehicleTransactions, trip.id));
    }
    return map;
  }, [vehicleTrips, vehicleTransactions]);

  const missionRows = useMemo(() => {
    if (!vehicleTrips.length || !currentOrganization?.id) return [];
    const orgId = currentOrganization.id;
    const rows = vehicleTrips.map((trip) => {
      const tripLedgerEntries = vehicleTransactionsByTripId.get(trip.id) ?? [];
      const pnl = buildTripPnL(trip, tripLedgerEntries, getTripDisplayNumber, true);
      const isSupplierTrip =
        String(trip.organization_id ?? "").trim() !== String(orgId).trim();
      const sales = isSupplierTrip
        ? Number(trip.supplier_rate ?? 0)
        : pnl.sales;
      const expense = isSupplierTrip
        ? pnl.totalExpense - Number(trip.supplier_rate ?? 0)
        : pnl.totalExpense;
      const profit = sales - expense;
      const margin = sales > 0 ? (profit / sales) * 100 : expense > 0 ? -100 : 0;
      return {
        trip: pnl.trip,
        missionId: pnl.missionId,
        route: `${pnl.origin} → ${pnl.dest}`.trim() || "—",
        sales,
        expense,
        profit,
        margin,
        expenseLines: getExpenseLinesForTripPnL(pnl.trip, tripLedgerEntries, true),
      };
    });
    return rows;
  }, [vehicleTrips, vehicleTransactionsByTripId, currentOrganization?.id]);

  const vehicleTripDetailsMap = useMemo(() => {
    const m: Record<
      string,
      {
        trip_number: string;
        drop_location?: string;
        pickup_area?: string;
        client_name?: string;
        pickup_date?: string | null;
      }
    > = {};
    trips.forEach((t) => {
      m[t.id] = {
        trip_number: getTripDisplayNumber(t),
        drop_location: t.drop_location ?? undefined,
        pickup_area: t.pickup_area ?? undefined,
        client_name: t.client_name ?? undefined,
        pickup_date: t.pickup_date ?? undefined,
      };
    });
    return m;
  }, [trips]);

  const contractValue = useMemo(
    () => missionRows.reduce((s, r) => s + r.sales, 0),
    [missionRows],
  );
  const totalExpense = useMemo(
    () => missionRows.reduce((s, r) => s + r.expense, 0),
    [missionRows],
  );
  const profit = useMemo(
    () => missionRows.reduce((s, r) => s + r.profit, 0),
    [missionRows],
  );
  const health = contractValue > 0 ? Math.round((profit / contractValue) * 100) : 0;

  const handleVehicleEntrySubmit = useCallback(
    (data: Parameters<typeof createLedgerEntry>[1]) => {
      if (!currentOrganization?.id) return;
      createLedgerEntry(currentOrganization.id, data).then(({ error: err }) => {
        if (!err) {
          setShowAddTransactionModal(false);
          load();
        } else Alert.alert(t('transactionFailed'), err.message);
      });
    },
    [currentOrganization?.id, load],
  );

  if (loading) {
    return (
      <CenteredLoadingView
        message={t("loadingVehicle")}
      />
    );
  }

  if (error || !vehicle) {
    return (
      <View style={[styles.wrap, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={onBack}
            activeOpacity={0.8}
          >
            <FontAwesome
              name="chevron-left"
              size={20}
              color={Theme.textPrimaryDark}
            />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {t("vehicle")}
            </Text>
          </View>
          <View style={styles.backBtn} />
        </View>
        <View style={styles.errorWrap}>
          <Text style={styles.errorText}>{error || t("vehicleNotFound")}</Text>
        </View>
      </View>
    );
  }

  const vehicleTypeLabel = [vehicle.vehicle_brand, vehicle.vehicle_model, vehicle.vehicle_body_type]
    .filter(Boolean)
    .join(' ') || vehicle.vehicle_type || '—';

  const truckImage = getVehicleTypeImage(vehicle.vehicle_type);

  return (
    <View style={[styles.wrap, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={onBack}
          activeOpacity={0.8}
        >
          <FontAwesome
            name="chevron-left"
            size={20}
            color={Theme.textPrimaryDark}
          />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {vehicle.vehicle_number}
          </Text>
          <Text style={styles.headerSubtitle}>VEHICLE FINANCIAL VIEW</Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.profileBtn}
            onPress={() => setShowProfileModal(true)}
            activeOpacity={0.8}
            accessibilityLabel="Vehicle profile"
          >
            <FontAwesome name="truck" size={16} color={Theme.textOnPrimary} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingBottom: canAddTransaction
              ? Layout.fabBottomOffset + Layout.fabSize + insets.bottom
              : Layout.fabBottomOffset + insets.bottom,
          },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              isRefreshingRef.current = true;
              setRefreshing(true);
              load();
            }}
            tintColor={Theme.teslaRed}
          />
        }
      >
        <View style={styles.scorecard}>
          <View style={styles.scorecardTop}>
            <View style={styles.scorecardLeft}>
              <Text style={styles.scorecardLabel}>FINANCIAL OVERVIEW</Text>
              <Text style={styles.scorecardSalesLabel}>VEHICLE SALES</Text>
              <Text style={styles.scorecardAmount}>
                {formatINR(contractValue)}
              </Text>
            </View>
            <View style={styles.healthCircle}>
              <View
                style={[
                  styles.healthCircleFill,
                  { height: `${Math.min(100, health)}%` },
                ]}
              />
              <Text style={styles.healthCircleText}>{health}%</Text>
            </View>
          </View>
          <View style={styles.scorecardGrid}>
            <View>
              <Text style={styles.scorecardGridLabelPaid}>EXPENSE</Text>
              <Text style={styles.scorecardGridPaid}>
                {formatINR(totalExpense)}
              </Text>
            </View>
            <View style={styles.scorecardGridRight}>
              <Text style={styles.scorecardGridLabelDue}>PROFIT</Text>
              <Text style={styles.scorecardGridDue}>{formatINR(profit)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[
              styles.tabItem,
              detailSubTab === "trips" && styles.tabItemActive,
            ]}
            onPress={() => setDetailSubTab("trips")}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.tabItemText,
                detailSubTab === "trips" && styles.tabItemTextActive,
              ]}
            >
              Trips
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.tabItem,
              detailSubTab === "cash" && styles.tabItemActive,
            ]}
            onPress={() => setDetailSubTab("cash")}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.tabItemText,
                detailSubTab === "cash" && styles.tabItemTextActive,
              ]}
            >
              Cash Flow
            </Text>
          </TouchableOpacity>
        </View>

        {detailSubTab === "trips" && (
          <View style={styles.tableCard}>
            <View style={styles.tableHeader}>
              <Text style={[styles.th, styles.thMission]}>Trip</Text>
              <Text style={[styles.th, styles.thSales]}>Sales</Text>
              <Text style={[styles.th, styles.thRight]}>Expense</Text>
              <Text style={[styles.th, styles.thRight]}>Profit</Text>
            </View>
            {missionRows.length > 0 ? (
              missionRows.map((row) => (
                <TouchableOpacity
                  key={row.trip.id}
                  style={styles.tableRow}
                  activeOpacity={0.7}
                  onPress={() =>
                    router.push(
                      `/trip/${row.trip.id}?entryContext=vehicle` as const,
                    )
                  }
                >
                  <View style={styles.tdMission}>
                    <Text style={styles.tdMissionId}>{row.missionId}</Text>
                    <Text style={styles.tdRoute} numberOfLines={1}>
                      {row.route}
                    </Text>
                  </View>
                  <Text style={[styles.td, styles.tdSales]}>
                    {formatINR(row.sales)}
                  </Text>
                  <Text
                    style={[
                      styles.td,
                      styles.tdRight,
                      styles.tdRed,
                    ]}
                  >
                    {formatINR(row.expense)}
                  </Text>
                  <Text
                    style={[
                      styles.td,
                      styles.tdRight,
                      row.profit >= 0 ? styles.tdGreen : styles.tdRed,
                    ]}
                  >
                    {formatINR(row.profit)}
                  </Text>
                </TouchableOpacity>
              ))
            ) : (
              <View style={styles.emptyRow}>
                <Text style={styles.emptyRowText}>No trips</Text>
              </View>
            )}
          </View>
        )}

        {detailSubTab === "cash" && (
          <View style={styles.cashSection}>
            <LedgerTransactionListView
              transactions={vehicleTransactions}
              tripDetailsMap={vehicleTripDetailsMap}
              tripOptions={tripOptions.map((t) => ({
                id: t.id,
                trip_number: t.trip_number,
                route: t.route_label ?? undefined,
                trip_date: t.trip_date ?? undefined,
              }))}
              useTimelineLayout={true}
              showFiscalSubTabs={false}
              showTitle={false}
              showHistoryHeader={false}
              showGridFooter={false}
              embedInParentScroll={true}
              driverRows={driverRowsForLedger}
            />
          </View>
        )}
      </ScrollView>

      {canAddTransaction && (
        <View
          style={[
            styles.fabWrap,
            { bottom: Layout.fabBottomOffset + insets.bottom },
          ]}
        >
          <FinanceFAB
            onPress={() => {
              const params = new URLSearchParams();
              params.set("entityType", "VEHICLE");
              params.set("entityId", vehicleId);
              params.set("partyName", vehicle?.vehicle_number ?? "");
              router.push(
                (`/(modals)/ledger-sync?${params.toString()}`) as
                  `/(modals)/ledger-sync`,
              );
            }}
            accessibilityLabel={t("addTransaction")}
            icon="receipt-text"
          />
        </View>
      )}

      <AddVehicleEntryModal
        visible={showAddTransactionModal}
        onClose={() => setShowAddTransactionModal(false)}
        onSubmit={handleVehicleEntrySubmit}
        vehicleNumber={vehicle?.vehicle_number ?? ""}
        entryContextLabel={vehicle?.vehicle_number ?? t("vehicle")}
        trips={tripOptions}
        drivers={drivers}
      />

      <Modal
        visible={showProfileModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowProfileModal(false)}
      >
        <View
          style={[
            styles.profileModalWrap,
            { paddingTop: insets.top, paddingBottom: insets.bottom },
          ]}
        >
          <View style={styles.profileModalHeader}>
            <Text style={styles.profileModalTitle}>Vehicle Profile</Text>
            <TouchableOpacity
              onPress={() => setShowProfileModal(false)}
              style={styles.profileModalCloseBtn}
              hitSlop={12}
            >
              <FontAwesome
                name="times"
                size={18}
                color={Theme.textPrimaryDark}
              />
            </TouchableOpacity>
          </View>
          <ScrollView
            style={styles.profileModalScroll}
            contentContainerStyle={styles.profileModalContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.profileCard}>
              <View style={styles.profileCardTop}>
                <View style={styles.profileAvatarWrap}>
                  <Image
                    source={truckImage}
                    style={styles.truckImage}
                    resizeMode="contain"
                  />
                </View>
                <View style={styles.profileCardTopText}>
                  <Text style={styles.profileEntityName} numberOfLines={2}>
                    {vehicle.vehicle_number}
                  </Text>
                  <View style={styles.profileBadges}>
                    <View
                      style={[styles.profileBadge, styles.profileBadgeCore]}
                    >
                      <Text style={styles.profileBadgeCoreText}>
                        {vehicleTypeLabel}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
              {currentOrganization?.id && (
                <View style={styles.profileGrid}>
                  <View style={styles.profileGridItem}>
                    <Text style={styles.profileGridLabel}>Health</Text>
                    <VehicleHealthBadge
                      organizationId={currentOrganization.id}
                      vehicleId={vehicleId}
                    />
                  </View>
                  <View style={styles.profileGridItem}>
                    <Text style={styles.profileGridLabel}>Added</Text>
                    <Text style={styles.profileGridValue}>
                      {formatRelative(vehicle.created_at)}
                    </Text>
                  </View>
                </View>
              )}
            </View>
            {currentOrganization?.id && (
              <VehicleDocumentsSection
                organizationId={currentOrganization.id}
                vehicleId={vehicleId}
                documents={vehicle.documents}
                onDocumentsUpdated={(docs) =>
                  setVehicle((v) => (v ? { ...v, documents: docs } : null))
                }
              />
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  errorText: { fontSize: 15, color: Theme.textSecondary },
  errorWrap: { padding: 16 },
  wrap: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingVertical: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.05)",
    backgroundColor: "rgba(255,255,255,0.6)",
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "800",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 1.2,
    marginTop: 2,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  profileBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Theme.darkBackground,
    alignItems: "center",
    justifyContent: "center",
  },
  fabWrap: {
    position: "absolute",
    right: Layout.fabRightOffset,
    zIndex: 100,
    elevation: 10,
  },
  downloadBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Theme.darkBackground,
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 24,
  },
  scorecard: {
    backgroundColor: Theme.darkBackground,
    borderRadius: 40,
    padding: 32,
    marginBottom: 24,
    overflow: "hidden",
  },
  scorecardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 24,
  },
  scorecardLeft: { flex: 1 },
  scorecardLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.aggregatePillText,
    letterSpacing: 1.2,
  },
  scorecardSalesLabel: {
    fontSize: 8,
    fontWeight: "700",
    color: "rgba(255,255,255,0.7)",
    letterSpacing: 1,
    marginTop: 6,
    textTransform: "uppercase",
  },
  scorecardAmount: {
    fontSize: 28,
    fontWeight: "300",
    fontStyle: "italic",
    color: Theme.textOnDark,
    marginTop: 4,
  },
  healthCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 4,
    borderColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  healthCircleFill: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Theme.darkGreen,
  },
  healthCircleText: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textOnDark,
    zIndex: 1,
  },
  scorecardGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.1)",
  },
  scorecardGridRight: { alignItems: "flex-end" },
  scorecardGridLabelPaid: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.darkGreen,
    letterSpacing: 0.6,
  },
  scorecardGridLabelDue: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.teslaRed,
    letterSpacing: 0.6,
  },
  scorecardGridPaid: {
    fontSize: 18,
    fontWeight: "800",
    fontStyle: "italic",
    color: Theme.textOnDark,
    marginTop: 4,
  },
  scorecardGridDue: {
    fontSize: 18,
    fontWeight: "800",
    fontStyle: "italic",
    color: Theme.teslaRed,
    marginTop: 4,
  },
  tabRow: {
    flexDirection: "row",
    backgroundColor: Theme.surfaceGray,
    padding: 4,
    borderRadius: 16,
    marginBottom: 24,
    gap: 4,
  },
  tabItem: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 40,
  },
  tabItemActive: {
    backgroundColor: Theme.screenBackground,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  tabItemText: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 0.4,
  },
  tabItemTextActive: {
    color: Theme.textPrimaryDark,
  },
  tableCard: {
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 32,
    overflow: "hidden",
  },
  tableHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: Theme.surfaceLight,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  th: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  thMission: { flex: 2, minWidth: 0 },
  thSales: { flex: 1, textAlign: "right" as const },
  thRight: { flex: 1, textAlign: "right" as const },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  td: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  tdMission: { flex: 2, minWidth: 0 },
  tdMissionId: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
  },
  tdRoute: {
    fontSize: 10,
    color: Theme.textMuted,
    marginTop: 4,
  },
  tdSales: { flex: 1, textAlign: "right" as const },
  tdRight: { flex: 1, textAlign: "right" as const },
  tdGreen: { color: Theme.darkGreen },
  tdRed: { color: Theme.teslaRed },
  emptyRow: { paddingVertical: 24, alignItems: "center" },
  emptyRowText: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  cashSection: { marginBottom: 24 },
  profileModalWrap: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
  },
  profileModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  profileModalTitle: {
    fontSize: 14,
    fontWeight: "800",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
  },
  profileModalCloseBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  profileModalScroll: { flex: 1 },
  profileModalContent: {
    padding: Layout.screenPaddingHorizontal,
    paddingBottom: 32,
  },
  profileCard: {
    backgroundColor: Theme.screenBackground,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    padding: 20,
    marginBottom: 16,
  },
  profileCardTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    marginBottom: 20,
  },
  profileAvatarWrap: {
    width: 64,
    height: 64,
    borderRadius: 24,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    alignItems: "center",
    justifyContent: "center",
  },
  truckImage: { width: 64, height: 36 },
  profileCardTopText: { flex: 1, minWidth: 0 },
  profileEntityName: {
    fontSize: 18,
    fontWeight: "800",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    marginBottom: 8,
  },
  profileBadges: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  profileBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: Theme.positiveMuted,
    borderWidth: 1,
    borderColor: Theme.darkGreen,
  },
  profileBadgeText: {
    fontSize: 7,
    fontWeight: "700",
    color: Theme.darkGreen,
    textTransform: "uppercase",
  },
  profileBadgeCore: {
    backgroundColor: Theme.fiscalTabActiveBg ?? "#e8eaf6",
    borderColor: Theme.primary,
  },
  profileBadgeCoreText: {
    fontSize: 7,
    fontWeight: "700",
    color: Theme.primary,
    textTransform: "uppercase",
  },
  profileGrid: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  profileGridItem: {
    flex: 1,
    backgroundColor: Theme.surfaceGray,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  profileGridLabel: {
    fontSize: 7,
    fontWeight: "700",
    color: Theme.primary,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  profileGridValue: {
    fontSize: 14,
    fontWeight: "800",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
  },
});
