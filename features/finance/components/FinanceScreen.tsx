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
import { AIInsightsPanel } from "@/features/ai";
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
import { getTripDisplayNumber, type TripRow } from "@/features/trips";
import {
    buildUniqueLinkedOrgIdMap,
    isIntegratedClientRow,
    isIntegratedSupplierRow,
    isLoadBasedTrip,
} from "@/features/trips/visibility/tripVisibility";
import type { GarrageViewTab } from "@/features/vehicles/components/GarrageTab";
import type { GarragePeriodValue } from "@/features/vehicles/pnl";
import {
    buildTripPnLListForPeriod,
    buildVehiclePnLList,
    resolveVehicleIdForTrip,
} from "@/features/vehicles/pnl";
import {
    canAccessFinance,
    getCapabilitiesFromProfile,
} from "@/lib/capabilities";
import { tripDayIso } from "@/lib/dateRangePresets";
import { formatIndianVehicleNumber, formatLedgerDate } from "@/lib/format";
import { useTripFinanceAdjustmentsMap } from "@/lib/queries/useTripFinanceAdjustmentsQuery";
import { queryKeys } from "@/lib/queryKeys";
import { useLinkedOrgProfileMap } from "@/lib/useLinkedOrgProfileMap";
import { useQueryClient } from "@tanstack/react-query";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    Platform,
    Text,
    View,
    useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFinanceAddEntityHandlers } from "../hooks/useFinanceAddEntityHandlers";
import { useFinanceEntities } from "../hooks/useFinanceEntities";
import { useFinanceLedger } from "../hooks/useFinanceLedger";
import { useFinanceTransactionSubmit } from "../hooks/useFinanceTransactionSubmit";
import type { LedgerRow } from "../services/finance.service";
import {
    getProfileImage,
    updateLedgerEntry,
} from "../services/finance.service";
import type { FinanceSubTab } from "../types";
import type { TripEntryContext } from "./EntityDetailOverlay";
import { EntityListCategoryModal } from "./EntityListCategoryModal";
import { FinanceModals } from "./FinanceModals";
import { styles } from "./FinanceScreen.styles";
import { FinanceSummarySection } from "./FinanceSummarySection";
import {
  PartyRegistrationPortal,
  type PartyRegistrationKind,
} from "./PartyRegistrationPortal";
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

function createReportRow({
  id,
  organizationId,
  partyName,
  description,
  amountIn,
  amountOut,
  transactionDate,
  tripNumber,
  tripId = null,
  contactId,
  contactType = null,
}: {
  id: string;
  organizationId: string | null;
  partyName: string;
  description: string;
  amountIn: number;
  amountOut: number;
  transactionDate: string;
  tripNumber?: string | null;
  tripId?: string | null;
  contactId?: string;
  contactType?: "client" | "supplier" | "driver" | null;
}): LedgerRow {
  const date = transactionDate || new Date().toISOString();
  return {
    id,
    organization_id: organizationId ?? "",
    trip_id: tripId,
    trip_number: tripNumber ?? null,
    party_name: partyName,
    description,
    amount_in: amountIn,
    amount_out: amountOut,
    transaction_date: date,
    created_at: date,
    contact_id: contactId ?? null,
    contact_type: contactType,
  };
}

