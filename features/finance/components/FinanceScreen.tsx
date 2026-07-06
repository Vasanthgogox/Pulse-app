import { SceneLoadingSplash } from "@/components/chromeLoadingScreens";
import type {
    DriverPaymentType,
    PartyOption,
    TripOption,
} from "@/components/AddTransactionModal";
import { DateRangePickerModal } from "@/components/DateRangePickerModal";
import { FinanceFAB } from "@/components/FinanceFAB";
import { Layout } from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import type {
    ClientRow,
    UpdateClientData,
} from "@/features/clients/services/clients.service";
import { updateClient } from "@/features/clients/services/clients.service";
import {
    getDriverLedgerByDriver,
    type DriverLedgerRow,
} from "@/features/drivers/services/drivers.service";
import {
    aggregateCustomers,
    aggregateDrivers,
    aggregateSuppliers,
    type DriverOfferForAggregation,
} from "@/features/finance/aggregation";
import { ledgerDayMatchesPeriod } from "@/features/finance/lib/filterLedgerByPeriod";
import type {
    SupplierRow,
    UpdateSupplierData,
} from "@/features/suppliers/services/suppliers.service";
import { updateSupplier } from "@/features/suppliers/services/suppliers.service";
import { getTripDisplayNumber, type TripRow } from "@/features/trips/services/trips.service";
import {
    buildUniqueLinkedOrgIdMap,
    isIntegratedClientRow,
    isIntegratedSupplierRow,
    isLoadBasedTrip,
} from "@/features/trips/visibility/tripVisibility";
import type { DriversViewTab } from "@/features/drivers/components/DriversTab";
import type { GarrageViewTab } from "@/features/vehicles/components/GarrageTab";
import {
  countVehicleMatchedTripsInPeriod,
  pickDefaultGaragePeriod,
} from "@/features/vehicles/pnl";
import type { CustomersViewTab } from "@/features/clients/components/CustomersTab";
import type { SuppliersViewTab } from "@/features/suppliers/components/SuppliersTab";
import {
    canAccessFinance,
    getCapabilitiesFromProfile,
} from "@/lib/capabilities";
import { tripDayIso } from "@/lib/dateRangePresets";
import { formatLedgerDate } from "@/lib/format";
import { useTripFinanceAdjustmentsMap } from "@/lib/queries/useTripFinanceAdjustmentsQuery";
import { useDriverProfileImagesQuery } from "@/lib/queries/useDriverProfileImagesQuery";
import { useRealtimeTransactionsInvalidation } from "@/lib/queries/useRealtimeInvalidation";
import { useInvalidateTransactions } from "@/lib/queries/useTransactionsQuery";
import { queryKeys } from "@/lib/queryKeys";
import { ROUTES } from "@/lib/routes";
import { clearAllDomainCacheMetaForOrg } from "@/lib/cache/cacheMetadataStore";
import { useLinkedOrgProfileMap } from "@/lib/useLinkedOrgProfileMap";
import { useQueryClient } from "@tanstack/react-query";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Platform,
    RefreshControl,
    ScrollView,
    Text,
    View,
    useWindowDimensions,
} from "react-native";
import { useTabBarAwareScrollProps } from "@/contexts/DemoTabBarScrollContext";
import { useLayoutInsets } from "@/lib/layoutInsets";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFinanceAddEntityHandlers } from "../hooks/useFinanceAddEntityHandlers";
import { useFinanceEntities } from "../hooks/useFinanceEntities";
import { useFinanceLedger } from "../hooks/useFinanceLedger";
import { useFinanceTransactionSubmit } from "../hooks/useFinanceTransactionSubmit";
import type { LedgerRow } from "../services/finance.service";
import { createReportRow } from "../lib/reportRow.util";
import type { FinanceSubTab } from "../types";
import type { TripEntryContext } from "./EntityDetailOverlay";
import { EntityListCategoryModal } from "./EntityListCategoryModal";
import { FinanceModalsGate } from "./FinanceModalsGate";
import { FinancePartyRegistrationPortal } from "./FinancePartyRegistrationPortal";
import { styles } from "./FinanceScreen.styles";
import { FinanceSummarySection } from "./FinanceSummarySection";
import { FinanceTabRow } from "./FinanceTabRow";
import type { PartyRegistrationKind } from "./PartyRegistrationPortal";
import { FinanceTabBody } from "./FinanceTabBody";
import type { FinancialRowData } from "./FinancialRow";
import type { EntityListFilter } from "./TreasurySummaryCard";

function financeSubTabToPartyKind(
  tab: FinanceSubTab,
): PartyRegistrationKind | null {
  if (tab === "customers") return "client";
  if (tab === "suppliers") return "supplier";
  if (tab === "garage") return "vehicle";
  if (tab === "drivers") return "driver";
  return null;
}

