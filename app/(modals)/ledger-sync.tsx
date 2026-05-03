/**
 * Full-page Ledger Sync — add or edit a ledger entry (double-entry aligned).
 * Reuses AddTransactionModal in fullPage mode; data flow per docs/CORE_ACCOUNTING_MODEL.md.
 */
import type { PartyOption, TripOption, VehicleOption } from "@/components/AddTransactionModal";
import {
  AddTransactionModal,
  DRIVER_PAYMENT_TYPES,
  type AddTransactionData,
  type AddTransactionSubmitOptions,
} from "@/components/AddTransactionModal";
import Theme from "@/constants/Theme";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { getClientsByOrganization, type ClientRow } from "@/features/clients";
import {
  createDriverLedgerEntry,
  getDriverOffersByOrganization,
  getDriversByOrganization,
} from "@/features/drivers";
import type { DriverOffer } from "@/features/drivers/services/drivers.service";
import {
  createLedgerEntry,
  getTransactionsByOrganization,
  updateLedgerEntry,
  type LedgerRow,
} from "@/features/finance";
import { buildLedgerSyncDescriptionLine } from "@/features/finance/ledger/ledgerEntryModel";
import { getTripLedgerEntries } from "@/features/finance/utils/getTripLedgerEntries";
import { getSuppliersByOrganization, type SupplierRow } from "@/features/suppliers";
import { getTripDisplayNumber, getTripsByOrganization, getTripsWhereOrgIsClient, getTripsWhereOrgIsSupplier, type TripRow } from "@/features/trips";
import { buildUniqueLinkedOrgIdMap, isLoadBasedTrip } from "@/features/trips/visibility/tripVisibility";
import {
  AddVehicleEntryModal,
  getVehiclesByOrganization,
  type VehicleEntryTripOption,
} from "@/features/vehicles";
import { updateSalaryRequestStatus } from "@/services/salaryRequestsService";
import { useLanguage } from "@/contexts/LanguageContext";
import { formatLedgerDate } from "@/lib/format";
import { queryKeys } from "@/lib/queryKeys";
import { useSafeBack } from "@/lib/useSafeBack";
import { ROUTES } from "@/lib/routes";
import { useQueryClient } from "@tanstack/react-query";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** TripOption with organization_id and driver_display_name for entity filtering. */
type TripOptionWithOrg = TripOption & {
  organization_id?: string;
  driver_display_name?: string | null;
};

/** Per-trip rates for computing trip-level due (placeholder) when trip is locked in ledger sync. */
type TripDueMeta = {
  client_price: number;
  supplier_rate: number;
  organization_id: string | null;
  indent_id: string | null;
  /** True if we are the supplier of a trip owned by another organization. */
  isCrossOrgSupplier: boolean;
};

function getSupplierDisplayName(
  supplier: Pick<
    SupplierRow,
    "name" | "company_name" | "contact_person" | "owner_full_name"
  > | null | undefined,
  fallback = "Supplier",
): string {
  const value =
    supplier?.name?.trim() ||
    supplier?.company_name?.trim() ||
    supplier?.contact_person?.trim() ||
    supplier?.owner_full_name?.trim() ||
    "";
  return value || fallback;
}