export function FinanceScreen() {
  const insets = useSafeAreaInsets();
  const screenTopPad =
    Platform.OS === "web" ? 0 : insets.top + Layout.headerPaddingBelowInset;
  const { width: screenWidth } = useWindowDimensions();
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
  const [entitiesRefreshKey, setEntitiesRefreshKey] = useState(0);
  const entities = useFinanceEntities({
    organizationId: currentOrganization?.id ?? null,
    canAccess,
    refreshKey: entitiesRefreshKey,
  });
  const allTripsForLedger = useMemo(
    () => [...entities.tripRows, ...entities.tripsWhereOrgIsSupplier],
    [entities.tripRows, entities.tripsWhereOrgIsSupplier],
  );

  const ledger = useFinanceLedger({
    organizationId: currentOrganization?.id ?? null,
    canAccess,
    tripRows: allTripsForLedger,
    vehicleRows: entities.vehicleRows,
    clients: entities.clientRows,
    suppliers: entities.supplierRows,
  });
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
    garagePeriodOptions,
    indentsForFinance,
    setPendingDriverSalaryRequests,
  } = entities;

  const linkedOrgDisplayMap = useLinkedOrgProfileMap(clientRows, supplierRows);

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
    filteredLedgerForDisplay,
    ledgerTotalsData,
    ledgerCategoryCounts,
    tripCountByParty,
    getVehicleNumberForTripId,
    tripPartyMap,
    tripDetailsMap,
    clearFilters: ledgerClearFilters,
    isAnyFilterActive: ledgerAnyFilterActive,
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
  const [financeSubTab, setFinanceSubTab] = useState<FinanceSubTab>("cash");
  const [showTransactionModal, setShowTransactionModal] = useState(false);
  const [showAddClientModal, setShowAddClientModal] = useState(false);
  const [showAddVehicleModal, setShowAddVehicleModal] = useState(false);
  const [showAddDriverModal, setShowAddDriverModal] = useState(false);
  const [showAddSupplierModal, setShowAddSupplierModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState<LedgerRow | null>(null);
  const [tabTotals, setTabTotals] = useState({ totalIn: 0, totalOut: 0 });
  const [refreshing, setRefreshing] = useState(false);
  const [profileImages, setProfileImages] = useState<Record<string, string>>(
    {},
  );

  useEffect(() => {
    let cancelled = false;

    const fetchProfileImages = async () => {
      const pending = new Map<
        string,
        { id: string; type: "client" | "supplier" | "driver" }
      >();
      for (const row of filteredLedgerForDisplay) {
        const id = (row.contact_id ?? "").trim();
        const type = row.contact_type;
        if (!id || !type) continue;
        if (profileImages[id]) continue;
        const dedupeKey = `${type}:${id}`;
        if (!pending.has(dedupeKey)) {
          pending.set(dedupeKey, { id, type });
        }
      }

      if (pending.size === 0) return;
      const entries = Array.from(pending.values());
      const resolved = await Promise.all(
        entries.map(async ({ id, type }) => {
          const uri = await getProfileImage(id, type);
          return uri ? ([id, uri] as const) : null;
        }),
      );

      if (cancelled) return;
      const next: Record<string, string> = {};
      for (const row of resolved) {
        if (!row) continue;
        next[row[0]] = row[1];
      }
      if (Object.keys(next).length > 0) {
        setProfileImages((prev) => ({ ...prev, ...next }));
      }
    };

    void fetchProfileImages();
    return () => {
      cancelled = true;
    };
  }, [filteredLedgerForDisplay, profileImages]);

  const isAnyFilterActive = useMemo(
    () => ledgerAnyFilterActive || entityFilter !== "all",
    [ledgerAnyFilterActive, entityFilter],
  );

  const handleClearFilters = useCallback(() => {
    ledgerClearFilters();
    setEntityFilter("all");
  }, [ledgerClearFilters]);

  const [showEntityListModal, setShowEntityListModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showSharedLedgerModal, setShowSharedLedgerModal] = useState(false);
  const [selectedEntity, setSelectedEntity] = useState<{
    data: FinancialRowData;
    entityType: "CLIENT" | "SUPPLIER" | "VEHICLE" | "DRIVER";
    subTab: FinanceSubTab;
  } | null>(null);
  const [selectedDriverLedgerEntries, setSelectedDriverLedgerEntries] =
    useState<DriverLedgerRow[] | null>(null);
  const [garagePeriod, setGaragePeriod] = useState<GarragePeriodValue>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}`;
  });
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

  useEffect(() => {
    if (canAccess && currentOrganization?.id && financeSubTab !== "cash") {
      setEntitiesRefreshKey((k) => k + 1);
    }
  }, [canAccess, currentOrganization?.id, financeSubTab]);

  const isFirstFinanceFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (!canAccess || !currentOrganization?.id) return;
      const orgId = currentOrganization.id;
      if (isFirstFinanceFocus.current) {
        isFirstFinanceFocus.current = false;
        return;
      }
      setEntitiesRefreshKey((k) => k + 1);
      setLedgerRefreshKey((k) => k + 1);
      queryClient.invalidateQueries({ queryKey: queryKeys.drivers.all(orgId) });
      queryClient.invalidateQueries({
        queryKey: queryKeys.vehicles.all(orgId),
      });
    }, [canAccess, currentOrganization?.id, queryClient]),
  );

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
    const allTrips = [...tripRows, ...tripsWhereOrgIsSupplier];
    const customersAgg = aggregateCustomers(
      clientRows,
      allTrips,
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
      indentsForFinance,
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
    const garageVehicles = buildVehiclePnLList(
      vehicleRows,
      tripRows,
      ledgerTransactions ?? null,
      garagePeriod,
      getTripDisplayNumber,
      currentOrganization?.id ?? null,
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
    const garageExpense = garageVehicles.reduce(
      (sum, row) => sum + Number(row.expense ?? 0),
      0,
    );
    const garageSales = garageVehicles.reduce(
      (sum, row) => sum + Number(row.sales ?? 0),
      0,
    );
    const activeGarageVehiclesCount = garageVehicles.filter(
      (row) =>
        Number(row.trips ?? 0) > 0 ||
        Number(row.sales ?? 0) > 0 ||
        Number(row.expense ?? 0) > 0,
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
        value: formatCompactRupee(customersAgg.totals.totalReceived),
        count: activeCustomersCount,
        secondaryLabel: "Outstanding",
        secondaryValue: formatCompactRupee(customersOutstanding),
      },
      suppliers: {
        value: formatCompactRupee(suppliersAgg.totals.totalPaid),
        count: activeSuppliersCount,
        secondaryLabel: "Outstanding",
        secondaryValue: formatCompactRupee(suppliersOutstanding),
      },
      garage: {
        value: formatCompactRupee(garageSales),
        count: activeGarageVehiclesCount,
        secondaryLabel: "Total Expense",
        secondaryValue: formatCompactRupee(garageExpense),
      },
      drivers: {
        value: formatCompactRupee(driversAgg.totals.totalPaid),
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
    garagePeriod,
    getTripDisplayNumber,
    indentsForFinance,
    ledgerTotalsData.totalIn,
    ledgerTotalsData.totalOut,
    ledgerTransactions,
    supplierRows,
    tripPartyMap,
    tripRows,
    tripsWhereOrgIsClient,
    tripsWhereOrgIsSupplier,
    vehicleRows,
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
  const reportTransactions = useMemo(() => {
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
      const allTrips = [...tripRows, ...tripsWhereOrgIsSupplier];
      const { rows } = aggregateCustomers(
        clientRows,
        allTrips,
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
      allTrips.forEach((trip) => {
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

    const tripRowsForReport = buildTripPnLListForPeriod(
      tripRows,
      vehicleRows,
      ledgerTransactions ?? null,
      garagePeriod,
      getTripDisplayNumber,
    );
    const vehicleRowsForReport = buildVehiclePnLList(
      vehicleRows,
      tripRows,
      ledgerTransactions ?? null,
      garagePeriod,
      getTripDisplayNumber,
      organizationId,
    );
    const latestTripDateByVehicleId: Record<string, string> = {};
    tripRows.forEach((trip) => {
      updateLatest(
        latestTripDateByVehicleId,
        resolveVehicleIdForTrip(trip, vehicleRows),
        trip.pickup_date ?? trip.created_at ?? fallbackDate,
      );
    });

    if (garageViewTab === "trips") {
      const filteredTripRows = tripRowsForReport.filter((row) => {
        if (!q) return true;
        const vehicleName =
          getVehicleNumberForTripId(row.id) ||
          (row.trip.vehicle_display_number
            ? formatIndianVehicleNumber(row.trip.vehicle_display_number)
            : "Unassigned");
        return (
          (row.missionId ?? "").toLowerCase().includes(q) ||
          (row.clientName ?? "").toLowerCase().includes(q) ||
          vehicleName.toLowerCase().includes(q)
        );
      });

      return filteredTripRows.map((row) => {
        const vehicleName =
          getVehicleNumberForTripId(row.id) ||
          (row.trip.vehicle_display_number
            ? formatIndianVehicleNumber(row.trip.vehicle_display_number)
            : "Unassigned");
        return createReportRow({
          id: `garage-trip-report-${row.id}`,
          organizationId,
          partyName: vehicleName,
          description: `${row.clientName} • ${row.origin} → ${row.dest}`,
          amountIn: Number(row.sales ?? 0),
          amountOut: Number(row.totalExpense ?? 0),
          transactionDate:
            row.trip.pickup_date ?? row.trip.created_at ?? fallbackDate,
          tripNumber: row.missionId,
          tripId: row.id,
        });
      });
    }

    let filteredVehicleRows = vehicleRowsForReport;
    if (garageViewTab === "revenue") {
      filteredVehicleRows = [...filteredVehicleRows].sort(
        (a, b) => b.sales - a.sales,
      );
    } else if (garageViewTab === "profit") {
      filteredVehicleRows = [...filteredVehicleRows].sort(
        (a, b) => b.pnl - a.pnl,
      );
    }
    if (q) {
      filteredVehicleRows = filteredVehicleRows.filter(
        (row) =>
          (row.name || "").toLowerCase().includes(q) ||
          (row.type || "").toLowerCase().includes(q),
      );
    }
    if (entityFilter === "has_due") {
      filteredVehicleRows = filteredVehicleRows.filter(
        (row) => row.expense > 0,
      );
    } else if (entityFilter === "no_due") {
      filteredVehicleRows = filteredVehicleRows.filter(
        (row) => row.expense === 0,
      );
    }

    return filteredVehicleRows.map((row) =>
      createReportRow({
        id: `garage-vehicle-report-${row.id}`,
        organizationId,
        partyName: row.name,
        description: `${row.type || "Vehicle"} • Trips ${row.trips} • P&L ₹${row.pnl.toLocaleString("en-IN")}`,
        amountIn: Number(row.sales ?? 0),
        amountOut: Number(row.expense ?? 0),
        transactionDate: latestTripDateByVehicleId[row.id] ?? fallbackDate,
        tripNumber: `${row.trips} trips`,
      }),
    );
  }, [
    clients,
    currentOrganization?.id,
    driverOffers,
    driverRows,
    entityFilter,
    filteredLedgerForDisplay,
    financeSubTab,
    garagePeriod,
    garageViewTab,
    getVehicleNumberForTripId,
    indentsForFinance,
    ledgerTransactions,
    searchQuery,
    supplierRows,
    tripPartyMap,
    tripRows,
    tripsWhereOrgIsClient,
    tripsWhereOrgIsSupplier,
    tripFinanceAdjustmentsByTripId,
    vehicleRows,
  ]);
  const bannerTotals = financeSubTab === "cash" ? ledgerTotalsData : tabTotals;

  const handleEntityRowSelect = useCallback(
    (
      data: FinancialRowData,
      entityType: "CLIENT" | "SUPPLIER" | "VEHICLE" | "DRIVER",
      subTab: FinanceSubTab,
    ) => {
      // Customer selection from Finance > Customers: open full ClientDetailScreen (detail page)
      if (entityType === "CLIENT" && subTab === "customers") {
        router.push(`/client/${data.id}`);
        return;
      }
      // Supplier selection from Finance > Suppliers: open full SupplierDetailScreen (detail page)
      if (entityType === "SUPPLIER" && subTab === "suppliers") {
        router.push(`/supplier/${data.id}`);
        return;
      }
      // Vehicle selection from Finance > Garage: open full VehicleDetailScreen (detail page)
      if (entityType === "VEHICLE" && subTab === "garage") {
        router.push(`/vehicle/${data.id}`);
        return;
      }
      // Driver selection from Finance > Drivers: open full DriverDetailScreen (detail page)
      if (entityType === "DRIVER" && subTab === "drivers") {
        router.push(`/driver/${data.id}`);
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

  const handleLedgerMissionChange = useCallback(
    async (entryId: string, tripId: string) => {
      const orgId = currentOrganization?.id;
      if (!orgId) return;
      const row = filteredLedgerForDisplay.find((r) => r.id === entryId);
      if (!row) return;
      const { error } = await updateLedgerEntry(orgId, entryId, {
        trip_id: tripId,
        party_name: row.party_name,
        description: row.description ?? "ENTRY",
        amount_in: row.amount_in,
        amount_out: row.amount_out,
        transaction_date: row.transaction_date,
        contact_id: row.contact_id ?? undefined,
        contact_type: row.contact_type ?? undefined,
      });
      if (!error) setLedgerRefreshKey((k) => k + 1);
    },
    [currentOrganization?.id, filteredLedgerForDisplay],
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setLedgerRefreshKey((k) => k + 1);
    setEntitiesRefreshKey((k) => k + 1);
    const timeoutId = setTimeout(() => setRefreshing(false), 15000);
    try {
      await refetchLedger();
    } finally {
      clearTimeout(timeoutId);
      setRefreshing(false);
    }
  }, [refetchLedger]);

  if (!canAccess) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <Text style={styles.message}>{t("noAccessFinance")}</Text>
      </View>
    );
  }

  const orgId = currentOrganization?.id ?? null;

  if (isOrgLoading) {
    return (
      <View style={[styles.container, { paddingTop: screenTopPad }]}>
        <View style={[styles.centered, { flex: 1, paddingTop: 24 }]}>
          <ActivityIndicator size="large" color={Theme.primary} />
        </View>
      </View>
    );
  }

  if (!orgId) {
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

  return (
    <View
      style={[styles.container, { paddingTop: screenTopPad }]}
      testID="finance-tab-screen"
    >
      <FinanceSummarySection
        title={t("treasury")}
        subtitle={t("fiscalMatrix")}
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
      />
      <View style={styles.tableScroll}>
        <View style={styles.tableScrollInner}>
          <View style={styles.ledgerCardWrap}>
            <FinanceTabBody
              financeSubTab={financeSubTab}
              organizationId={orgId}
              ledgerLoading={ledgerLoading}
              ledgerTransactions={ledgerTransactions}
              filteredLedgerForDisplay={filteredLedgerForDisplay}
              ledgerRefreshKey={ledgerRefreshKey}
              onAddTransactionPress={() =>
                router.push("/(modals)/ledger-sync" as const)
              }
              onLedgerRowSelect={handleLedgerRowSelect}
              getVehicleNumberForTripId={getVehicleNumberForTripId}
              tripOptions={filteredTripOptionsForFinance}
              tripDetailsMap={tripDetailsMap}
              onLedgerMissionChange={handleLedgerMissionChange}
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
              onTripSelect={(tripId) => router.push(`/trip/${tripId}` as const)}
              topContent={
                currentOrganization?.id ? (
                  <View style={styles.aiInsightsWrap}>
                    <AIInsightsPanel organizationId={currentOrganization.id} />
                  </View>
                ) : null
              }
              refreshing={refreshing}
              onRefresh={handleRefresh}
              bottomInset={
                24 + insets.bottom + Layout.demoTabBarScrollBottomInset + 40
              }
              profileImages={profileImages}
              linkedOrgDisplayMap={linkedOrgDisplayMap}
              tripFinanceAdjustmentsByTripId={tripFinanceAdjustmentsByTripId}
            />
          </View>
        </View>
      </View>

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
                bottom:
                  Layout.demoTabBarScrollBottomInset +
                  insets.bottom +
                  Layout.tabBarBottomPaddingMin +
                  Layout.fabStackOffset,
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

      <PartyRegistrationPortal
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
      />

      <FinanceModals
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
            if (
              entity.entityType === "CLIENT" &&
              pending != null &&
              pending > 0
            ) {
              params.set("dueAmountIn", String(pending));
            }
            if (entity.entityType === "SUPPLIER" && due != null && due > 0) {
              params.set("dueAmountOut", String(due));
            }
            if (entity.entityType === "DRIVER") {
              const driverDue = pending ?? due;
              if (driverDue != null && driverDue > 0) {
                params.set("dueAmountOut", String(driverDue));
              }
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