export function FinanceScreen() {
  const insets = useSafeAreaInsets();
  const layout = useLayoutInsets();
  const screenTopPad =
    Platform.OS === "web" ? 0 : insets.top + Layout.headerPaddingBelowInset;
  const { width: screenWidth } = useWindowDimensions();
  const tabBarScrollProps = useTabBarAwareScrollProps();
  /** Native + mobile web: one scroll surface (header scrolls with ledger). */
  const useMobileUnifiedScroll = Platform.OS !== "web" || screenWidth < 1024;
  /** Web (any width): same in-tab portal as modal routes — avoids legacy sheet on mobile browser. */
  const usePartyPortalOnWeb = Platform.OS === "web";
  const [partyPortalOpen, setPartyPortalOpen] = useState(false);
  const [partyPortalKind, setPartyPortalKind] =
    useState<PartyRegistrationKind>("client");
  const router = useRouter();
  const { t } = useLanguage();
  const { profile } = useAuth();
  const capabilities = getCapabilitiesFromProfile(
    profile
      ? {
          role: profile.role,
          aggregated: profile.aggregated,
          asset: profile.asset,
        }
      : null,
  );
  const canAccess = canAccessFinance(capabilities);
  const {
    currentOrganization,
    refreshOrganization,
    isLoading: isOrgLoading,
  } = useOrganization();
  const queryClient = useQueryClient();
  const invalidateTransactions = useInvalidateTransactions();
  const [entitiesRefreshKey, setEntitiesRefreshKey] = useState(0);
  const [financeSubTab, setFinanceSubTab] = useState<FinanceSubTab>("cash");
  const entities = useFinanceEntities({
    organizationId: currentOrganization?.id ?? null,
    canAccess,
    refreshKey: entitiesRefreshKey,
    includeGaragePeriodOptions: financeSubTab === "garage",
  });
  // tripRows from useTripsQuery already includes cross-org supplier trips (get_trips_for_org returns both).
  // Do NOT concat tripsWhereOrgIsSupplier again — that's a derived subset of tripRows, not additional data.
  const allTripsForLedger = useMemo(
    () => entities.tripRows,
    [entities.tripRows],
  );


  const ledger = useFinanceLedger({
    organizationId: currentOrganization?.id ?? null,
    canAccess,
    tripRows: allTripsForLedger,
    vehicleRows: entities.vehicleRows,
    clients: entities.clientRows,
    suppliers: entities.supplierRows,
  });
  useRealtimeTransactionsInvalidation(
    canAccess ? (currentOrganization?.id ?? null) : null,
  );
  const {
    clients,
    clientRows,
    trips,
    tripRows,
    tripsWhereOrgIsClient,
    tripsWhereOrgIsSupplier,
    supplierRows,
    suppliersList,
    vehicleRows,
    driverRows,
    driverOffers,
    connectionRequestsSent,
    entitiesLoading,
    tripsError,
    refetchTrips,
    garagePeriodOptions,
    indentsForFinance,
    setPendingDriverSalaryRequests,
  } = entities;

  const [garagePeriod, setGaragePeriod] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}`;
  });
  const garagePeriodAutoSetOrgRef = useRef<string | null>(null);

  useEffect(() => {
    garagePeriodAutoSetOrgRef.current = null;
  }, [currentOrganization?.id]);

  const linkedOrgDisplayMap = useLinkedOrgProfileMap(clientRows, supplierRows);

  useEffect(() => {
    const orgId = currentOrganization?.id ?? null;
    if (!orgId || entitiesLoading) return;
    if (garagePeriodAutoSetOrgRef.current === orgId) return;
    if (tripRows.length === 0 || vehicleRows.length === 0) return;

    const matchedInCurrent = countVehicleMatchedTripsInPeriod(
      tripRows,
      vehicleRows,
      garagePeriod,
    );
    if (matchedInCurrent === 0) {
      const preferred = pickDefaultGaragePeriod(tripRows, vehicleRows);
      if (preferred !== garagePeriod) {
        setGaragePeriod(preferred);
      }
    }
    garagePeriodAutoSetOrgRef.current = orgId;
  }, [
    currentOrganization?.id,
    entitiesLoading,
    tripRows,
    vehicleRows,
    garagePeriod,
  ]);

  const {
    ledgerTransactions,
    ledgerLoading,
    ledgerRefreshKey,
    setLedgerTransactions,
    setLedgerRefreshKey,
    refetchLedger,
    financePeriodFilter,
    setFinancePeriodFilter,
    financeCustomRangeFrom,
    financeCustomRangeTo,
    setFinanceCustomRange,
    sourceSupplyFilter,
    setSourceSupplyFilter,
    selectedLedgerCategory,
    setSelectedLedgerCategory,
    cashDirectionFilter,
    setCashDirectionFilter,
    searchQuery,
    setSearchQuery,
    filteredLedger,
    filteredLedgerForDisplay,
    filteredLedgerForKanban,
    ledgerTotalsData,
    ledgerCategoryCounts,
    tripCountByParty,
    getVehicleNumberForTripId,
    tripPartyMap,
    tripDetailsMap,
    clearFilters: ledgerClearFilters,
    isAnyFilterActive: ledgerAnyFilterActive,
    fetchNextLedgerPage,
    hasNextLedgerPage,
    ledgerPageLoading,
  } = ledger;

  const financeDateOpts = useMemo(
    () => ({
      customFrom: financeCustomRangeFrom,
      customTo: financeCustomRangeTo,
    }),
    [financeCustomRangeFrom, financeCustomRangeTo],
  );

  const tripMatchesFinanceDate = useCallback(
    (t: TripRow) =>
      ledgerDayMatchesPeriod(
        tripDayIso(t),
        financePeriodFilter,
        financeDateOpts,
      ),
    [financePeriodFilter, financeDateOpts],
  );

  const financeFilteredTripsWhereOrgIsClient = useMemo(
    () => tripsWhereOrgIsClient.filter(tripMatchesFinanceDate),
    [tripsWhereOrgIsClient, tripMatchesFinanceDate],
  );
  const financeFilteredTripsWhereOrgIsSupplier = useMemo(
    () => tripsWhereOrgIsSupplier.filter(tripMatchesFinanceDate),
    [tripsWhereOrgIsSupplier, tripMatchesFinanceDate],
  );
  const financeFilteredAllTripsForLedger = useMemo(
    () => allTripsForLedger.filter(tripMatchesFinanceDate),
    [allTripsForLedger, tripMatchesFinanceDate],
  );

  const financeTripIdsForAdjustments = useMemo(() => {
    const ids = new Set<string>();
    for (const t of allTripsForLedger) {
      if (t?.id) ids.add(String(t.id));
    }
    for (const t of tripsWhereOrgIsClient) {
      if (t?.id) ids.add(String(t.id));
    }
    return [...ids];
  }, [allTripsForLedger, tripsWhereOrgIsClient]);

  const { record: tripFinanceAdjRecord, isLoading: tripFinanceAdjLoading } =
    useTripFinanceAdjustmentsMap(
      currentOrganization?.id ?? null,
      financeTripIdsForAdjustments,
    );
  /** Until adjustments load, keep aggregation on raw trip rates (same as pre-registry). */
  const tripFinanceAdjustmentsByTripId = tripFinanceAdjLoading
    ? undefined
    : tripFinanceAdjRecord;

  const financeTripOptionIds = useMemo(
    () => new Set(financeFilteredAllTripsForLedger.map((t) => t.id)),
    [financeFilteredAllTripsForLedger],
  );
  const filteredTripOptionsForFinance = useMemo(
    () => trips.filter((o) => financeTripOptionIds.has(o.id)),
    [trips, financeTripOptionIds],
  );

  const [entityFilter, setEntityFilter] = useState<EntityListFilter>("all");
  const [financeDateModalVisible, setFinanceDateModalVisible] = useState(false);
  const [showTransactionModal, setShowTransactionModal] = useState(false);
  const [showAddClientModal, setShowAddClientModal] = useState(false);
  const [showAddVehicleModal, setShowAddVehicleModal] = useState(false);
  const [showAddDriverModal, setShowAddDriverModal] = useState(false);
  const [showAddSupplierModal, setShowAddSupplierModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState<LedgerRow | null>(null);
  const [tabTotals, setTabTotals] = useState({ totalIn: 0, totalOut: 0 });
  const [refreshing, setRefreshing] = useState(false);
  const driverIdsForProfiles = useMemo(() => {
    const ids = new Set<string>();
    for (const row of ledgerTransactions ?? []) {
      const id = (row.contact_id ?? "").trim();
      if (id && row.contact_type === "driver") ids.add(id);
    }
    return Array.from(ids);
  }, [ledgerTransactions]);

  const profileImages = useDriverProfileImagesQuery(driverIdsForProfiles);

  const isAnyFilterActive = useMemo(
    () => ledgerAnyFilterActive || entityFilter !== "all",
    [ledgerAnyFilterActive, entityFilter],
  );

  const handleClearFilters = useCallback(() => {
    ledgerClearFilters();
    setEntityFilter("all");
  }, [ledgerClearFilters]);

  const openAddPartyForSubTab = useCallback(
    (subTab: "customers" | "suppliers" | "garage" | "drivers") => {
      const partyKind = financeSubTabToPartyKind(subTab);
      const routeAdd =
        subTab === "customers"
          ? () => router.push("/(modals)/add-client" as const)
          : subTab === "suppliers"
            ? () => router.push("/(modals)/add-supplier" as const)
            : subTab === "garage"
              ? () =>
                  router.push({
                    pathname: "/(modals)/add-vehicle",
                    params: { returnTo: "/(tabs)/finance" },
                  })
              : () => router.push("/(modals)/add-driver" as const);
      if (partyKind && usePartyPortalOnWeb) {
        setPartyPortalKind(partyKind);
        setPartyPortalOpen(true);
        return;
      }
      routeAdd();
    },
    [router, usePartyPortalOnWeb],
  );

  const handleAddPartyPress = useCallback(() => {
    if (
      financeSubTab === "customers" ||
      financeSubTab === "suppliers" ||
      financeSubTab === "garage" ||
      financeSubTab === "drivers"
    ) {
      openAddPartyForSubTab(financeSubTab);
    }
  }, [financeSubTab, openAddPartyForSubTab]);

  const handleKanbanPartyAddPress = openAddPartyForSubTab;

  const [showEntityListModal, setShowEntityListModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showSharedLedgerModal, setShowSharedLedgerModal] = useState(false);
  const [selectedEntity, setSelectedEntity] = useState<{
    data: FinancialRowData;
    entityType: "CLIENT" | "SUPPLIER" | "VEHICLE" | "DRIVER";
    subTab: FinanceSubTab;
    initialDetailTab?: "main" | "ledger" | "shared_ledger";
  } | null>(null);
  const [selectedDriverLedgerEntries, setSelectedDriverLedgerEntries] =
    useState<DriverLedgerRow[] | null>(null);
  const [garageTripIdForPnL, setGarageTripIdForPnL] = useState<string | null>(
    null,
  );

  const [editingClient, setEditingClient] = useState<ClientRow | null>(null);
  const [showEditClientModal, setShowEditClientModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<SupplierRow | null>(
    null,
  );
  const [showEditSupplierModal, setShowEditSupplierModal] = useState(false);
  const salaryRequestIdToPayAfterSubmitRef = useRef<string | null>(null);
  const [
    defaultDriverPaymentTypeForModal,
    setDefaultDriverPaymentTypeForModal,
  ] = useState<DriverPaymentType | null>(null);
  const [payDriverRequestTripPrefill, setPayDriverRequestTripPrefill] =
    useState<{
      defaultTripId: string;
      tripLocked: boolean;
    } | null>(null);
  const [addEntryContext, setAddEntryContext] =
    useState<TripEntryContext | null>(null);
  const [garageViewTab, setGarageViewTab] = useState<GarrageViewTab>("vehicle");
  const [driverViewTab, setDriverViewTab] = useState<DriversViewTab>("list");
  const [customerViewTab, setCustomerViewTab] = useState<CustomersViewTab>("list");
  const [supplierViewTab, setSupplierViewTab] = useState<SuppliersViewTab>("list");

  const onSuccessNavigateToDetail = useCallback(
    (data: import("@/components/AddTransactionModal").AddTransactionData) => {
      if (data.tripId) {
        router.push(`/trip/${data.tripId}` as const);
        return;
      }
      const partyId = data.partyId ?? null;
      const contactType = data.contactType ?? null;
      if (partyId && partyId !== "misc") {
        if (contactType === "client") {
          router.push(`/client/${partyId}` as const);
          return;
        }
        if (contactType === "supplier") {
          router.push(`/supplier/${partyId}` as const);
          return;
        }
        if (contactType === "driver") {
          const driverId =
            partyId === "driver-salary" ? (data.contactId ?? partyId) : partyId;
          if (driverId) router.push(`/driver/${driverId}` as const);
        }
      }
    },
    [router],
  );

  const handleTransactionSubmit = useFinanceTransactionSubmit({
    orgId: currentOrganization?.id ?? null,
    profileUid: profile?.uid,
    selectedEntity,
    ledgerTransactions,
    tripRows,
    editingEntry,
    setLedgerTransactions,
    setLedgerRefreshKey,
    setEditingEntry,
    setAddEntryContext,
    setShowTransactionModal,
    setEntitiesRefreshKey,
    setPendingDriverSalaryRequests,
    salaryRequestIdToPayAfterSubmitRef,
    onSuccessNavigate: onSuccessNavigateToDetail,
  });

  const handleEditClient = useCallback((client: ClientRow) => {
    setEditingClient(client);
    setShowEditClientModal(true);
  }, []);

  const handleEditClientComplete = async (patch: UpdateClientData) => {
    if (!currentOrganization?.id || !editingClient) return;
    const { error } = await updateClient(
      currentOrganization.id,
      editingClient.id,
      patch,
    );
    if (!error) {
      setEntitiesRefreshKey((k) => k + 1);
      setEditingClient(null);
    }
  };

  const handleEditSupplier = useCallback((supplier: SupplierRow) => {
    setEditingSupplier(supplier);
    setShowEditSupplierModal(true);
  }, []);

  const handleEditSupplierComplete = async (patch: UpdateSupplierData) => {
    if (!currentOrganization?.id || !editingSupplier) return;
    const { error } = await updateSupplier(
      currentOrganization.id,
      editingSupplier.id,
      patch,
    );
    if (!error) {
      setEntitiesRefreshKey((k) => k + 1);
      setEditingSupplier(null);
    }
  };

  const addEntityHandlers = useFinanceAddEntityHandlers({
    organizationId: currentOrganization?.id ?? null,
    organizationName: currentOrganization?.name ?? undefined,
    setEntitiesRefreshKey,
    setShowAddClientModal,
    setShowAddSupplierModal,
    setShowAddVehicleModal,
    setShowAddDriverModal,
  });
  const {
    NO_ORG_MESSAGE,
    handleAddClientComplete,
    searchInviteeByPhone,
    handleSendClientInvitation,
    handleSendSupplierInvitation,
    handleAddVehicleComplete,
    handleAddDriverInviteComplete,
    handleAddDriverDirect,
    handleAddSupplierComplete,
  } = addEntityHandlers;

  /** Tab refocus must not remount entities/ledger — realtime + pull-to-refresh handle freshness. */

  useEffect(() => {
    if (selectedEntity?.entityType !== "DRIVER" || !selectedEntity.data.id) {
      setSelectedDriverLedgerEntries(null);
      return;
    }
    let cancelled = false;
    setSelectedDriverLedgerEntries(null);
    getDriverLedgerByDriver(selectedEntity.data.id).then(
      ({ error, entries }) => {
        if (!cancelled && !error) setSelectedDriverLedgerEntries(entries ?? []);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [selectedEntity?.entityType, selectedEntity?.data?.id, ledgerRefreshKey]);

  const summaryLabels = useMemo(() => {
    switch (financeSubTab) {
      case "cash":
        return { in: t("totalCashIn"), out: t("totalCashOut") };
      case "customers":
        return { in: t("totalBilling"), out: t("totalBalance") };
      case "suppliers":
        return { in: t("totalPayables"), out: t("unsettledDue") };
      case "garage":
        return { in: t("assetRevenue"), out: t("netProfit") };
      case "drivers":
        return { in: t("payrollVol"), out: t("salaryDue") };
      default:
        return { in: t("totalCashIn"), out: t("totalCashOut") };
    }
  }, [financeSubTab, t]);

  const formatCompactRupee = useCallback(
    (value: number | null | undefined): string => {
      const safeValue = Number(value ?? 0);
      const abs = Math.abs(safeValue);
      if (abs >= 100000) return `₹${(safeValue / 100000).toFixed(1)}L`;
      if (abs >= 1000) return `₹${(safeValue / 1000).toFixed(1)}k`;
      return `₹${safeValue.toLocaleString("en-IN")}`;
    },
    [],
  );

  const desktopCardMetrics = useMemo(() => {
    const customersAgg = aggregateCustomers(
      clientRows,
      allTripsForLedger,
      ledgerTransactions ?? [],
      tripPartyMap,
      indentsForFinance,
    );
    const suppliersAgg = aggregateSuppliers(
      supplierRows,
      allTripsForLedger,
      ledgerTransactions ?? [],
      tripsWhereOrgIsClient,
      tripPartyMap,
      tripFinanceAdjustmentsByTripId,
    );
    const offersForAggregation: Record<string, DriverOfferForAggregation> = {};
    Object.entries(driverOffers).forEach(([driverId, offer]) => {
      offersForAggregation[driverId] = {
        payableAmount: offer.payableAmount ?? null,
        commissionPercent: offer.commissionPercent ?? null,
        commissionPerKm: offer.commissionPerKm ?? null,
      };
    });
    const driversAgg = aggregateDrivers(
      driverRows,
      tripRows,
      ledgerTransactions ?? [],
      offersForAggregation,
      tripPartyMap,
    );

    const customersOutstanding = customersAgg.rows.reduce(
      (sum, row) => sum + Number(row.pending ?? 0),
      0,
    );
    const activeCustomersCount = customersAgg.rows.filter(
      (row) =>
        Number(row.trips ?? 0) > 0 ||
        Number(row.received ?? 0) > 0 ||
        Number(row.pending ?? 0) > 0,
    ).length;
    const suppliersOutstanding = suppliersAgg.rows.reduce(
      (sum, row) => sum + Number(row.due ?? 0),
      0,
    );
    const activeSuppliersCount = suppliersAgg.rows.filter(
      (row) =>
        Number(row.trips ?? 0) > 0 ||
        Number(row.paid ?? 0) > 0 ||
        Number(row.due ?? 0) > 0,
    ).length;
    const driverPending = driversAgg.rows.reduce(
      (sum, row) => sum + Number(row.pending ?? 0),
      0,
    );
    const activeDriversCount = driversAgg.rows.filter(
      (row) =>
        Number(row.trips ?? 0) > 0 ||
        Number(row.paid ?? 0) > 0 ||
        Number(row.pending ?? 0) > 0,
    ).length;
    const activeCashCount = (ledgerTransactions ?? []).filter(
      (row) =>
        Number(row.amount_in ?? 0) > 0 || Number(row.amount_out ?? 0) > 0,
    ).length;

    return {
      cash: {
        value: formatCompactRupee(
          ledgerTotalsData.totalIn - ledgerTotalsData.totalOut,
        ),
        count: activeCashCount,
        secondaryLabel: "Total Outstanding",
        secondaryValue: formatCompactRupee(ledgerTotalsData.totalOut),
      },
      customers: {
        value: formatCompactRupee(
          customersAgg.rows.reduce(
            (sum, row) => sum + Number(row.received ?? 0),
            0,
          ),
        ),
        count: activeCustomersCount,
        secondaryLabel: "Outstanding",
        secondaryValue: formatCompactRupee(customersOutstanding),
      },
      suppliers: {
        value: formatCompactRupee(
          suppliersAgg.rows.reduce(
            (sum, row) => sum + Number(row.paid ?? 0),
            0,
          ),
        ),
        count: activeSuppliersCount,
        secondaryLabel: "Outstanding",
        secondaryValue: formatCompactRupee(suppliersOutstanding),
      },
      garage: {
        value: "—",
        count: 0,
        secondaryLabel: "Total Expense",
        secondaryValue: "—",
      },
      drivers: {
        value: formatCompactRupee(
          driversAgg.rows.reduce(
            (sum, row) => sum + Number(row.paid ?? 0),
            0,
          ),
        ),
        count: activeDriversCount,
        secondaryLabel: "Pending",
        secondaryValue: formatCompactRupee(driverPending),
      },
    } as const;
  }, [
    tripFinanceAdjustmentsByTripId,
    allTripsForLedger,
    clientRows,
    currentOrganization?.id,
    driverOffers,
    driverRows,
    indentsForFinance,
    ledgerTotalsData.totalIn,
    ledgerTotalsData.totalOut,
    ledgerTransactions,
    supplierRows,
    tripPartyMap,
    tripRows,
    tripsWhereOrgIsClient,
    tripsWhereOrgIsSupplier,
    formatCompactRupee,
  ]);
  const reportTitle = useMemo(() => {
    switch (financeSubTab) {
      case "customers":
        return "Customers Report";
      case "suppliers":
        return "Suppliers Report";
      case "drivers":
        return "Drivers Report";
      case "garage":
        return garageViewTab === "trips" ? "Trip P&L Report" : "Vehicle Report";
      default:
        return t("ledgerReport");
    }
  }, [financeSubTab, garageViewTab, t]);
  const reportTransactionsBase = useMemo(() => {
    const organizationId = currentOrganization?.id ?? null;
    const fallbackDate = new Date().toISOString();
    const ledgerRows = ledgerTransactions ?? [];
    const q = searchQuery.trim().toLowerCase();
    const updateLatest = (
      map: Record<string, string>,
      key: string | null | undefined,
      value: string | null | undefined,
    ) => {
      if (!key || !value) return;
      if (!map[key] || value > map[key]) map[key] = value;
    };

    if (financeSubTab === "cash") {
      return filteredLedgerForDisplay;
    }

    if (financeSubTab === "customers") {
      const { rows } = aggregateCustomers(
        clientRows,
        allTripsForLedger,
        ledgerRows,
        tripPartyMap,
        indentsForFinance,
        tripFinanceAdjustmentsByTripId,
      );
      let filteredRows = rows;
      if (q) {
        filteredRows = filteredRows.filter(
          (row) =>
            (row.name || "").toLowerCase().includes(q) ||
            (row.subline || "").toLowerCase().includes(q) ||
            (row.contactPerson || "").toLowerCase().includes(q),
        );
      }
      if (entityFilter === "has_due") {
        filteredRows = filteredRows.filter((row) => (row.pending ?? 0) > 0);
      } else if (entityFilter === "no_due") {
        filteredRows = filteredRows.filter((row) => (row.pending ?? 0) === 0);
      }

      const clientIdByNameKey: Record<string, string> = {};
      clientRows.forEach((client) => {
        const key = (client.name || client.contact_person || "")
          .trim()
          .toLowerCase();
        if (key) clientIdByNameKey[key] = client.id;
      });
      const linkedClientIdByOrgId = buildUniqueLinkedOrgIdMap(clientRows);
      const latestTripDateByClientId: Record<string, string> = {};
      allTripsForLedger.forEach((trip) => {
        const nameKey = (trip.client_name || "").trim().toLowerCase();
        let clientId =
          trip.client_id ?? (nameKey ? clientIdByNameKey[nameKey] : undefined);
        if (!clientId && trip.organization_id && isLoadBasedTrip(trip)) {
          clientId =
            linkedClientIdByOrgId.get(trip.organization_id) ?? undefined;
        }
        updateLatest(
          latestTripDateByClientId,
          clientId,
          trip.pickup_date ?? trip.created_at ?? fallbackDate,
        );
      });

      return filteredRows.map((row) =>
        createReportRow({
          id: `customer-report-${row.id}`,
          organizationId,
          partyName: row.name || "Customer",
          description: `${row.subline || "Customer"} • Trips ${row.trips ?? 0}`,
          amountIn: Number(row.received ?? 0),
          amountOut: Number(row.pending ?? 0),
          transactionDate: latestTripDateByClientId[row.id] ?? fallbackDate,
          tripNumber: `${row.trips ?? 0} trips`,
          contactId: row.id,
          contactType: "client",
        }),
      );
    }

    if (financeSubTab === "suppliers") {
      const { rows } = aggregateSuppliers(
        supplierRows,
        allTripsForLedger,
        ledgerRows,
        tripsWhereOrgIsClient,
        tripPartyMap,
        tripFinanceAdjustmentsByTripId,
      );
      let filteredRows = rows;
      if (q) {
        filteredRows = filteredRows.filter(
          (row) =>
            (row.name || "").toLowerCase().includes(q) ||
            (row.subline || "").toLowerCase().includes(q),
        );
      }
      if (entityFilter === "has_due") {
        filteredRows = filteredRows.filter((row) => (row.due ?? 0) > 0);
      } else if (entityFilter === "no_due") {
        filteredRows = filteredRows.filter((row) => (row.due ?? 0) === 0);
      }

      const supplierIdByNameKey: Record<string, string> = {};
      supplierRows.forEach((supplier) => {
        const key = (
          supplier.name ||
          supplier.company_name ||
          supplier.contact_person ||
          ""
        )
          .trim()
          .toLowerCase();
        if (key) supplierIdByNameKey[key] = supplier.id;
      });
      const supplierIdByLinkedOrgId = buildUniqueLinkedOrgIdMap(supplierRows);
      const latestTripDateBySupplierId: Record<string, string> = {};
      tripRows.forEach((trip) => {
        const nameKey = (trip.supplier_name || "").trim().toLowerCase();
        const supplierId =
          trip.supplier_id ??
          (nameKey ? supplierIdByNameKey[nameKey] : undefined);
        updateLatest(
          latestTripDateBySupplierId,
          supplierId,
          trip.pickup_date ?? trip.created_at ?? fallbackDate,
        );
      });
      tripsWhereOrgIsClient.forEach((trip) => {
        if (!isLoadBasedTrip(trip) || !trip.organization_id) return;
        updateLatest(
          latestTripDateBySupplierId,
          supplierIdByLinkedOrgId.get(trip.organization_id),
          trip.pickup_date ?? trip.created_at ?? fallbackDate,
        );
      });

      return filteredRows.map((row) =>
        createReportRow({
          id: `supplier-report-${row.id}`,
          organizationId,
          partyName: row.name || "Supplier",
          description: `${row.subline || "Supplier"} • Trips ${row.trips ?? 0}`,
          amountIn: Number(row.paid ?? 0),
          amountOut: Number(row.due ?? 0),
          transactionDate: latestTripDateBySupplierId[row.id] ?? fallbackDate,
          tripNumber: `${row.trips ?? 0} trips`,
          contactId: row.id,
          contactType: "supplier",
        }),
      );
    }

    if (financeSubTab === "drivers") {
      const offersForAggregation: Record<string, DriverOfferForAggregation> =
        {};
      Object.entries(driverOffers).forEach(([driverId, offer]) => {
        offersForAggregation[driverId] = {
          payableAmount: offer.payableAmount ?? null,
          commissionPercent: offer.commissionPercent ?? null,
          commissionPerKm: offer.commissionPerKm ?? null,
        };
      });
      const { rows } = aggregateDrivers(
        driverRows,
        tripRows,
        ledgerRows,
        offersForAggregation,
        tripPartyMap,
      );
      const driverById = new Map(
        driverRows.map((driver) => [driver.id, driver]),
      );
      const vehicleById = new Map(
        vehicleRows.map((vehicle) => [vehicle.id, vehicle]),
      );
      let filteredRows = rows.map((row) => {
        const driver = driverById.get(row.id);
        const vehicle = driver?.assigned_vehicle_id
          ? vehicleById.get(driver.assigned_vehicle_id)
          : null;
        const displayName =
          (driver?.name ?? "").trim() ||
          (driver?.phone ?? "").trim() ||
          row.name ||
          "Driver";
        return {
          ...row,
          name: displayName,
          subline: vehicle?.vehicle_number ?? row.subline,
        };
      });
      if (q) {
        filteredRows = filteredRows.filter(
          (row) =>
            (row.name || "").toLowerCase().includes(q) ||
            (row.subline || "").toLowerCase().includes(q),
        );
      }
      if (entityFilter === "has_due") {
        filteredRows = filteredRows.filter((row) => (row.pending ?? 0) > 0);
      } else if (entityFilter === "no_due") {
        filteredRows = filteredRows.filter((row) => (row.pending ?? 0) === 0);
      }

      const latestTripDateByDriverId: Record<string, string> = {};
      tripRows.forEach((trip) => {
        updateLatest(
          latestTripDateByDriverId,
          trip.driver_id,
          trip.pickup_date ?? trip.created_at ?? fallbackDate,
        );
      });

      return filteredRows.map((row) =>
        createReportRow({
          id: `driver-report-${row.id}`,
          organizationId,
          partyName: row.name || "Driver",
          description: `${row.subline || "Driver"} • Trips ${row.trips ?? 0}`,
          amountIn: Number(row.paid ?? 0),
          amountOut: Number(row.pending ?? 0),
          transactionDate: latestTripDateByDriverId[row.id] ?? fallbackDate,
          tripNumber: `${row.trips ?? 0} trips`,
          contactId: row.id,
          contactType: "driver",
        }),
      );
    }

    return [];
  }, [
    allTripsForLedger,
    clientRows,
    currentOrganization?.id,
    driverOffers,
    driverRows,
    entityFilter,
    filteredLedgerForDisplay,
    financeSubTab,
    indentsForFinance,
    ledgerTransactions,
    searchQuery,
    supplierRows,
    tripPartyMap,
    tripRows,
    tripsWhereOrgIsClient,
    tripsWhereOrgIsSupplier,
    tripFinanceAdjustmentsByTripId,
  ]);

  const [garageReportTransactions, setGarageReportTransactions] = useState<
    LedgerRow[]
  >([]);

  useEffect(() => {
    if (financeSubTab !== "garage" || !showReportModal) {
      setGarageReportTransactions((prev) => (prev.length === 0 ? prev : []));
      return;
    }
    const organizationId = currentOrganization?.id ?? null;
    let cancelled = false;
    void import("../lib/garageReportTransactions.util").then(
      ({ buildGarageReportTransactions }) => {
        if (cancelled) return;
        setGarageReportTransactions(
          buildGarageReportTransactions({
            organizationId,
            tripRows,
            vehicleRows,
            ledgerTransactions: ledgerTransactions ?? null,
            garagePeriod,
            garageViewTab,
            searchQuery,
            entityFilter,
            getVehicleNumberForTripId,
          }),
        );
      },
    );
    return () => {
      cancelled = true;
    };
  }, [
    currentOrganization?.id,
    entityFilter,
    financeSubTab,
    garagePeriod,
    garageViewTab,
    getVehicleNumberForTripId,
    ledgerTransactions,
    searchQuery,
    showReportModal,
    tripRows,
    vehicleRows,
  ]);

  const reportTransactions = useMemo((): LedgerRow[] => {
    if (financeSubTab === "garage") return garageReportTransactions;
    return reportTransactionsBase ?? [];
  }, [financeSubTab, garageReportTransactions, reportTransactionsBase]);

  const bannerTotals = financeSubTab === "cash" ? ledgerTotalsData : tabTotals;

  const handleEntityRowSelect = useCallback(
    (
      data: FinancialRowData,
      entityType: "CLIENT" | "SUPPLIER" | "VEHICLE" | "DRIVER",
      subTab: FinanceSubTab,
    ) => {
      if (entityType === "CLIENT" && subTab === "customers") {
        router.push(
          ROUTES.clientDetail(data.id, "cash") as Parameters<
            typeof router.push
          >[0],
        );
        return;
      }
      if (entityType === "SUPPLIER" && subTab === "suppliers") {
        router.push(
          ROUTES.supplierDetail(data.id, "cash") as Parameters<
            typeof router.push
          >[0],
        );
        return;
      }
      // Vehicle selection from Finance > Garage: open full VehicleDetailScreen (detail page)
      if (entityType === "VEHICLE" && subTab === "garage") {
        router.push(ROUTES.vehicleDetail(data.id) as Parameters<typeof router.push>[0]);
        return;
      }
      // Driver selection from Finance > Drivers: open full DriverDetailScreen (detail page)
      if (entityType === "DRIVER" && subTab === "drivers") {
        router.push(
          ROUTES.driverDetail(data.id, "ledger") as Parameters<
            typeof router.push
          >[0],
        );
        return;
      }
      setSelectedEntity({ data, entityType, subTab });
    },
    [router],
  );

  const supplierPartyOptions = useMemo(
    (): PartyOption[] =>
      supplierRows.map((s) => ({
        id: s.id,
        name:
          (
            s.name ||
            s.company_name ||
            s.contact_person ||
            t("supplier")
          ).trim() || t("supplier"),
        linked_organization_id: s.linked_organization_id ?? null,
        supplier_type: s.supplier_type ?? null,
        avatar_url: s.avatar_url ?? null,
        avatar_seed: s.avatar_seed ?? null,
      })),
    [supplierRows, t],
  );

  const supplierLinkedOrgIds = useMemo(() => {
    const m: Record<string, string> = {};
    supplierRows.forEach((s) => {
      const lid = (s as { linked_organization_id?: string | null })
        .linked_organization_id;
      if (lid) m[s.id] = lid;
    });
    clientRows.forEach((c) => {
      const lid = (c as { linked_organization_id?: string | null })
        .linked_organization_id;
      if (lid) m[c.id] = lid;
    });
    return m;
  }, [supplierRows, clientRows]);

  const uniqueLinkedClientIdByOrgId = useMemo(
    () => buildUniqueLinkedOrgIdMap(clientRows),
    [clientRows],
  );
  const uniqueLinkedSupplierIdByOrgId = useMemo(
    () => buildUniqueLinkedOrgIdMap(supplierRows),
    [supplierRows],
  );

  const driverPartyOptions = useMemo(
    (): PartyOption[] =>
      driverRows.map((d) => ({
        id: d.id,
        name: (d.name || t("driver")).trim() || t("driver"),
        avatar_url: d.avatar_url ?? null,
        avatar_seed: d.avatar_seed ?? null,
      })),
    [driverRows, t],
  );

  const vehicleOptions = useMemo(
    () =>
      vehicleRows.map((v) => ({
        id: v.id,
        vehicle_number: v.vehicle_number || v.id,
      })),
    [vehicleRows],
  );

  const defaultPartyId =
    selectedEntity?.entityType === "CLIENT" ||
    selectedEntity?.entityType === "SUPPLIER"
      ? selectedEntity.data.id
      : undefined;

  const selectedEntityTrips = useMemo((): TripRow[] => {
    if (!selectedEntity) return [];
    const { data: entity, entityType } = selectedEntity;
    if (entityType === "CLIENT") {
      const clientRow = clientRows.find((c) => c.id === entity.id) ?? null;
      return tripRows.filter((t) => {
        if (t.client_id === entity.id) return true;
        if (!clientRow || !isIntegratedClientRow(clientRow)) return false;
        const linkedOrgId = clientRow.linked_organization_id;
        if (!linkedOrgId || !isLoadBasedTrip(t) || !t.organization_id)
          return false;
        if (t.organization_id !== linkedOrgId) return false;
        return uniqueLinkedClientIdByOrgId.get(linkedOrgId) === entity.id;
      });
    }
    if (entityType === "SUPPLIER") {
      const supplierRow = supplierRows.find((s) => s.id === entity.id) ?? null;
      const fromOwned = tripRows.filter((t) => t.supplier_id === entity.id);
      if (!supplierRow || !isIntegratedSupplierRow(supplierRow)) {
        return fromOwned;
      }
      const linkedOrgId = supplierRow.linked_organization_id;
      if (!linkedOrgId) return fromOwned;
      const fromAsClient = tripsWhereOrgIsClient.filter(
        (t) =>
          isLoadBasedTrip(t) &&
          t.organization_id === linkedOrgId &&
          uniqueLinkedSupplierIdByOrgId.get(linkedOrgId) === entity.id,
      );
      const seen = new Set(fromOwned.map((t) => t.id));
      const merged = [...fromOwned];
      for (const t of fromAsClient) {
        if (!seen.has(t.id)) {
          seen.add(t.id);
          merged.push(t);
        }
      }
      return merged;
    }
    if (entityType === "DRIVER")
      return tripRows.filter((t) => t.driver_id === entity.id);
    if (entityType === "VEHICLE") {
      if (entity.id === "UNASSIGNED")
        return tripRows.filter((t) => !t.vehicle_id);
      return tripRows.filter((t) => t.vehicle_id === entity.id);
    }
    return [];
  }, [
    selectedEntity,
    tripRows,
    clientRows,
    supplierRows,
    tripsWhereOrgIsClient,
    uniqueLinkedClientIdByOrgId,
    uniqueLinkedSupplierIdByOrgId,
  ]);

  /** When overlay is open for a client/supplier/vehicle, pass only that entity's trips to Add Transaction modal. */
  const modalTripOptions = useMemo((): TripOption[] => {
    if (selectedEntity && selectedEntityTrips.length > 0) {
      const isClientOrSupplier =
        selectedEntity.entityType === "CLIENT" ||
        selectedEntity.entityType === "SUPPLIER";
      const isVehicle = selectedEntity.entityType === "VEHICLE";
      if (isClientOrSupplier || isVehicle) {
        return selectedEntityTrips.map((t) => ({
          id: t.id,
          trip_number: getTripDisplayNumber(t),
          client_id: t.client_id ?? null,
          client_name: t.client_name ?? null,
          supplier_id: t.supplier_id ?? null,
          supplier_name: t.supplier_name ?? null,
          driver_id: t.driver_id ?? null,
          driver_display_name: t.driver_display_name ?? null,
          vehicle_id: t.vehicle_id ?? null,
          indent_id: t.indent_id ?? null,
          route_label:
            [t.pickup_area, t.drop_location].filter(Boolean).join(" → ") ||
            null,
          trip_date: formatLedgerDate(t.pickup_date || t.created_at),
          client_price: t.client_price ?? null,
          supplier_rate: t.supplier_rate ?? null,
          driver_commission: t.driver_commission ?? null,
          distance: t.distance ?? null,
          is_cross_org_supplier:
            !!currentOrganization?.id &&
            !!t.organization_id &&
            t.organization_id !== currentOrganization.id &&
            tripsWhereOrgIsSupplier.some((x) => x.id === t.id),
          trip_payout_mode: t.trip_payout_mode ?? null,
          status: t.status ?? null,
          completed_at: t.completed_at ?? null,
          ...(t.organization_id != null && {
            organization_id: t.organization_id,
          }),
        }));
      }
    }
    return trips;
  }, [
    selectedEntity,
    selectedEntityTrips,
    trips,
    currentOrganization?.id,
    tripsWhereOrgIsSupplier,
  ]);

  const selectedEntityTransactions = useMemo((): LedgerRow[] | null => {
    if (!selectedEntity) return null;
    const allTx = ledgerTransactions ?? [];
    const { data: entity, entityType } = selectedEntity;
    if (entityType === "VEHICLE") {
      const tripIds = new Set(selectedEntityTrips.map((t) => t.id));
      return allTx.filter(
        (tx) => tx.trip_id != null && tripIds.has(tx.trip_id),
      );
    }
    if (entityType === "DRIVER") {
      const driverId = entity.id == null ? "" : String(entity.id).trim();
      return allTx.filter(
        (tx) =>
          tx.contact_type === "driver" &&
          tx.contact_id != null &&
          String(tx.contact_id).trim() === driverId,
      );
    }
    if (entityType !== "CLIENT" && entityType !== "SUPPLIER") return null;
    if (allTx.length === 0) return null;
    const contactType = entityType === "CLIENT" ? "client" : "supplier";
    if (entity.id.startsWith("ledger-party-")) {
      const nameKey = (entity.name ?? "").toLowerCase().trim();
      return nameKey
        ? allTx.filter(
            (tx) => (tx.party_name || "").toLowerCase().trim() === nameKey,
          )
        : [];
    }
    return allTx.filter(
      (tx) => tx.contact_type === contactType && tx.contact_id === entity.id,
    );
  }, [selectedEntity, selectedEntityTrips, ledgerTransactions]);

  const handleTabPress = useCallback((tabId: FinanceSubTab) => {
    setFinanceSubTab(tabId);
    // When switching to Ledger, close entity detail overlay so only one "detail" (expand row) is in view
    if (tabId === "cash") setSelectedEntity(null);
  }, []);

  const handleLedgerRowSelect = useCallback(
    (data: FinancialRowData) => {
      if (data.tripId) router.push(`/trip/${data.tripId}`);
    },
    [router],
  );

  const financeModalsActive = useMemo(
    () =>
      showTransactionModal ||
      showAddClientModal ||
      showAddVehicleModal ||
      showAddDriverModal ||
      showAddSupplierModal ||
      showEditClientModal ||
      showEditSupplierModal ||
      selectedEntity != null ||
      showReportModal ||
      showSharedLedgerModal ||
      garageTripIdForPnL != null,
    [
      showTransactionModal,
      showAddClientModal,
      showAddVehicleModal,
      showAddDriverModal,
      showAddSupplierModal,
      showEditClientModal,
      showEditSupplierModal,
      selectedEntity,
      showReportModal,
      showSharedLedgerModal,
      garageTripIdForPnL,
    ],
  );

  const handleRefresh = useCallback(async () => {
    const org = currentOrganization?.id;
    setRefreshing(true);
    setLedgerRefreshKey((k) => k + 1);
    setEntitiesRefreshKey((k) => k + 1);
    try {
      if (org) {
        await clearAllDomainCacheMetaForOrg(org);
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.clients.all(org) }),
          queryClient.invalidateQueries({ queryKey: queryKeys.suppliers.all(org) }),
          queryClient.invalidateQueries({ queryKey: queryKeys.drivers.all(org) }),
          queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.all(org) }),
          queryClient.invalidateQueries({ queryKey: queryKeys.trips.all(org) }),
          queryClient.invalidateQueries({ queryKey: queryKeys.indents.all(org) }),
        ]);
        await invalidateTransactions(org);
        await Promise.all([
          queryClient.refetchQueries({ queryKey: queryKeys.clients.finite(org) }),
          queryClient.refetchQueries({ queryKey: queryKeys.suppliers.finite(org) }),
          queryClient.refetchQueries({ queryKey: queryKeys.drivers.finite(org) }),
          queryClient.refetchQueries({ queryKey: queryKeys.vehicles.finite(org) }),
          queryClient.refetchQueries({ queryKey: queryKeys.trips.finite(org) }),
        ]);
      }
      await refetchLedger();
    } finally {
      setRefreshing(false);
    }
  }, [currentOrganization?.id, queryClient, refetchLedger, invalidateTransactions]);

  /** Refetch ledger when Finance regains focus (e.g. after ledger-sync modal). */
  useFocusEffect(
    useCallback(() => {
      const org = currentOrganization?.id;
      if (!canAccess || !org) return;
      void refetchLedger();
    }, [canAccess, currentOrganization?.id, refetchLedger]),
  );

  /** Recover from persisted empty party caches — once per org + sub-tab per session. */
  const partyRecoveryAttempted = useRef(new Set<string>());
  useFocusEffect(
    useCallback(() => {
      const org = currentOrganization?.id;
      if (!org || entitiesLoading) return;

      const partyTab =
        financeSubTab === "customers" ||
        financeSubTab === "suppliers" ||
        financeSubTab === "drivers" ||
        financeSubTab === "garage";
      if (!partyTab) return;

      const partyListEmpty =
        (financeSubTab === "customers" && clientRows.length === 0) ||
        (financeSubTab === "suppliers" && supplierRows.length === 0) ||
        (financeSubTab === "drivers" && driverRows.length === 0) ||
        (financeSubTab === "garage" && vehicleRows.length === 0);
      if (!partyListEmpty) return;

      const recoveryKey = `${org}:${financeSubTab}`;
      if (partyRecoveryAttempted.current.has(recoveryKey)) return;
      partyRecoveryAttempted.current.add(recoveryKey);

      void (async () => {
        await clearAllDomainCacheMetaForOrg(org);
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.clients.finite(org) }),
          queryClient.invalidateQueries({ queryKey: queryKeys.suppliers.finite(org) }),
          queryClient.invalidateQueries({ queryKey: queryKeys.drivers.finite(org) }),
          queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.finite(org) }),
        ]);
        await Promise.all([
          queryClient.refetchQueries({ queryKey: queryKeys.clients.finite(org) }),
          queryClient.refetchQueries({ queryKey: queryKeys.suppliers.finite(org) }),
          queryClient.refetchQueries({ queryKey: queryKeys.drivers.finite(org) }),
          queryClient.refetchQueries({ queryKey: queryKeys.vehicles.finite(org) }),
        ]);
      })();
    }, [
      currentOrganization?.id,
      entitiesLoading,
      financeSubTab,
      clientRows.length,
      supplierRows.length,
      driverRows.length,
      vehicleRows.length,
      queryClient,
    ]),
  );

  if (!canAccess) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <Text style={styles.message}>{t("noAccessFinance")}</Text>
      </View>
    );
  }

  const orgId = currentOrganization?.id ?? null;

  if (!orgId) {
    if (isOrgLoading) {
      return <SceneLoadingSplash variant="preparing" />;
    }
    return (
      <View style={[styles.container, { paddingTop: screenTopPad }]}>
        <View style={[styles.centered, { flex: 1, paddingTop: 24 }]}>
          <Text style={styles.message}>{t("noOrganization")}</Text>
          <Text
            style={[
              styles.message,
              { fontSize: 14, marginTop: 8, opacity: 0.8 },
            ]}
          >
            {t("addOrSelectOrganization")}
          </Text>
        </View>
      </View>
    );
  }

  const summarySection = (
      <FinanceSummarySection
        activeTab={financeSubTab}
        onTabPress={handleTabPress}
        screenWidth={screenWidth}
        totalIn={bannerTotals.totalIn}
        totalOut={bannerTotals.totalOut}
        labelIn={summaryLabels.in}
        labelOut={summaryLabels.out}
        cashDirectionFilter={
          financeSubTab === "cash" ? cashDirectionFilter : undefined
        }
        onCashInPress={
          financeSubTab === "cash"
            ? () =>
                setCashDirectionFilter(
                  cashDirectionFilter === "in" ? "all" : "in",
                )
            : undefined
        }
        onCashOutPress={
          financeSubTab === "cash"
            ? () =>
                setCashDirectionFilter(
                  cashDirectionFilter === "out" ? "all" : "out",
                )
            : undefined
        }
        ledgerCategory={
          financeSubTab === "cash" ? selectedLedgerCategory : undefined
        }
        onLedgerCategoryChange={
          financeSubTab === "cash" ? setSelectedLedgerCategory : undefined
        }
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder={
          financeSubTab === "cash"
            ? t("searchPartyDescription")
            : financeSubTab === "customers" || financeSubTab === "suppliers"
              ? "Find by name..."
              : t("searchEntities")
        }
        onReportPress={() => setShowReportModal(true)}
        entityFilter={financeSubTab === "cash" ? undefined : entityFilter}
        onEntityFilterChange={
          financeSubTab === "cash" ? undefined : setEntityFilter
        }
        entityFilterLabels={
          financeSubTab === "garage"
            ? { has_due: t("hasExpense"), no_due: t("noExpense") }
            : financeSubTab === "customers"
              ? { has_due: t("pending"), no_due: t("collected") }
              : financeSubTab === "suppliers"
                ? { has_due: t("pending"), no_due: t("paid") }
                : undefined
        }
        garagePeriodOptions={
          financeSubTab === "garage" && garagePeriodOptions.length > 0
            ? garagePeriodOptions
            : undefined
        }
        garagePeriod={financeSubTab === "garage" ? garagePeriod : undefined}
        onGaragePeriodChange={
          financeSubTab === "garage" ? setGaragePeriod : undefined
        }
        garageViewTab={financeSubTab === "garage" ? garageViewTab : undefined}
        onGarageViewTabChange={
          financeSubTab === "garage" ? setGarageViewTab : undefined
        }
        driverViewTab={financeSubTab === "drivers" ? driverViewTab : undefined}
        onDriverViewTabChange={setDriverViewTab}
        customerViewTab={
          financeSubTab === "customers" ? customerViewTab : undefined
        }
        onCustomerViewTabChange={setCustomerViewTab}
        supplierViewTab={
          financeSubTab === "suppliers" ? supplierViewTab : undefined
        }
        onSupplierViewTabChange={setSupplierViewTab}
        showPeriodFilter={false}
        periodFilter={financePeriodFilter}
        onPeriodFilterChange={setFinancePeriodFilter}
        datePreset={{
          period: financePeriodFilter,
          onPeriodChange: setFinancePeriodFilter,
          onCustomRangePress: () => setFinanceDateModalVisible(true),
          customFrom: financeCustomRangeFrom,
          customTo: financeCustomRangeTo,
        }}
        onQuickCustomRange={setFinanceCustomRange}
        sourceFilter={financeSubTab === "cash" ? sourceSupplyFilter : undefined}
        onSourceFilterChange={
          financeSubTab === "cash" ? setSourceSupplyFilter : undefined
        }
        ledgerViewMode={financeSubTab === "cash" ? "transaction" : undefined}
        onLedgerViewModeChange={undefined}
        onClearFilters={handleClearFilters}
        isAnyFilterActive={isAnyFilterActive}
        auditedTotalIn={bannerTotals.totalIn}
        auditedTotalOut={bannerTotals.totalOut}
        desktopCardMetrics={desktopCardMetrics}
        omitTabRow={useMobileUnifiedScroll}
      />
  );

  const tabBody = (
            <FinanceTabBody
              embedInParentScroll={useMobileUnifiedScroll}
              financeSubTab={financeSubTab}
              organizationId={orgId}
              ledgerLoading={ledgerLoading}
              ledgerTransactions={ledgerTransactions}
              ledgerForEntityAggregation={filteredLedger}
              filteredLedgerForDisplay={filteredLedgerForDisplay}
              filteredLedgerForKanban={filteredLedgerForKanban}
              fetchNextLedgerPage={fetchNextLedgerPage}
              hasNextLedgerPage={hasNextLedgerPage}
              ledgerPageLoading={ledgerPageLoading}
              ledgerRefreshKey={ledgerRefreshKey}
              onAddTransactionPress={() =>
                router.push("/(modals)/ledger-sync" as const)
              }
              onAddPartyPress={handleAddPartyPress}
              onKanbanPartyAddPress={handleKanbanPartyAddPress}
              onLedgerRowSelect={handleLedgerRowSelect}
              getVehicleNumberForTripId={getVehicleNumberForTripId}
              tripOptions={filteredTripOptionsForFinance}
              tripDetailsMap={tripDetailsMap}
              clientRows={clientRows}
              tripRows={financeFilteredAllTripsForLedger}
              supplierRows={supplierRows}
              tripsWhereOrgIsClient={financeFilteredTripsWhereOrgIsClient}
              tripsWhereOrgIsSupplier={financeFilteredTripsWhereOrgIsSupplier}
              indentsForFinance={indentsForFinance}
              vehicleRows={vehicleRows}
              driverRows={driverRows}
              driverOffers={driverOffers}
              entitiesLoading={entitiesLoading}
              onTabTotals={setTabTotals}
              onEntityRowSelect={handleEntityRowSelect}
              searchQuery={searchQuery}
              entityFilter={entityFilter}
              connectionRequestsSent={connectionRequestsSent}
              tripPartyMap={tripPartyMap}
              garagePeriod={garagePeriod}
              onGaragePeriodChange={setGaragePeriod}
              garageViewTab={garageViewTab}
              onGarageViewTabChange={setGarageViewTab}
              driverViewTab={driverViewTab}
              onDriverViewTabChange={setDriverViewTab}
              customerViewTab={customerViewTab}
              onCustomerViewTabChange={setCustomerViewTab}
              supplierViewTab={supplierViewTab}
              onSupplierViewTabChange={setSupplierViewTab}
              onTripSelect={(tripId) => router.push(`/trip/${tripId}` as const)}
              refreshing={refreshing}
              onRefresh={handleRefresh}
              bottomInset={layout.scrollBottomPadding(64)}
              profileImages={profileImages}
              linkedOrgDisplayMap={linkedOrgDisplayMap}
              tripFinanceAdjustmentsByTripId={tripFinanceAdjustmentsByTripId}
            />
  );

  return (
    <View
      style={[styles.container, { paddingTop: screenTopPad }]}
      testID="finance-tab-screen"
    >
      {useMobileUnifiedScroll ? (
        <>
          <View style={styles.mobileFixedTabBar}>
            <FinanceTabRow
              treasuryInset
              activeTab={financeSubTab}
              onTabPress={handleTabPress}
            />
          </View>
          <ScrollView
            style={styles.mobileUnifiedScroll}
            contentContainerStyle={[
              styles.mobileUnifiedScrollContent,
              { paddingBottom: layout.scrollBottomPadding(64) },
            ]}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={Theme.loaderAccent}
              />
            }
            {...tabBarScrollProps}
          >
            {summarySection}
            <View style={styles.mobileUnifiedBody}>{tabBody}</View>
          </ScrollView>
        </>
      ) : (
        <>
          {summarySection}
          <View style={styles.tableScroll}>
            <View style={styles.tableScrollInner}>
              <View style={styles.ledgerCardWrap}>{tabBody}</View>
            </View>
          </View>
        </>
      )}

      {(() => {
        const partyKind = financeSubTabToPartyKind(financeSubTab);
        const routeAdd =
          financeSubTab === "cash"
            ? undefined
            : financeSubTab === "customers"
              ? () => router.push("/(modals)/add-client" as const)
              : financeSubTab === "suppliers"
                ? () => router.push("/(modals)/add-supplier" as const)
                : financeSubTab === "garage"
                  ? () =>
                      router.push({
                        pathname: "/(modals)/add-vehicle",
                        params: { returnTo: "/(tabs)/finance" },
                      })
                  : financeSubTab === "drivers"
                    ? () => router.push("/(modals)/add-driver" as const)
                    : undefined;
        const onAdd =
          routeAdd && partyKind && usePartyPortalOnWeb
            ? () => {
                setPartyPortalKind(partyKind);
                setPartyPortalOpen(true);
              }
            : routeAdd;
        if (!onAdd) return null;
        return (
          <View
            style={[
              styles.fabAbsoluteWrap,
              {
                bottom: layout.fabBottom({ stackOffset: Layout.fabStackOffset }),
              },
            ]}
          >
            <FinanceFAB
              onPress={onAdd}
              accessibilityLabel={
                financeSubTab === "cash"
                  ? t("addTransaction")
                  : financeSubTab === "customers"
                    ? t("addClient")
                    : financeSubTab === "suppliers"
                      ? t("addSupplier")
                      : financeSubTab === "garage"
                        ? t("addVehicle")
                        : t("addDriver")
              }
              icon={
                financeSubTab === "cash"
                  ? "receipt-text"
                  : financeSubTab === "customers"
                    ? "building"
                    : financeSubTab === "drivers"
                      ? "user"
                      : financeSubTab === "suppliers"
                        ? "warehouse"
                        : "truck"
              }
            />
          </View>
        );
      })()}

      <DateRangePickerModal
        visible={financeDateModalVisible}
        initialFrom={financeCustomRangeFrom ?? undefined}
        initialTo={financeCustomRangeTo ?? undefined}
        onDismiss={() => setFinanceDateModalVisible(false)}
        onApply={(from, to) => {
          setFinanceCustomRange(from, to);
          setFinanceDateModalVisible(false);
        }}
      />

      <FinancePartyRegistrationPortal
        active={partyPortalOpen}
        visible={partyPortalOpen}
        initialKind={partyPortalKind}
        onClose={() => setPartyPortalOpen(false)}
        organizationId={currentOrganization?.id ?? null}
        noOrganizationMessage={currentOrganization ? null : NO_ORG_MESSAGE}
        onRefreshOrganization={refreshOrganization}
        onAddClient={handleAddClientComplete}
        onAddSupplier={handleAddSupplierComplete}
        onAddDriver={handleAddDriverDirect}
        onAddVehicle={handleAddVehicleComplete}
        searchInviteeByPhone={searchInviteeByPhone}
        onSendInvitation={handleSendClientInvitation}
        onSendSupplierInvitation={handleSendSupplierInvitation}
        onInviteDriver={handleAddDriverInviteComplete}
      />

      <FinanceModalsGate
        active={financeModalsActive}
        showTransactionModal={showTransactionModal}
        onCloseTransactionModal={() => {
          setShowTransactionModal(false);
          setEditingEntry(null);
          setAddEntryContext(null);
          setDefaultDriverPaymentTypeForModal(null);
          setPayDriverRequestTripPrefill(null);
        }}
        onSubmitTransaction={handleTransactionSubmit}
        clients={clients}
        supplierPartyOptions={supplierPartyOptions}
        supplierLinkedOrgIds={supplierLinkedOrgIds}
        driverPartyOptions={driverPartyOptions}
        vehicleOptions={vehicleOptions}
        modalTripOptions={modalTripOptions}
        defaultPartyId={defaultPartyId}
        defaultPartyName={
          selectedEntity?.entityType === "CLIENT" ||
          selectedEntity?.entityType === "SUPPLIER"
            ? (selectedEntity.data.name ?? undefined)
            : undefined
        }
        lockedPartyId={
          selectedEntity?.entityType === "DRIVER" && addEntryContext == null
            ? selectedEntity.data.id
            : undefined
        }
        lockedPartyName={
          selectedEntity?.entityType === "DRIVER" && addEntryContext == null
            ? (selectedEntity.data.name ?? undefined)
            : undefined
        }
        partyContext={
          financeSubTab === "customers"
            ? "customers"
            : financeSubTab === "suppliers"
              ? "suppliers"
              : "all"
        }
        initialEntry={editingEntry}
        lockedAmount={
          selectedEntity?.entityType === "DRIVER" && addEntryContext == null
            ? (selectedEntity.data.pending ?? selectedEntity.data.due ?? 0)
            : undefined
        }
        dueAmountIn={
          selectedEntity?.entityType === "CLIENT"
            ? (selectedEntity.data.pending ?? null)
            : undefined
        }
        dueAmountOut={
          selectedEntity?.entityType === "SUPPLIER"
            ? (selectedEntity.data.due ?? null)
            : selectedEntity?.entityType === "DRIVER"
              ? (selectedEntity.data.pending ?? selectedEntity.data.due ?? null)
              : undefined
        }
        salaryAmount={
          selectedEntity?.entityType === "DRIVER"
            ? (driverOffers[selectedEntity.data.id]?.payableAmount ?? null)
            : undefined
        }
        defaultTripId={
          payDriverRequestTripPrefill?.defaultTripId ??
          addEntryContext?.tripId ??
          undefined
        }
        tripLocked={payDriverRequestTripPrefill?.tripLocked ?? false}
        defaultType={
          addEntryContext?.intent === "client_receivable" ||
          addEntryContext?.intent === "supplier_payable" ||
          addEntryContext?.intent === "driver_payable"
            ? "in"
            : addEntryContext?.intent === "trip_expense"
              ? "out"
              : undefined
        }
        defaultContactId={
          addEntryContext
            ? (() => {
                const trip = tripRows.find(
                  (t) => t.id === addEntryContext.tripId,
                );
                if (!trip) return undefined;
                if (addEntryContext.intent === "client_receivable")
                  return trip.client_id ?? undefined;
                if (addEntryContext.intent === "supplier_payable")
                  return trip.supplier_id ?? undefined;
                if (addEntryContext.intent === "driver_payable")
                  return trip.driver_id ?? undefined;
                return undefined;
              })()
            : undefined
        }
        defaultContactType={
          addEntryContext?.intent === "client_receivable"
            ? "client"
            : addEntryContext?.intent === "supplier_payable"
              ? "supplier"
              : addEntryContext?.intent === "driver_payable"
                ? "driver"
                : undefined
        }
        defaultDriverPaymentType={defaultDriverPaymentTypeForModal ?? undefined}
        financeSubTab={financeSubTab}
        showAddClientModal={showAddClientModal}
        onCloseAddClientModal={() => setShowAddClientModal(false)}
        onAddClientComplete={handleAddClientComplete}
        organizationId={currentOrganization?.id ?? null}
        noOrganizationMessage={currentOrganization ? null : NO_ORG_MESSAGE}
        onRefreshOrganization={refreshOrganization}
        searchInviteeByPhone={searchInviteeByPhone}
        onSendClientInvitation={handleSendClientInvitation}
        editingClient={editingClient}
        showEditClientModal={showEditClientModal}
        onCloseEditClientModal={() => {
          setShowEditClientModal(false);
          setEditingClient(null);
        }}
        onEditClientComplete={handleEditClientComplete}
        onEditClient={handleEditClient}
        showAddSupplierModal={showAddSupplierModal}
        onCloseAddSupplierModal={() => setShowAddSupplierModal(false)}
        onAddSupplierComplete={handleAddSupplierComplete}
        onSendSupplierInvitation={handleSendSupplierInvitation}
        editingSupplier={editingSupplier}
        showEditSupplierModal={showEditSupplierModal}
        onCloseEditSupplierModal={() => {
          setShowEditSupplierModal(false);
          setEditingSupplier(null);
        }}
        onEditSupplierComplete={handleEditSupplierComplete}
        onEditSupplier={handleEditSupplier}
        showAddVehicleModal={showAddVehicleModal}
        onCloseAddVehicleModal={() => setShowAddVehicleModal(false)}
        onAddVehicleComplete={handleAddVehicleComplete}
        showAddDriverModal={showAddDriverModal}
        onCloseAddDriverModal={() => setShowAddDriverModal(false)}
        onAddDriverInviteComplete={handleAddDriverInviteComplete}
        onAddDriverDirect={handleAddDriverDirect}
        selectedEntity={selectedEntity}
        selectedEntityTrips={selectedEntityTrips}
        selectedEntityTransactions={selectedEntityTransactions}
        ledgerTransactions={ledgerTransactions}
        driverOffers={driverOffers}
        selectedDriverLedgerEntries={selectedDriverLedgerEntries}
        vehicleRows={vehicleRows}
        driverRows={driverRows}
        entityOverlayClientRows={clientRows}
        entityOverlaySupplierRows={supplierRows}
        onEntityOverlayBack={() => setSelectedEntity(null)}
        onEntityAddTransaction={(context) => {
          setAddEntryContext(context ?? null);
          const entity = selectedEntity;
          const params = new URLSearchParams();
          if (entity) {
            params.set("entityType", entity.entityType);
            params.set("entityId", String(entity.data.id));
            params.set("partyName", String(entity.data.name ?? ""));
            if (
              entity.entityType === "CLIENT" ||
              entity.entityType === "SUPPLIER"
            ) {
              params.set(
                "partyContext",
                entity.entityType === "CLIENT" ? "customers" : "suppliers",
              );
              params.set("partyId", String(entity.data.id));
            }
            if (entity.entityType === "DRIVER")
              params.set("partyId", String(entity.data.id));
            const pending = entity.data.pending;
            const due = entity.data.due;
            if (entity.entityType === "CLIENT") {
              params.set("defaultType", "in");
              if (pending != null && pending > 0) {
                params.set("dueAmountIn", String(pending));
              }
            }
            if (entity.entityType === "SUPPLIER") {
              params.set("defaultType", "out");
              if (due != null && due > 0) {
                params.set("dueAmountOut", String(due));
              }
            }
            if (entity.entityType === "DRIVER") {
              params.set("defaultType", "out");
              const driverDue = pending ?? due;
              if (driverDue != null && driverDue > 0) {
                params.set("dueAmountOut", String(driverDue));
              }
            }
            if (entity.entityType === "VEHICLE") {
              params.set("defaultType", "out");
            }
          }
          router.push(`/(modals)/ledger-sync?${params.toString()}` as const);
        }}
        onEntityOverlayRefresh={() => {
          setLedgerRefreshKey((k) => k + 1);
          setEntitiesRefreshKey((k) => k + 1);
          const orgId = currentOrganization?.id ?? "";
          if (orgId) {
            queryClient.invalidateQueries({
              queryKey: queryKeys.drivers.all(orgId),
            });
            queryClient.invalidateQueries({
              queryKey: queryKeys.vehicles.all(orgId),
            });
            queryClient.invalidateQueries({
              queryKey: queryKeys.trips.finite(orgId),
            });
          }
        }}
        garageTripIdForPnL={garageTripIdForPnL}
        onCloseTripPnL={() => setGarageTripIdForPnL(null)}
        tripRows={tripRows}
        showReportModal={showReportModal}
        onCloseReportModal={() => setShowReportModal(false)}
        reportTransactions={reportTransactions}
        reportTitle={reportTitle}
        showSharedLedgerModal={showSharedLedgerModal}
        onCloseSharedLedgerModal={() => setShowSharedLedgerModal(false)}
        orgId={orgId}
        clientsForSharedLedger={clients.map((c) => ({
          id: c.id,
          name: c.name,
        }))}
        suppliersList={suppliersList}
        tripCountByParty={tripCountByParty}
        linkedClientIdByOrgId={uniqueLinkedClientIdByOrgId}
        linkedSupplierIdByOrgId={uniqueLinkedSupplierIdByOrgId}
        viewerOrgId={orgId}
      />

      <EntityListCategoryModal
        visible={showEntityListModal && financeSubTab === "cash"}
        onClose={() => setShowEntityListModal(false)}
        selectedLedgerCategory={selectedLedgerCategory}
        ledgerCategoryCounts={ledgerCategoryCounts}
        onSelectCategory={(key) => {
          setSelectedLedgerCategory(key);
          setShowEntityListModal(false);
        }}
        insetsTop={insets.top}
      />
    </View>
  );
}