export default function LedgerSyncScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useLanguage();
  const raw = useLocalSearchParams<{
    entryId?: string;
    partyContext?: string;
    partyId?: string;
    partyName?: string;
    entityType?: string;
    entityId?: string;
    /** Pre-select trip (e.g. from trip detail page Record cash in / Add expense). */
    tripId?: string;
    /** Trip display (e.g. MSN-001) when opening from trip detail — shown before trips load. */
    tripNumber?: string;
    /** Pre-select IN or OUT when opening from trip detail. */
    defaultType?: string;
    /** When "trip-ledger", after submit navigate back to trip-ledger/[tripId] instead of trip/[tripId]. */
    returnTo?: string;
    /** Pre-fill amount (e.g. from Pay Now / driver salary request). */
    salaryAmount?: string;
    /** Driver payment type when opening from Pay Now (advance | settlement). */
    defaultDriverPaymentType?: string;
    /** Salary request id to mark as paid after successful submit (Pay Now flow). */
    salaryRequestId?: string;
    /** Suggested receivable for Cash IN amount placeholder (from entity or trip). */
    dueAmountIn?: string;
    /** Suggested payable for Cash OUT amount placeholder. */
    dueAmountOut?: string;
  }>();
  const params = {
    entryId: typeof raw.entryId === "string" ? raw.entryId : undefined,
    partyContext: typeof raw.partyContext === "string" ? raw.partyContext : undefined,
    partyId: typeof raw.partyId === "string" ? raw.partyId : undefined,
    partyName: typeof raw.partyName === "string" ? raw.partyName : undefined,
    entityType: typeof raw.entityType === "string" ? raw.entityType : undefined,
    entityId: typeof raw.entityId === "string" ? raw.entityId : undefined,
    tripId: typeof raw.tripId === "string" ? raw.tripId : undefined,
    tripNumber: typeof raw.tripNumber === "string" ? raw.tripNumber : undefined,
    defaultType: typeof raw.defaultType === "string" && (raw.defaultType === "in" || raw.defaultType === "out") ? raw.defaultType : undefined,
    returnTo: typeof raw.returnTo === "string" ? raw.returnTo : undefined,
    salaryAmount: typeof raw.salaryAmount === "string" ? raw.salaryAmount : undefined,
    defaultDriverPaymentType:
      typeof raw.defaultDriverPaymentType === "string" &&
      ["advance", "settlement", "salary", "bonus", "deduction", "reimbursement", "adjustment"].includes(raw.defaultDriverPaymentType)
        ? raw.defaultDriverPaymentType
        : undefined,
    salaryRequestId: typeof raw.salaryRequestId === "string" ? raw.salaryRequestId : undefined,
    dueAmountIn: typeof raw.dueAmountIn === "string" ? raw.dueAmountIn : undefined,
    dueAmountOut: typeof raw.dueAmountOut === "string" ? raw.dueAmountOut : undefined,
  };

  const parseDueQueryAmount = (s: string | undefined): number | null => {
    if (s == null || s.trim() === "") return null;
    const n = parseFloat(s.replace(/,/g, ""));
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const dueAmountInFromQuery = parseDueQueryAmount(params.dueAmountIn);
  const dueAmountOutFromQuery = parseDueQueryAmount(params.dueAmountOut);
  const { currentOrganization } = useOrganization();
  const { profile } = useAuth();
  const fallbackRouteForClose = useMemo(() => {
    if (params.tripId) {
      if (params.returnTo === "trip-ledger") {
        const q = new URLSearchParams();
        if (params.entityType) q.set("entityType", params.entityType);
        if (params.entityId) q.set("entityId", params.entityId);
        if (params.partyName) q.set("partyName", params.partyName);
        const query = q.toString();
        return query ? `/trip-ledger/${params.tripId}?${query}` : `/trip-ledger/${params.tripId}`;
      }
      return `/trip/${params.tripId}`;
    }

    if (params.entityType && params.entityId) {
      switch (params.entityType) {
        case "CLIENT":
          return `/client/${params.entityId}`;
        case "SUPPLIER":
          return `/supplier/${params.entityId}`;
        case "DRIVER":
          return `/driver/${params.entityId}`;
        case "VEHICLE":
          return `/vehicle/${params.entityId}`;
      }
    }

    return "/(tabs)/finance";
  }, [params.tripId, params.returnTo, params.entityType, params.entityId, params.partyName]);

  const safeBack = useSafeBack(fallbackRouteForClose);

  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [drivers, setDrivers] = useState<PartyOption[]>([]);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [trips, setTrips] = useState<TripOptionWithOrg[]>([]);
  const [tripDueMetaById, setTripDueMetaById] = useState<Record<string, TripDueMeta>>({});
  const [transactions, setTransactions] = useState<LedgerRow[] | null>(null);
  const [driverOffers, setDriverOffers] = useState<Record<string, DriverOffer>>({});
  const [editingEntry, setEditingEntry] = useState<LedgerRow | null>(null);
  /** When we're in vehicle add-entry flow, keep vehicle id so we always fall back to vehicle detail on save/close. */
  const vehicleIdForFallbackRef = React.useRef<string | null>(null);
  if (params.entityType === "VEHICLE" && params.entityId) {
    vehicleIdForFallbackRef.current = params.entityId;
  }

  const orgId = currentOrganization?.id ?? null;
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all([
      getClientsByOrganization(orgId).then((r) => (r.error ? [] : (r.clients ?? []))),
      getSuppliersByOrganization(orgId).then((r) => (r.error ? [] : (r.suppliers ?? []))),
      getDriversByOrganization(orgId).then((r) => {
        const list = r?.error ? [] : (r?.drivers ?? []);
        return Array.isArray(list)
          ? list.map((d) => ({
              id: d.id,
              name: d.name ?? d.phone ?? t("driver"),
              avatar_url: d.avatar_url ?? null,
              avatar_seed: d.avatar_seed ?? null,
            }))
          : [];
      }),
      getVehiclesByOrganization(orgId).then((r) => {
        const list = r?.error ? [] : (r?.vehicles ?? []);
        return Array.isArray(list) ? list.map((v) => ({ id: v.id, vehicle_number: v.vehicle_number ?? "" })) : [];
      }),
      Promise.all([
        getTripsByOrganization(orgId),
        getTripsWhereOrgIsClient(orgId),
        getTripsWhereOrgIsSupplier(orgId),
      ]).then(([ownedRes, asClientRes, asSupplierRes]) => {
        const owned = ownedRes?.error ? [] : (ownedRes?.trips ?? []);
        const asClient = asClientRes?.error ? [] : (asClientRes?.trips ?? []);
        const asSupplier = asSupplierRes?.error ? [] : (asSupplierRes?.trips ?? []);
        const seen = new Set<string>();
        const merged: TripRow[] = [];
        for (const t of owned) {
          if (!seen.has(t.id)) {
            merged.push(t);
            seen.add(t.id);
          }
        }
        for (const t of asClient) {
          if (!seen.has(t.id)) {
            merged.push(t);
            seen.add(t.id);
          }
        }
        for (const t of asSupplier) {
          if (!seen.has(t.id)) {
            merged.push(t);
            seen.add(t.id);
          }
        }
        const asSupplierIds = new Set(asSupplier.map((t) => t.id));
        const tripDueMeta: Record<string, TripDueMeta> = {};
        merged.forEach((t: TripRow) => {
          tripDueMeta[t.id] = {
            client_price: Number(t.client_price ?? 0),
            supplier_rate: Number(t.supplier_rate ?? 0),
            organization_id: t.organization_id ?? null,
            indent_id: t.indent_id ?? null,
            isCrossOrgSupplier: asSupplierIds.has(t.id) && t.organization_id !== orgId,
          };
        });
        const options = merged.map((t: TripRow) => {
          const meta = tripDueMeta[t.id];
          return {
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
            route_label: [t.pickup_area, t.drop_location].filter(Boolean).join(' → ') || null,
            trip_date: formatLedgerDate(t.pickup_date || t.created_at),
            organization_id: t.organization_id,
            client_price: t.client_price ?? null,
            supplier_rate: t.supplier_rate ?? null,
            driver_commission: t.driver_commission ?? null,
            distance: t.distance ?? null,
            is_cross_org_supplier: meta?.isCrossOrgSupplier ?? false,
            trip_payout_mode: t.trip_payout_mode ?? null,
            status: t.status ?? null,
            completed_at: t.completed_at ?? null,
          } as TripOptionWithOrg;
        });
        return { options, tripDueMeta };
      }),
      getTransactionsByOrganization(orgId).then(({ error, transactions: txs }) => (error ? [] : (txs ?? []))),
      getDriverOffersByOrganization(orgId).then((r) =>
        r.error || !r.offersByDriverId ? {} : r.offersByDriverId,
      ),
    ])
      .then(([clientsList, suppliersList, d, v, tripLoad, txs, offers]) => {
        if (cancelled) return;
        setClients(clientsList);
        setSuppliers(suppliersList);
        setDrivers(d);
        setVehicles(v);
        setTrips(tripLoad.options);
        setTripDueMetaById(tripLoad.tripDueMeta);
        setTransactions(txs);
        setDriverOffers(offers ?? {});
        if (params.entryId && txs.length > 0) {
          const entry = txs.find((r) => r.id === params.entryId);
          if (entry) setEditingEntry(entry);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId, params.entryId]);

  const uniqueLinkedClientIdByOrgId = useMemo(
    () => buildUniqueLinkedOrgIdMap(clients),
    [clients],
  );
  const uniqueLinkedSupplierIdByOrgId = useMemo(
    () => buildUniqueLinkedOrgIdMap(suppliers),
    [suppliers],
  );

  /**
   * Supplier POV on integrated getLoad: try origin/qunifiedbase-style write first (UI trip_id + plain
   * description). finance.service still runs unanchored+QMETA retry if the DB rejects trip_id.
   */
  const qUnifiedPassthroughLedgerTripCreate = useMemo(() => {
    if (!orgId || !params.tripId) return false;
    const meta = tripDueMetaById[params.tripId];
    if (!meta?.indent_id || !meta.isCrossOrgSupplier) return false;
    const ownerOrg = meta.organization_id;
    if (!ownerOrg || ownerOrg === orgId) return false;
    return true;
  }, [orgId, params.tripId, tripDueMetaById]);

  /** When opened from entity detail (vehicle/driver/client/supplier), show that entity's trips. For SUPPLIER, include owned trips and trips where org is client (integrated supplier-created). */
  const filteredTrips = useMemo(() => {
    if (!params.entityType || !params.entityId) return trips;
    switch (params.entityType) {
      case "VEHICLE":
        return trips.filter((t) => (t as { vehicle_id?: string | null }).vehicle_id === params.entityId);
      case "DRIVER":
        return trips.filter((t) => t.driver_id === params.entityId);
      case "CLIENT":
        return trips.filter((t) => {
          const client = clients.find((c) => c.id === params.entityId) as {
            linked_organization_id?: string | null;
            is_integrated?: boolean;
          } | undefined;
          const linkedOrgId = client?.linked_organization_id ?? null;
          return (
            t.client_id === params.entityId ||
            (
              client?.is_integrated === true &&
              linkedOrgId != null &&
              isLoadBasedTrip(t) &&
              t.organization_id === linkedOrgId &&
              uniqueLinkedClientIdByOrgId.get(linkedOrgId) === params.entityId
            )
          );
        });
      case "SUPPLIER": {
        const supplier = suppliers.find((s) => s.id === params.entityId) as {
          linked_organization_id?: string | null;
          supplier_type?: string | null;
        } | undefined;
        const linkedOrgId = supplier?.linked_organization_id ?? null;
        return trips.filter(
          (t) =>
            t.supplier_id === params.entityId ||
            (
              supplier?.supplier_type === "integrated" &&
              linkedOrgId != null &&
              isLoadBasedTrip(t) &&
              t.organization_id === linkedOrgId &&
              uniqueLinkedSupplierIdByOrgId.get(linkedOrgId) === params.entityId
            ),
        );
      }
      default:
        return trips;
    }
  }, [
    trips,
    params.entityType,
    params.entityId,
    suppliers,
    clients,
    uniqueLinkedClientIdByOrgId,
    uniqueLinkedSupplierIdByOrgId,
  ]);

  const clientPartyOptions: PartyOption[] = clients.map((c) => ({
    id: c.id,
    name: c.name ?? c.contact_person ?? t("client"),
    avatar_url: c.avatar_url ?? null,
    avatar_seed: c.avatar_seed ?? null,
    linked_organization_id: c.linked_organization_id ?? null,
    is_integrated: c.is_integrated === true,
  }));
  const supplierPartyOptions: PartyOption[] = suppliers.map((s) => ({
    id: s.id,
    name: getSupplierDisplayName(s, t("supplier")),
    avatar_url: s.avatar_url ?? null,
    avatar_seed: s.avatar_seed ?? null,
    linked_organization_id: s.linked_organization_id ?? null,
    supplier_type: s.supplier_type ?? null,
  }));

  /** For VEHICLE entity: trip options for AddVehicleEntryModal (with driver_id for auto-fill). */
  const vehicleTripOptions: VehicleEntryTripOption[] = useMemo(
    () =>
      filteredTrips.map((t) => ({
        id: t.id,
        trip_number: t.trip_number,
        route_label: t.route_label ?? null,
        trip_date: t.trip_date ?? null,
        driver_id: (t as { driver_id?: string | null }).driver_id ?? null,
      })),
    [filteredTrips]
  );

  const vehicleNumber =
    params.entityType === "VEHICLE" && params.entityId
      ? vehicles.find((v) => v.id === params.entityId)?.vehicle_number ?? ""
      : "";

  const handleVehicleEntrySubmit = useCallback(
    async (data: Parameters<typeof createLedgerEntry>[1]) => {
      if (!orgId) return;
      const { error } = await createLedgerEntry(orgId, data);
      if (error) {
        Alert.alert(t("error"), error.message);
        return;
      }
      // Always fall back to vehicle detail page when we're in vehicle add-entry flow.
      const vehicleId = params.entityId ?? vehicleIdForFallbackRef.current;
      if (params.entityType === "VEHICLE" && vehicleId) {
        router.replace(`/vehicle/${vehicleId}`);
      } else {
        router.replace(ROUTES.TABS.FINANCE as '/');
      }
    },
    [orgId, router, params.entityType, params.entityId]
  );

  /** Map supplier/client id -> linked_organization_id so AddTransactionModal can show trips created by that org (org-as-client or integrated shipper). */
  const supplierLinkedOrgIds = useMemo(() => {
    const m: Record<string, string> = {};
    suppliers.forEach((s) => {
      const lid = (s as { linked_organization_id?: string | null }).linked_organization_id;
      if (lid) m[s.id] = lid;
    });
    clients.forEach((c) => {
      const lid = (c as { linked_organization_id?: string | null }).linked_organization_id;
      if (lid) m[c.id] = lid;
    });
    return m;
  }, [suppliers, clients]);

  /** Trip-level due for amount placeholder when trip is locked (aligns with mission row SALES/RECEIVED/DUE). */
  const tripComputedDues = useMemo(() => {
    const tid = params.tripId;
    if (!tid || transactions === null) {
      return { in: null as number | null, out: null as number | null };
    }
    const meta = tripDueMetaById[tid];
    if (!meta) return { in: null, out: null };
    const lockedTrip = trips.find((t) => t.id === tid);
    const lockedTripNumber = lockedTrip
      ? getTripDisplayNumber(lockedTrip as TripRow)
      : null;
    const entries = getTripLedgerEntries(transactions, tid, lockedTripNumber);

    // sales: what we are owed (Cash IN placeholder)
    const sales = meta.isCrossOrgSupplier
      ? Number(meta.supplier_rate ?? 0)
      : Number(meta.client_price ?? 0);

    const received = entries.reduce((s, tx) => s + Number(tx.amount_in ?? 0), 0);
    const pendingIn = Math.max(0, sales - received);

    // cost: what we owe others (Cash OUT placeholder)
    const isTripWhereWeAreClient =
      meta.organization_id != null && orgId != null && meta.organization_id !== orgId;

    const supplierCost = meta.isCrossOrgSupplier
      ? 0 // As integrated supplier, this record is our revenue, not our cost.
      : isTripWhereWeAreClient
        ? Number(meta.client_price ?? 0) || Number(meta.supplier_rate ?? 0)
        : Number(meta.supplier_rate ?? 0);

    const supplierPaid = entries.reduce((s, tx) => s + Number(tx.amount_out ?? 0), 0);
    const pendingOut = Math.max(0, supplierCost - supplierPaid);

    return {
      in: pendingIn > 0 ? pendingIn : null,
      out: pendingOut > 0 ? pendingOut : null,
    };
  }, [params.tripId, transactions, tripDueMetaById, orgId, trips]);

  const effectiveDueAmountIn = tripComputedDues.in ?? dueAmountInFromQuery;
  const effectiveDueAmountOut = tripComputedDues.out ?? dueAmountOutFromQuery;

  const handleSubmit = useCallback(
    async (data: AddTransactionData, options?: AddTransactionSubmitOptions) => {
      if (!orgId) return;
      const today = new Date().toISOString().slice(0, 10);
      const transactionDate =
        (data.transactionDate && /^\d{4}-\d{2}-\d{2}$/.test(data.transactionDate))
          ? data.transactionDate.slice(0, 10)
          : options?.entryId && editingEntry?.transaction_date
            ? editingEntry.transaction_date.slice(0, 10)
            : today;

      const ledgerRuns: {
        data: AddTransactionData;
        options?: AddTransactionSubmitOptions;
      }[] =
        data.tripAllocations &&
        data.tripAllocations.length > 0 &&
        !options?.entryId
          ? data.tripAllocations.map((alloc) => ({
              data: {
                ...data,
                tripId: alloc.tripId,
                amount: alloc.amount,
                tripNumber: alloc.tripNumber ?? null,
                indentId: alloc.indentId ?? null,
                tripAllocations: undefined,
              },
              options: undefined,
            }))
          : [{ data, options }];

      for (let runIdx = 0; runIdx < ledgerRuns.length; runIdx++) {
        const data = ledgerRuns[runIdx].data;
        const options = ledgerRuns[runIdx].options;

      const driverPaymentLabel =
        data.type === "out" &&
        data.driverPaymentType &&
        (DRIVER_PAYMENT_TYPES.find((t) => t.type === data.driverPaymentType)?.label ?? data.driverPaymentType);

      // Ensure client cash-in entries are strongly linked so Customers/Client Detail can aggregate them.
      const linkedTrip = data.tripId
        ? trips.find((t) => t.id === data.tripId)
        : undefined;
      let resolvedContactId = data.contactId ?? null;
      let resolvedContactType = data.contactType ?? null;
      let resolvedPartyName = data.partyName || "—";

      if (data.type === "in") {
        if (!resolvedContactId || resolvedContactType !== "client") {
          // For integrated trips we don't own, the client_id on the record belongs to the other org.
          // We need to resolve our own local client ID that is linked to the trip owner.
          const fromTripClientId =
            linkedTrip && linkedTrip.organization_id && linkedTrip.organization_id !== orgId
              ? uniqueLinkedClientIdByOrgId.get(linkedTrip.organization_id) ?? null
              : linkedTrip?.client_id ?? null;

          const fromEntityClientId =
            params.entityType === "CLIENT" ? (params.entityId ?? null) : null;
          const fromContextClientId =
            params.partyContext === "customers" ? (params.partyId ?? null) : null;
          const candidateClientId =
            fromTripClientId || fromEntityClientId || fromContextClientId;
          if (candidateClientId) {
            resolvedContactId = candidateClientId;
            resolvedContactType = "client";
          }
        }

        if (!resolvedPartyName || resolvedPartyName === "—") {
          const fromClientIdName = resolvedContactId
            ? clients.find((c) => c.id === resolvedContactId)?.name ??
              clients.find((c) => c.id === resolvedContactId)?.contact_person ??
              null
            : null;
          // For integrated trips, we want our local client name (the shipper), not the end customer name from the trip.
          const fromTripName =
            linkedTrip && linkedTrip.organization_id !== orgId
              ? fromClientIdName
              : linkedTrip?.client_name ?? null;

          resolvedPartyName = fromTripName || fromClientIdName || params.partyName || "—";
        }
      }

      // Similarly for Cash OUT: if it's an integrated trip we don't own, resolve the correct supplier.
      if (data.type === "out" && (!resolvedContactId || resolvedContactType === "driver")) {
        // If it's a driver payment, we keep it as is. But if it's a generic OUT or we're looking for a supplier:
        if (!resolvedContactId || resolvedContactType !== "driver") {
          const fromTripSupplierId =
            linkedTrip && linkedTrip.organization_id && linkedTrip.organization_id !== orgId
              ? uniqueLinkedSupplierIdByOrgId.get(linkedTrip.organization_id) ?? null
              : linkedTrip?.supplier_id ?? null;
          const fromEntitySupplierId =
            params.entityType === "SUPPLIER" ? (params.entityId ?? null) : null;
          const fromContextSupplierId =
            params.partyContext === "suppliers" ? (params.partyId ?? null) : null;
          const candidateSupplierId =
            fromTripSupplierId || fromEntitySupplierId || fromContextSupplierId;

          if (candidateSupplierId && !resolvedContactId) {
            resolvedContactId = candidateSupplierId;
            resolvedContactType = "supplier";
          }
        }

        if (!resolvedPartyName || resolvedPartyName === "—") {
          const fromSupplierName = resolvedContactId && resolvedContactType === "supplier"
            ? getSupplierDisplayName(
                suppliers.find((s) => s.id === resolvedContactId),
                "",
              ) || null
            : null;
          if (fromSupplierName) {
            resolvedPartyName = fromSupplierName;
          }
        }
      }

      // For integrated/cross-org supplier payouts, ensure contact_id is mapped to
      // the local supplier id in this org, even when a foreign supplier id is present.
      if (data.type === "out" && resolvedContactType === "supplier") {
        const isCrossOrgTripForOut =
          !!linkedTrip?.organization_id &&
          !!orgId &&
          linkedTrip.organization_id !== orgId;
        const mappedLocalSupplierIdFromTripOrg =
          isCrossOrgTripForOut && linkedTrip?.organization_id
            ? uniqueLinkedSupplierIdByOrgId.get(linkedTrip.organization_id) ?? null
            : null;
        const currentResolvedSupplierExistsLocally =
          !!resolvedContactId &&
          suppliers.some((s) => s.id === resolvedContactId);
        if (
          mappedLocalSupplierIdFromTripOrg &&
          !currentResolvedSupplierExistsLocally
        ) {
          resolvedContactId = mappedLocalSupplierIdFromTripOrg;
          resolvedContactType = "supplier";
        }
      }

      if (
        data.type === "out" &&
        data.contactType === "driver" &&
        data.contactId
      ) {
        const fromDriverList =
          drivers.find((d) => d.id === data.contactId)?.name?.trim() || null;
        const fromPayload =
          (data.driverName || data.partyName || "").trim() || null;
        if (fromDriverList || fromPayload) {
          resolvedPartyName = fromDriverList || fromPayload || resolvedPartyName;
        }
      }

      const baseDescription = (data.type === "in"
        ? (data.category ?? "ENTRY")
        : data.type === "out"
          ? (driverPaymentLabel ?? data.category ?? "ENTRY")
          : "ENTRY") as string;

      const modeName = data.paymentMode
        ? data.paymentMode === "UPI"
          ? "UPI"
          : data.paymentMode === "BANK"
            ? "Bank Transfer"
            : data.paymentMode === "CHEQUE"
              ? "Cheque"
              : data.paymentMode === "CASH"
                ? "Cash"
                : data.paymentMode
        : null;

      const description = buildLedgerSyncDescriptionLine({
        categoryOrKind: baseDescription,
        paymentModeLabel: modeName,
        paymentModeId: data.paymentMode ?? null,
        paymentReference: data.paymentReference?.trim() || null,
      });

      const payload = {
        trip_id: data.tripId ?? null,
        trip_number: data.tripNumber ?? null,
        party_name: resolvedPartyName,
        description,
        amount_in: data.type === "in" ? data.amount : 0,
        amount_out: data.type === "out" ? data.amount : 0,
        transaction_date: transactionDate,
        contact_id: resolvedContactId,
        contact_type: resolvedContactType,
        indent_id: data.indentId ?? null,
        vehicle_number: data.vehicleNumber ?? null,
        driver_name: resolvedContactType === "driver" ? (data.driverName ?? null) : null,
        ...(qUnifiedPassthroughLedgerTripCreate && !options?.entryId
          ? { ledgerWritePassthroughTripContext: true as const }
          : {}),
      };

      const doCreate = options?.entryId
        ? updateLedgerEntry(orgId, options.entryId, payload)
        : createLedgerEntry(orgId, payload);

      const { error } = await doCreate;
      if (error) {
        Alert.alert(t("error"), error.message);
        return;
      }

      void queryClient.invalidateQueries({ queryKey: queryKeys.transactions.all(orgId) });
      const refreshTripId = payload.trip_id ?? params.tripId ?? null;
      if (refreshTripId) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.trips.detail(refreshTripId) });
      }
      if (resolvedContactId && orgId) {
        if (resolvedContactType === "client") {
          void queryClient.invalidateQueries({
            queryKey: queryKeys.clients.detail(orgId, resolvedContactId),
          });
        } else if (resolvedContactType === "supplier") {
          void queryClient.invalidateQueries({
            queryKey: queryKeys.suppliers.detail(orgId, resolvedContactId),
          });
        } else if (resolvedContactType === "driver") {
          void queryClient.invalidateQueries({
            queryKey: queryKeys.drivers.detail(orgId, resolvedContactId),
          });
        }
      }

      if (
        !options?.entryId &&
        data.contactType === "driver" &&
        data.type === "out" &&
        data.driverPaymentType &&
        data.contactId
      ) {
        // Trip-based settlements are stored as "fleet pending" until the driver verifies.
        // This avoids instantly increasing driver's cash/balance from org entries.
        const baseDriverLedgerType = data.driverPaymentType === "bonus" ? "adjustment" : data.driverPaymentType;
        const shouldCreateFleetPending =
          data.driverPaymentType === "settlement" && data.tripId !== undefined && data.tripId !== null;

        const driverLedgerType = shouldCreateFleetPending ? "adjustment" : baseDriverLedgerType;
        await createDriverLedgerEntry(orgId, data.contactId, data.amount, driverLedgerType, {
          tripId: data.tripId ?? null,
          createdBy: profile?.uid ?? null,
          // Reuse the same description parts used for the finance ledger entry
          // (e.g. includes Mode + UTR when available) so driver wallet can show
          // correct payment pills on both the "pending verification" and "settled" views.
          description: (() => {
            const baseDescription = payload.description ?? (typeof driverPaymentLabel === "string" ? driverPaymentLabel : null);
            if (!shouldCreateFleetPending) return baseDescription;
            // Token used by the driver app to detect "fleet marked paid (awaiting verification)" entries.
            return baseDescription ? `${baseDescription} | Sync: FLEET_PAID_PENDING` : "Sync: FLEET_PAID_PENDING";
          })(),
        });
      }

      }

      if (params.salaryRequestId) {
        await updateSalaryRequestStatus(params.salaryRequestId, "paid");
      }

      // Navigate back to the detail page that opened add-entry so user sees updated data (avoid landing on Ops Agent tab).
      if (params.tripId && params.returnTo === "trip-ledger") {
        const q = new URLSearchParams();
        if (params.entityType) q.set("entityType", params.entityType);
        if (params.entityId) q.set("entityId", params.entityId);
        if (params.partyName) q.set("partyName", params.partyName);
        const query = q.toString();
        router.replace(
          query ? `/trip-ledger/${params.tripId}?${query}` : `/trip-ledger/${params.tripId}`,
        );
      } else if (params.tripId) {
        router.replace(`/trip/${params.tripId}`);
      } else if (params.entityType && params.entityId) {
        switch (params.entityType) {
          case "CLIENT":
            router.replace(`/client/${params.entityId}`);
            break;
          case "SUPPLIER":
            router.replace(`/supplier/${params.entityId}`);
            break;
          case "DRIVER":
            router.replace(`/driver/${params.entityId}`);
            break;
          case "VEHICLE":
            router.replace(`/vehicle/${params.entityId}`);
            break;
          default:
            router.replace(ROUTES.TABS.FINANCE as '/');
        }
      } else {
        // No context (e.g. opened from table view or generic add): go to the detail page where the entry is visible (trip or entity).
        const tripNavId = data.tripAllocations?.[0]?.tripId ?? data.tripId;
        if (tripNavId) {
          router.replace(`/trip/${tripNavId}`);
          return;
        }
        const partyId = data.partyId ?? null;
        const contactType = data.contactType ?? null;
        if (partyId && partyId !== "misc") {
          if (contactType === "client") {
            router.replace(`/client/${partyId}`);
            return;
          }
          if (contactType === "supplier") {
            router.replace(`/supplier/${partyId}`);
            return;
          }
          if (contactType === "driver") {
            const driverId = partyId === "driver-salary" ? (data.contactId ?? partyId) : partyId;
            if (driverId) router.replace(`/driver/${driverId}`);
            return;
          }
        }
        router.replace(ROUTES.TABS.FINANCE as '/');
      }
    },
    [
      orgId,
      queryClient,
      editingEntry?.transaction_date,
      profile?.uid,
      router,
      params.tripId,
      params.entityType,
      params.entityId,
      params.returnTo,
      params.partyName,
      trips,
      clients,
      suppliers,
      drivers,
      uniqueLinkedClientIdByOrgId,
      uniqueLinkedSupplierIdByOrgId,
      params.partyContext,
      params.partyId,
      params.salaryRequestId,
      t,
      tripDueMetaById,
      qUnifiedPassthroughLedgerTripCreate,
    ]
  );

  const handleClose = useCallback(() => {
    safeBack();
  }, [safeBack]);

  const partyContext =
    params.partyContext === "customers"
      ? "customers"
      : params.partyContext === "suppliers"
        ? "suppliers"
        : "all";

  const resolvedEntityPartyName = useMemo(() => {
    const rawName = (params.partyName ?? "").trim();
    const normalized = rawName.toLowerCase();
    const isGeneric =
      normalized === "" ||
      normalized === "supplier" ||
      normalized === "client" ||
      normalized === "driver" ||
      normalized === "entry";
    if (!isGeneric) return rawName;

    const candidateId = params.partyId ?? params.entityId ?? null;
    if (!candidateId) return rawName || null;
    if (params.entityType === "SUPPLIER") {
      const supplier = suppliers.find((s) => s.id === candidateId);
      return (
        getSupplierDisplayName(supplier, "") ||
        rawName ||
        null
      );
    }
    if (params.entityType === "CLIENT") {
      const row = clients.find((c) => c.id === candidateId);
      return row?.name?.trim() || row?.contact_person?.trim() || rawName || null;
    }
    if (params.entityType === "DRIVER") {
      return (
        drivers.find((d) => d.id === candidateId)?.name?.trim() ||
        rawName ||
        null
      );
    }
    return rawName || null;
  }, [
    params.partyName,
    params.partyId,
    params.entityId,
    params.entityType,
    suppliers,
    clients,
    drivers,
  ]);

  const tripById = useMemo(() => {
    const m = new Map<string, TripOptionWithOrg>();
    for (const t of trips) m.set(t.id, t);
    return m;
  }, [trips]);

  const inferredSupplierFromTrip = useMemo(() => {
    const tripId = params.tripId ?? null;
    if (!tripId) return { id: null as string | null, name: null as string | null };
    const trip = tripById.get(tripId);
    if (!trip) return { id: null as string | null, name: null as string | null };

    const tripSupplierId = (trip.supplier_id ?? "").trim() || null;
    const byTripId = tripSupplierId
      ? suppliers.find((s) => s.id === tripSupplierId)
      : null;
    if (byTripId) {
      return { id: byTripId.id, name: getSupplierDisplayName(byTripId, "") || null };
    }

    // Cross-org integrated fallback: trip owner org -> unique linked local supplier.
    const linkedLocalSupplierId =
      trip.organization_id != null
        ? uniqueLinkedSupplierIdByOrgId.get(trip.organization_id) ?? null
        : null;
    const byLinkedOrg = linkedLocalSupplierId
      ? suppliers.find((s) => s.id === linkedLocalSupplierId)
      : null;
    if (byLinkedOrg) {
      return {
        id: byLinkedOrg.id,
        name: getSupplierDisplayName(byLinkedOrg, "") || null,
      };
    }

    const tripSupplierName = (trip.supplier_name ?? "").trim() || null;
    return { id: tripSupplierId, name: tripSupplierName };
  }, [params.tripId, tripById, suppliers, uniqueLinkedSupplierIdByOrgId]);

  const genericPartyName = useMemo(() => {
    const raw = (params.partyName ?? "").trim().toLowerCase();
    return raw === "" || raw === "supplier" || raw === "client" || raw === "driver";
  }, [params.partyName]);

  const resolvedModalPartyName = useMemo(() => {
    const base = (resolvedEntityPartyName ?? "").trim();
    if (base && base.toLowerCase() !== "supplier") return base;
    if (inferredSupplierFromTrip.name?.trim()) return inferredSupplierFromTrip.name.trim();
    if (!genericPartyName && (params.partyName ?? "").trim()) return (params.partyName ?? "").trim();
    return base || (params.partyName ?? "").trim() || null;
  }, [
    resolvedEntityPartyName,
    inferredSupplierFromTrip.name,
    genericPartyName,
    params.partyName,
  ]);

  if (loading || !orgId) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose} style={styles.backBtn} hitSlop={8}>
            <FontAwesome name="chevron-left" size={18} color={Theme.textPrimaryDark} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t("ledgerSync")}</Text>
        </View>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Theme.primary} />
        </View>
      </View>
    );
  }

  /** When opened from entity detail, party is fixed (customer/supplier/driver) or context is vehicle; show in header. */
  const isFromDetail = Boolean(params.entityType && params.entityId);
  const entryContextLabel = isFromDetail ? (resolvedEntityPartyName || t("entry")) : null;

  /** Vehicle add-entry: use AddVehicleEntryModal (no vehicle logic in AddTransactionModal). */
  if (params.entityType === "VEHICLE" && params.entityId) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose} style={styles.backBtn} hitSlop={8} accessibilityLabel={t("back")}>
            <FontAwesome name="chevron-left" size={18} color={Theme.textPrimaryDark} />
          </TouchableOpacity>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle}>{t("addEntry")}</Text>
            {entryContextLabel ? (
              <Text style={styles.headerSubtitle} numberOfLines={1}>{entryContextLabel}</Text>
            ) : null}
          </View>
        </View>
        <AddVehicleEntryModal
          visible
          fullPage
          onClose={handleClose}
          onSubmit={handleVehicleEntrySubmit}
          vehicleNumber={vehicleNumber}
          entryContextLabel={entryContextLabel ?? undefined}
          trips={vehicleTripOptions}
          drivers={drivers}
          initialTripId={params.tripId ?? undefined}
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleClose} style={styles.backBtn} hitSlop={8} accessibilityLabel={t("back")}>
          <FontAwesome name="chevron-left" size={18} color={Theme.textPrimaryDark} />
        </TouchableOpacity>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle}>{entryContextLabel ? t("addEntry") : t("ledgerSync")}</Text>
          {entryContextLabel ? (
            <Text style={styles.headerSubtitle} numberOfLines={1}>{entryContextLabel}</Text>
          ) : null}
        </View>
      </View>
      <AddTransactionModal
        visible
        fullPage
        onClose={handleClose}
        onSubmit={handleSubmit}
        clients={clientPartyOptions}
        suppliers={supplierPartyOptions}
        drivers={drivers}
        vehicles={vehicles}
        trips={filteredTrips}
        supplierLinkedOrgIds={supplierLinkedOrgIds}
        linkedClientIdByOrgId={uniqueLinkedClientIdByOrgId}
        linkedSupplierIdByOrgId={uniqueLinkedSupplierIdByOrgId}
        viewerOrgId={orgId}
        partyContext={partyContext}
        defaultPartyId={params.partyId ?? inferredSupplierFromTrip.id ?? undefined}
        defaultPartyName={resolvedModalPartyName ?? undefined}
        lockedPartyId={
          params.entityType === "CLIENT" || params.entityType === "SUPPLIER" || params.entityType === "DRIVER"
            ? (params.entityId ?? params.partyId ?? inferredSupplierFromTrip.id ?? undefined)
            : undefined
        }
        lockedPartyName={
          params.entityType === "CLIENT" || params.entityType === "SUPPLIER" || params.entityType === "DRIVER"
            ? (resolvedModalPartyName ?? undefined)
            : undefined
        }
        initialEntry={editingEntry}
        entryContextLabel={entryContextLabel ?? undefined}
        lockedAmount={
          params.salaryAmount != null ? (parseFloat(params.salaryAmount) || undefined) : undefined
        }
        salaryAmount={
          params.entityId && params.entityType === "DRIVER"
            ? (params.salaryAmount != null
                ? (parseFloat(params.salaryAmount) || null)
                : driverOffers[params.entityId]?.payableAmount ?? null)
            : undefined
        }
        defaultDriverPaymentType={
          params.entityType === "DRIVER" && params.defaultDriverPaymentType
            ? (params.defaultDriverPaymentType as "advance" | "settlement")
            : undefined
        }
        defaultType={
          (params.defaultType ?? (partyContext === "customers" ? "in" : undefined)) as
            | "in"
            | "out"
            | undefined
        }
        defaultTripId={params.tripId ?? undefined}
        tripLocked={params.tripId != null}
        lockedTripDisplay={params.tripNumber ?? undefined}
        requireTripForSupplierOut
        dueAmountIn={effectiveDueAmountIn}
        dueAmountOut={effectiveDueAmountOut}
        ledgerTransactions={transactions}
        driverOffersByDriverId={driverOffers}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.surface,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.06)",
    backgroundColor: Theme.screenBackground,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
    backgroundColor: Theme.surface,
  },
  headerTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 12,
    color: Theme.textSecondary,
    marginTop: 3,
    fontWeight: "500",
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
});
