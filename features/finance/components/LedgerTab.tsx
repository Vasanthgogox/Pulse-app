/**
 * Treasury Financial Summary — Ledger tab. Table view (default) or Transaction view (GPay-style).
 * When transactions prop is provided, uses it (single read from parent); otherwise uses TanStack Query cache.
 */
import { ALL_LEDGER_CATEGORY_VALUES } from "@/components/AddTransactionModal";
import Theme from "@/constants/Theme";
import { useLanguage } from "@/contexts/LanguageContext";
import { formatIndianVehicleNumber } from "@/lib/format";
import { useTransactionsQuery } from "@/lib/queries";
import { EntityIdentityAvatar } from "@/components/EntityIdentityAvatar";
import {
  type LedgerIdentityContext,
  resolveLedgerRowPartyIdentity,
} from "@/lib/entityIdentity";
import type { LinkedOrgDisplay } from "@/lib/useLinkedOrgProfileMap";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { getDoubleEntryDisplayLabel } from "../accounting/accountingModel";
import * as financeService from "../services/finance.service";
import { getProfileImage } from "../services/finance.service";
import { resolveAvatarPublicUrl } from "@/lib/avatarUpload";
import { FinancialRow, type FinancialRowData } from "./FinancialRow";
import { FinanceEntryDetailScreen } from "./FinanceEntryDetailScreen";
import { LedgerTransactionListView } from "./LedgerTransactionListView";
import type { ClientRow } from "@/features/clients/services/clients.service";
import type { DriverRow } from "@/features/drivers/services/drivers.service";
import type { SupplierRow } from "@/features/suppliers/services/suppliers.service";
import {
  getDisputesForPartner,
  getDisputesReceived,
} from "@/services/sharedLedgerService";


export type LedgerViewMode = "table" | "transaction";

function isPlaceholderLedgerPartyName(name: string | null | undefined): boolean {
  const n = (name ?? "").trim().toLowerCase();
  if (!n || n === "—" || n === "-") return true;
  return (
    n === "supplier" ||
    n === "client" ||
    n === "driver" ||
    n === "unknown client" ||
    n === "misc / unlinked" ||
    n.startsWith("misc /")
  );
}

export interface LedgerTabProps {
  organizationId: string | null;
  /** Optional. When omitted, Ledger is view-only (no add CTA). Add entries from Customers/Suppliers/Drivers tabs. */
  onAddTransactionPress?: () => void;
  refreshKey?: number;
  /** When provided, use these instead of fetching (parent controls single read + period filter). */
  transactions?: financeService.LedgerRow[] | null;
  /** When provided, ledger rows are tappable; called with row data (e.g. navigate to trip when data.tripId is set). Ledger rows do not open edit; use chevron to expand trip/collection details. */
  onRowSelect?: (data: FinancialRowData) => void;
  /** When provided, tapping the entity (party name) cell filters the ledger to that party. Called with party name. */
  onEntitySelect?: (partyName: string) => void;
  /** When provided, resolve vehicle number for a trip (e.g. for vehicle cash-out display when not stored in DB). */
  getVehicleNumberForTripId?: (tripId: string | null) => string | null;
  /** Ledger SOURCE column: trip options for dropdown (link entry to trip). */
  tripOptions?: {
    id: string;
    trip_number: string;
    route?: string | null;
    trip_date?: string | null;
    vehicle_number?: string | null;
  }[];
  /** Map trip_id -> detail to show in table when a trip is selected. */
  tripDetailsMap?: Record<
    string,
    {
      trip_number: string;
      drop_location?: string;
      pickup_area?: string;
      client_name?: string;
      pickup_date?: string | null;
      vehicle_number?: string | null;
      client_price?: number | null;
      supplier_rate?: number | null;
      driver_commission?: number | null;
      supplier_id?: string | null;
      supplier_display_name?: string | null;
    }
  >;
  /** When provided, changing trip in SOURCE dropdown updates the entry and refreshes. */
  onMissionChange?: (entryId: string, tripId: string) => void;
  /** View mode: table (default) or transaction (GPay-style list). */
  viewMode?: LedgerViewMode;
  onViewModeChange?: (mode: LedgerViewMode) => void;
  /** When false, hide TRANSACTION | TABLE | ANALYTICS sub-tabs (e.g. main Finance Cash tab). */
  showFiscalSubTabs?: boolean;
  clientRows?: ClientRow[];
  supplierRows?: SupplierRow[];
  tripPartyMap?: Record<
    string,
    {
      client_id?: string | null;
      supplier_id?: string | null;
      driver_id?: string | null;
    }
  >;
  /** Fleet drivers for cash tab avatars (storage path / seed + optional signed URLs). */
  driverRows?: DriverRow[];
  /** Resolved driver image URLs by id (e.g. from FinanceScreen); merged with in-tab fetch. */
  driverProfileImageUrls?: Record<string, string>;
  /** Linked-org branding (`logo`/seed) by connected partner org id. */
  linkedOrgDisplayMap?: Record<string, LinkedOrgDisplay>;
}

export function LedgerTab({
  organizationId,
  onAddTransactionPress,
  refreshKey = 0,
  transactions: transactionsProp,
  onRowSelect,
  onEntitySelect,
  getVehicleNumberForTripId,
  tripOptions = [],
  tripDetailsMap = {},
  onMissionChange,
  viewMode: viewModeProp,
  showFiscalSubTabs = true,
  clientRows = [],
  supplierRows = [],
  tripPartyMap = {},
  driverRows = [],
  driverProfileImageUrls = {},
  linkedOrgDisplayMap = {},
}: LedgerTabProps) {
  const { t } = useLanguage();
  const router = useRouter();
  const isViewOnly = onAddTransactionPress === undefined;
  const isControlled = transactionsProp !== undefined;
  const [expandedLedgerRowId, setExpandedLedgerRowId] = useState<string | null>(null);
  const [profileImages, setProfileImages] = useState<Record<string, string>>({});
  const viewMode = viewModeProp ?? "table";

  const clientById = new Map(clientRows.map(c => [c.id, c]));
  const supplierById = new Map(supplierRows.map(s => [s.id, s]));
  const driverById = useMemo(
    () => new Map(driverRows.map((d) => [d.id, d])),
    [driverRows],
  );

  /**
   * Stable serialized key of connected partner org ids (both sides).
   * Prevents re-fetch on every render when parent creates new array refs.
   */
  const partnerOrgIdsKey = useMemo(() => {
    const set = new Set<string>();
    clientRows.forEach((c) => {
      if (c.linked_organization_id) set.add(c.linked_organization_id);
    });
    supplierRows.forEach((s) => {
      if (s.linked_organization_id) set.add(s.linked_organization_id);
    });
    return Array.from(set).sort().join("|");
  }, [clientRows, supplierRows]);

  /** Disputes keyed by trip_id. Fetched in bulk for all connected partners this user has. */
  const [disputesByTripId, setDisputesByTripId] = useState<
    Record<string, { status: "OPEN" | "RESOLVED"; direction: "RAISED_BY_US" | "RECEIVED" }>
  >({});
  const [selectedDetailData, setSelectedDetailData] = useState<FinancialRowData | null>(
    null,
  );
  useEffect(() => {
    if (!organizationId) {
      setDisputesByTripId({});
      return;
    }
    const partnerOrgIds = partnerOrgIdsKey ? partnerOrgIdsKey.split("|") : [];
    let cancelled = false;
    void (async () => {
      const map: Record<
        string,
        { status: "OPEN" | "RESOLVED"; direction: "RAISED_BY_US" | "RECEIVED" }
      > = {};
      try {
        const raisedResults = await Promise.all(
          partnerOrgIds.map((pid) =>
            getDisputesForPartner(organizationId, pid).then((r) => r.disputes ?? []),
          ),
        );
        raisedResults.flat().forEach((d) => {
          if (d.status === "OPEN" && d.transaction_id) {
            map[d.transaction_id] = { status: "OPEN", direction: "RAISED_BY_US" };
          }
        });
        const { disputes: received } = await getDisputesReceived(organizationId);
        (received ?? []).forEach((d) => {
          if (d.status === "OPEN" && d.transaction_id && !map[d.transaction_id]) {
            map[d.transaction_id] = { status: "OPEN", direction: "RECEIVED" };
          }
        });
      } catch {
        // Best-effort: dispute chips simply won't appear if fetch fails.
      }
      if (!cancelled) setDisputesByTripId(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [organizationId, partnerOrgIdsKey, refreshKey]);

  const getResolvedPartyName = (row: financeService.LedgerRow): string => {
    const contactType = row.contact_type;
    const tripId = row.trip_id;
    
    if (contactType === 'client' && row.contact_id) {
      return clientById.get(row.contact_id)?.name || row.party_name || "—";
    }
    if (contactType === 'supplier' && row.contact_id) {
      const direct = supplierById.get(row.contact_id)?.name;
      if (direct) return direct;
      if (tripId && tripPartyMap[tripId]?.supplier_id) {
        const viaTrip = supplierById.get(tripPartyMap[tripId]!.supplier_id!)?.name;
        if (viaTrip) return viaTrip;
      }
      const detailNm =
        tripId && tripDetailsMap[tripId]?.supplier_display_name
          ? tripDetailsMap[tripId]!.supplier_display_name!.trim()
          : "";
      if (detailNm) return detailNm;
      const pn = row.party_name;
      if (pn && !isPlaceholderLedgerPartyName(pn)) return pn;
      return "—";
    }
    if (contactType === 'driver') {
      return row.driver_name || row.party_name || "—";
    }

    if (tripId && tripPartyMap[tripId]) {
      const pm = tripPartyMap[tripId];
      if (row.amount_in && pm.client_id) {
        return clientById.get(pm.client_id)?.name || row.party_name || "—";
      }
      if (row.amount_out && pm.supplier_id) {
        const nm = supplierById.get(pm.supplier_id)?.name;
        if (nm) return nm;
      }
    }

    if (tripId && tripDetailsMap[tripId]) {
      const d = tripDetailsMap[tripId];
      if ((row.amount_out ?? 0) > 0 && d.supplier_display_name?.trim()) {
        return d.supplier_display_name.trim();
      }
    }

    const fallbackPn = row.party_name;
    if (fallbackPn && !isPlaceholderLedgerPartyName(fallbackPn)) return fallbackPn;
    return "—";
  };

  const {
    data: cachedTransactions = [],
    isPending: queryLoading,
    refetch,
  } = useTransactionsQuery(isControlled ? null : organizationId);

  useEffect(() => {
    if (isControlled || !organizationId) return;
    refetch();
  }, [refreshKey, isControlled, organizationId, refetch]);

  const rows = isControlled ? (transactionsProp ?? []) : cachedTransactions;
  const loading = isControlled ? false : queryLoading;

  /** Transaction list (mobile / timeline) reads party_name directly; mirror web-resolved supplier/client labels. */
  const transactionListRows = useMemo(
    () =>
      rows.map((r) => ({
        ...r,
        party_name: getResolvedPartyName(r),
      })),
    [rows, clientRows, supplierRows, tripPartyMap, tripDetailsMap],
  );

  useEffect(() => {
    // Only drivers need async fetching (clients/suppliers resolve from already-fetched rows synchronously).
    const fetchDriverProfileImages = async () => {
      const newProfileImages: Record<string, string> = {};
      for (const row of rows) {
        const contactId = row.contact_id;
        if (contactId && row.contact_type === 'driver' && !profileImages[contactId] && !driverProfileImageUrls[contactId]) {
          const imageUrl = await getProfileImage(contactId, 'driver');
          if (imageUrl) {
            newProfileImages[contactId] = imageUrl;
          }
        }
      }
      if (Object.keys(newProfileImages).length > 0) {
        setProfileImages((prev) => ({ ...prev, ...newProfileImages }));
      }
    };
    fetchDriverProfileImages();
  }, [rows, driverProfileImageUrls]);

  // Truck-related expense: contact_id/contact_type NULL; entity = vehicle_number (from row or trip) or party_name; LINK = route + vehicle badge only when trip.vehicle_id set. See docs/LEDGER_TRUCK_EXPENSE_AND_TRIP_DISPLAY.md for NULL handling (trip_id null, trip not in map, vehicle_id null).

  if (loading && rows.length === 0) {
    return <Text style={styles.loading}>{t("loading")}</Text>;
  }
  if (rows.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyText}>
          {isViewOnly
            ? t("noLedgerEntriesAddFromDetail")
            : t("noLedgerEntriesYet")}
        </Text>
        {!isViewOnly && onAddTransactionPress && (
          <TouchableOpacity
            style={styles.emptyStateAddBtn}
            onPress={onAddTransactionPress}
            activeOpacity={0.8}
          >
            <Text style={styles.emptyStateAddBtnText}>{t("addEntry")}</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  const tripOptionIds = new Set((tripOptions ?? []).map((t) => t.id));

  /** Entry date for kahta-style: show when the money came in or went out (e.g. "5 Mar 2025"). */
  function formatEntryDate(iso: string | undefined | null): string {
    if (!iso) return "—";
    try {
      const s = iso.slice(0, 10);
      const [y, m, day] = s.split("-");
      const monthNames = [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
      ];
      const mi = parseInt(m ?? "0", 10) - 1;
      return mi >= 0 && mi < 12 ? `${day} ${monthNames[mi]} ${y}` : s;
    } catch {
      return iso.slice(0, 10);
    }
  }

  function formatRoute(
    d:
      | {
          drop_location?: string;
          pickup_area?: string;
          client_name?: string;
          pickup_date?: string | null;
        }
      | undefined,
  ): string | null {
    if (!d) return null;
    if (d.pickup_area && d.drop_location)
      return `${d.pickup_area} → ${d.drop_location}`;
    if (d.drop_location) return d.drop_location;
    if (d.client_name) return d.client_name;
    if (d.pickup_date) {
      try {
        const [, m, day] = d.pickup_date.split("-");
        const monthNames = [
          "Jan",
          "Feb",
          "Mar",
          "Apr",
          "May",
          "Jun",
          "Jul",
          "Aug",
          "Sep",
          "Oct",
          "Nov",
          "Dec",
        ];
        const mi = parseInt(m, 10) - 1;
        return mi >= 0 && mi < 12 ? `${day} ${monthNames[mi]}` : d.pickup_date;
      } catch {
        return d.pickup_date;
      }
    }
    return null;
  }

  function formatTripDateForDisplay(
    iso: string | null | undefined,
  ): string | null {
    if (!iso || typeof iso !== "string") return null;
    try {
      const s = iso.slice(0, 10);
      const [y, m, day] = s.split("-");
      const monthNames = [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
      ];
      const mi = parseInt(m ?? "0", 10) - 1;
      return mi >= 0 && mi < 12 ? `${day} ${monthNames[mi]} ${y}` : s;
    } catch {
      return iso.slice(0, 10);
    }
  }

  /** Build FinancialRowData for a ledger row (same shape as table row expand). */
  function buildFinancialRowDataForRow(
    row: financeService.LedgerRow,
  ): FinancialRowData {
    const isDriverPayment =
      row.contact_type === "driver" ||
      (row.driver_name ?? "").trim() !== "";
    const isClientOrSupplier =
      row.contact_type === "client" || row.contact_type === "supplier";
    const vehicleNum =
      row.vehicle_number ??
      (row.trip_id != null && !isDriverPayment
        ? (getVehicleNumberForTripId?.(row.trip_id) ?? null)
        : null);
    const entityName = getResolvedPartyName(row);
    const tripDetail =
      row.trip_id != null && tripDetailsMap[row.trip_id]
        ? tripDetailsMap[row.trip_id]
        : null;
    const tripPaymentSummary =
      row.trip_id != null
        ? (() => {
            const sameTrip = rows.filter(
              (r) => r.trip_id != null && r.trip_id === row.trip_id,
            );
            return {
              received: sameTrip.reduce((s, r) => s + (r.amount_in ?? 0), 0),
              paid: sameTrip.reduce((s, r) => s + (r.amount_out ?? 0), 0),
              entryCount: sameTrip.length,
            };
          })()
        : undefined;
    const sameTripTransactions =
      row.trip_id != null
        ? rows
            .filter(
              (r) => r.trip_id != null && r.trip_id === row.trip_id,
            )
            .map((r) => {
              const isDr =
                r.contact_type === "driver" ||
                (r.driver_name ?? "").trim() !== "";
              const isCS =
                r.contact_type === "client" || r.contact_type === "supplier";
              const vn =
                r.vehicle_number ??
                (r.trip_id && !isDr
                  ? (getVehicleNumberForTripId?.(r.trip_id) ?? null)
                  : null);
              const party = getResolvedPartyName(r);
              return {
                id: r.id,
                date: formatEntryDate(r.transaction_date),
                typeLabel: getDoubleEntryDisplayLabel(r) ?? "—",
                in: r.amount_in ?? 0,
                out: r.amount_out ?? 0,
                party,
              };
            })
        : undefined;

    let derivedPartyType = row.contact_type;
    if (!derivedPartyType && row.trip_id && tripPartyMap[row.trip_id]) {
      const pm = tripPartyMap[row.trip_id];
      if (row.amount_in && pm.client_id) derivedPartyType = 'client';
      if (row.amount_out && pm.supplier_id) derivedPartyType = 'supplier';
    }

    const ledgerPartyType =
      derivedPartyType === "client"
        ? "client"
        : derivedPartyType === "supplier"
          ? "supplier"
          : isDriverPayment
            ? "driver"
            : "vehicle";

    let profileImageUrl: string | null = null;
    let avatarSeedForRow: string | null | undefined = undefined;
    let organizationImageUrl: string | null = null;
    let organizationAvatarSeed: string | null = null;

    let counterpartyIntegrated: boolean | null = null;
    let counterpartyId: string | null = null;

    if (ledgerPartyType === "client") {
      counterpartyId =
        row.contact_id ??
        (row.trip_id ? tripPartyMap[row.trip_id]?.client_id ?? null : null);
      const client = counterpartyId ? clientById.get(counterpartyId) ?? null : null;
      counterpartyIntegrated = client
        ? Boolean(client.is_integrated || client.linked_organization_id)
        : false;
      if (client) {
        const oid = (client.linked_organization_id ?? "").trim();
        if (oid && linkedOrgDisplayMap[oid]) {
          organizationImageUrl =
            (linkedOrgDisplayMap[oid].avatarUrl ?? "").trim() || null;
          organizationAvatarSeed =
            (linkedOrgDisplayMap[oid].avatarSeed ?? "").trim() || null;
        }
        const cid = (row.contact_id ?? "").trim();
        profileImageUrl =
          resolveAvatarPublicUrl(client.avatar_url) ??
          (cid ? profileImages[cid] ?? null : null);
        const s = (client.avatar_seed ?? "").trim();
        avatarSeedForRow = s || undefined;
      } else if (row.contact_id) {
        profileImageUrl = profileImages[row.contact_id] ?? null;
      }
    } else if (ledgerPartyType === "supplier") {
      counterpartyId =
        row.contact_id ??
        (row.trip_id ? tripPartyMap[row.trip_id]?.supplier_id ?? null : null);
      const supplier = counterpartyId ? supplierById.get(counterpartyId) ?? null : null;
      counterpartyIntegrated = supplier
        ? Boolean(
            supplier.linked_organization_id ||
              (supplier as { supplier_type?: string | null })
                .supplier_type === "integrated",
          )
        : false;
      if (supplier) {
        const oid = (supplier.linked_organization_id ?? "").trim();
        if (oid && linkedOrgDisplayMap[oid]) {
          organizationImageUrl =
            (linkedOrgDisplayMap[oid].avatarUrl ?? "").trim() || null;
          organizationAvatarSeed =
            (linkedOrgDisplayMap[oid].avatarSeed ?? "").trim() || null;
        }
        const cid = (row.contact_id ?? "").trim();
        profileImageUrl =
          resolveAvatarPublicUrl(supplier.avatar_url) ??
          (cid ? profileImages[cid] ?? null : null);
        const s = (supplier.avatar_seed ?? "").trim();
        avatarSeedForRow = s || undefined;
      } else if (row.contact_id) {
        profileImageUrl = profileImages[row.contact_id] ?? null;
      }
    } else if (ledgerPartyType === "driver") {
      if (row.contact_id) {
        const drv = driverById.get(row.contact_id);
        profileImageUrl =
          (drv?.avatar_url ?? "").trim() ||
          driverProfileImageUrls[row.contact_id] ||
          profileImages[row.contact_id] ||
          null;
        const s = (drv?.avatar_seed ?? "").trim();
        avatarSeedForRow = s || undefined;
      }
    } else if (row.contact_id) {
      profileImageUrl = profileImages[row.contact_id] ?? null;
    }
    const categoryBase = row.primary_category ?? row.description ?? "";
    const categoryLabel = ALL_LEDGER_CATEGORY_VALUES.includes(categoryBase)
      ? categoryBase
      : "GENERAL";
    return {
      id: row.id,
      name: entityName,
      subline: "",
      category: categoryLabel,
      desc: row.description,
      tripId: row.trip_id ?? null,
      msn:
        (row.trip_number ?? "").trim() || (row.trip_id ? "Trip" : "General"),
      tripDetail: tripDetail ?? undefined,
      vehicleNumber: isDriverPayment ? null : vehicleNum,
      driverName: row.driver_name ?? undefined,
      ledgerPartyType,
      in: row.amount_in ?? 0,
      out: row.amount_out ?? 0,
      transaction_date: row.transaction_date,
      transactionTypeLabel: getDoubleEntryDisplayLabel(row) ?? undefined,
      tripPaymentSummary: tripPaymentSummary ?? undefined,
      sameTripTransactions: sameTripTransactions ?? undefined,
      profileImageUrl: profileImageUrl,
      avatarSeed: avatarSeedForRow,
      organizationImageUrl,
      organizationAvatarSeed,
      paymentMode: row.payment_mode ?? undefined,
      paymentReference: row.payment_reference ?? undefined,
      reconciliationStatus: row.reconciliation_status ?? undefined,
      reconciliationLabel: row.reconciliation_label ?? undefined,
      reconciliationActionLabel: row.reconciliation_action_label ?? undefined,
      reconciliationHelperText: row.reconciliation_helper_text ?? undefined,
      counterpartyIntegrated,
      counterpartyId,
      disputeStatus: row.trip_id && disputesByTripId[row.trip_id]
        ? disputesByTripId[row.trip_id].status
        : null,
      disputeDirection: row.trip_id && disputesByTripId[row.trip_id]
        ? disputesByTripId[row.trip_id].direction
        : null,
    };
  }

  function openLedgerDetail(row: financeService.LedgerRow) {
    const rowData = buildFinancialRowDataForRow(row);
    setSelectedDetailData(rowData);
  }

  const expandedRow =
    viewMode === "transaction" && expandedLedgerRowId != null
      ? transactionListRows.find((r) => r.id === expandedLedgerRowId) ?? null
      : null;
  const expandedRowData =
    expandedRow != null ? buildFinancialRowDataForRow(expandedRow) : null;

  const transactionContent = (
    <LedgerTransactionListView
      transactions={transactionListRows}
      onRowPress={(id) => {
        setExpandedLedgerRowId((prev) => (prev === id ? null : id));
      }}
      expandedRowId={expandedLedgerRowId}
      expandedRowData={expandedRowData}
      highlightId={expandedLedgerRowId}
      showTitle={false}
      showHistoryHeader={true}
      showGridFooter={true}
      showFiscalSubTabs={showFiscalSubTabs}
      useTimelineLayout={true}
      onAddTransactionPress={onAddTransactionPress}
      tripDetailsMap={tripDetailsMap}
      tripOptions={tripOptions}
      onMissionChange={onMissionChange}
      fullWidth
      renderPartyAvatar={(row) => {
        const name = getResolvedPartyName(row);
        const ctx: LedgerIdentityContext = {
          clientById,
          supplierById,
          driverById,
          linkedOrgDisplayMap,
          profileImages,
          driverProfileImageUrls,
          tripPartyMap,
          partyDisplayName: name,
        };
        const identity = resolveLedgerRowPartyIdentity(row, ctx);
        if (!identity) return null;
        return (
          <EntityIdentityAvatar identity={identity} size="md" showIntegrationBadge />
        );
      }}
      driverRows={driverRows}
      driverProfileImageUrls={{
        ...driverProfileImageUrls,
        ...profileImages,
      }}
    />
  );

  return (
    <>
      {viewMode === "transaction" ? (
        <View style={styles.ledgerWrap}>
          {transactionContent}
        </View>
      ) : (
      rows.map((row) => {
        const categoryBase = row.primary_category ?? row.description ?? "";
        const categoryLabel = ALL_LEDGER_CATEGORY_VALUES.includes(categoryBase)
          ? categoryBase
          : "GENERAL";
        const isDriverPayment =
          row.contact_type === "driver" ||
          (row.driver_name ?? "").trim() !== "";
        const isClientOrSupplier =
          row.contact_type === "client" || row.contact_type === "supplier";
        const vehicleNum =
          row.vehicle_number ??
          (row.trip_id != null && !isDriverPayment
            ? (getVehicleNumberForTripId?.(row.trip_id) ?? null)
            : null);
        // Party column: show person name for client/supplier/driver; show vehicle only for vehicle expense (no contact).
        const entityName = getResolvedPartyName(row);
        const tripDisplay = (row.trip_number ?? "").trim() || null;
        const entryDateStr = formatEntryDate(row.transaction_date);
        const restSublineDriver =
          isDriverPayment && tripDisplay
            ? `${tripDisplay} · ${categoryLabel}`
            : (row.description ?? "");
        const restSublineTrip =
          tripDisplay != null
            ? `${tripDisplay} · ${row.description || categoryLabel}`
            : (row.description ?? "");
        const sublineForDriver =
          entryDateStr === "—"
            ? restSublineDriver
            : restSublineDriver
              ? `${entryDateStr} · ${restSublineDriver}`
              : entryDateStr;
        const sublineWithTrip =
          entryDateStr === "—"
            ? restSublineTrip
            : restSublineTrip
              ? `${entryDateStr} · ${restSublineTrip}`
              : entryDateStr;
        const partyKey = (getResolvedPartyName(row) ?? "").trim().toLowerCase();
        const recommendedTripIds =
          partyKey === ""
            ? []
            : [
                ...new Set(
                  rows
                    .filter(
                      (r) =>
                        (getResolvedPartyName(r) ?? "").trim().toLowerCase() ===
                        partyKey &&
                        r.trip_id != null &&
                        tripOptionIds.has(r.trip_id),
                    )
                    .map((r) => r.trip_id!),
                ),
              ];
        /** Only show associated trips in dropdown (+ current trip if set so selection is visible), with route detail. */
        const tripOptionsForRow =
          recommendedTripIds.length > 0 || row.trip_id != null
            ? tripOptions
                .filter(
                  (t) =>
                    recommendedTripIds.includes(t.id) ||
                    (row.trip_id != null && t.id === row.trip_id),
                )
                .map((t) => {
                  const detail = tripDetailsMap[t.id];
                  return {
                    id: t.id,
                    trip_number: t.trip_number,
                    route: formatRoute(detail),
                    trip_date:
                      (t as { trip_date?: string | null }).trip_date ??
                      (detail?.pickup_date
                        ? formatTripDateForDisplay(detail.pickup_date)
                        : null),
                    vehicle_number:
                      detail?.vehicle_number ??
                      (t as { vehicle_number?: string | null })
                        .vehicle_number ??
                      null,
                  };
                })
            : [];
        const tripDetail =
          row.trip_id != null && tripDetailsMap[row.trip_id]
            ? tripDetailsMap[row.trip_id]
            : null;
        const tripPaymentSummary =
          row.trip_id != null
            ? (() => {
                const sameTrip = rows.filter(
                  (r) => r.trip_id != null && r.trip_id === row.trip_id,
                );
                const received = sameTrip.reduce(
                  (s, r) => s + (r.amount_in ?? 0),
                  0,
                );
                const paid = sameTrip.reduce(
                  (s, r) => s + (r.amount_out ?? 0),
                  0,
                );
                return {
                  received,
                  paid,
                  entryCount: sameTrip.length,
                };
              })()
            : undefined;
        const sameTripTransactions =
          row.trip_id != null
            ? (() => {
                const sameTrip = rows.filter(
                  (r) => r.trip_id != null && r.trip_id === row.trip_id,
                );
                return sameTrip.map((r) => {
                  const isDr =
                    r.contact_type === "driver" ||
                    (r.driver_name ?? "").trim() !== "";
                  const isCS =
                    r.contact_type === "client" ||
                    r.contact_type === "supplier";
                  const vn =
                    r.vehicle_number ??
                    (r.trip_id && !isDr
                      ? (getVehicleNumberForTripId?.(r.trip_id) ?? null)
                      : null);
                  const party = isDr
                    ? r.driver_name || getResolvedPartyName(r) || "—"
                    : isCS
                      ? getResolvedPartyName(r) || "—"
                      : vn
                        ? vn
                        : getResolvedPartyName(r) || "—";
                  return {
                    id: r.id,
                    date: formatEntryDate(r.transaction_date),
                    typeLabel: getDoubleEntryDisplayLabel(r) ?? "—",
                    in: r.amount_in ?? 0,
                    out: r.amount_out ?? 0,
                    party,
                  };
                });
              })()
            : undefined;
        let derivedPartyType = row.contact_type;
        if (!derivedPartyType && row.trip_id && tripPartyMap[row.trip_id]) {
          const pm = tripPartyMap[row.trip_id];
          if (row.amount_in && pm.client_id) derivedPartyType = "client";
          if (row.amount_out && pm.supplier_id) derivedPartyType = "supplier";
        }
        const ledgerPartyType =
          derivedPartyType === "client"
            ? "client"
            : derivedPartyType === "supplier"
              ? "supplier"
              : isDriverPayment
                ? "driver"
                : "vehicle";
        const data: FinancialRowData = {
          id: row.id,
          name: entityName,
          subline: isDriverPayment ? sublineForDriver : sublineWithTrip,
          category: categoryLabel,
          desc: row.description,
          tripId: row.trip_id ?? null,
          msn:
            (row.trip_number ?? "").trim() ||
            (row.trip_id ? "Trip" : "General"),
          tripDetail: tripDetail ?? undefined,
          vehicleNumber: isDriverPayment ? null : vehicleNum,
          driverName: row.driver_name ?? undefined,
          ledgerPartyType,
          in: row.amount_in ?? 0,
          out: row.amount_out ?? 0,
          transaction_date: row.transaction_date,
          transactionTypeLabel: getDoubleEntryDisplayLabel(row) ?? undefined,
          tripPaymentSummary: tripPaymentSummary ?? undefined,
          sameTripTransactions: sameTripTransactions ?? undefined,
          paymentMode: row.payment_mode ?? undefined,
          paymentReference: row.payment_reference ?? undefined,
          reconciliationStatus: row.reconciliation_status ?? undefined,
          reconciliationLabel: row.reconciliation_label ?? undefined,
          reconciliationActionLabel: row.reconciliation_action_label ?? undefined,
          reconciliationHelperText: row.reconciliation_helper_text ?? undefined,
        };
        return (
          <FinancialRow
            key={row.id}
            type="ledger"
            data={data}
            onSelect={() => openLedgerDetail(row)}
            onEntityPress={
              onEntitySelect
                ? () =>
                    onEntitySelect(
                      (data.name || "").trim() ||
                        getResolvedPartyName(row) ||
                        (vehicleNum ?? ""),
                    )
                : undefined
            }
            tripOptions={tripOptionsForRow}
            recommendedTripIds={recommendedTripIds}
            onMissionChange={onMissionChange}
            expandedRowId={null}
            onExpandedChange={undefined}
          />
        );
      })
      )}
      {selectedDetailData && viewMode !== "transaction" ? (
        <View style={styles.inlineReceiptWrap}>
          <FinanceEntryDetailScreen
            data={selectedDetailData}
            onViewTripDetail={() => {
              if (selectedDetailData?.tripId) {
                router.push(`/trip/${selectedDetailData.tripId}` as const);
              }
            }}
            onBack={() => setSelectedDetailData(null)}
            embedded
          />
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  ledgerWrap: { flex: 1, minHeight: 0, backgroundColor: "#FBFBFF" },
  ledgerSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 20,
    backgroundColor: "rgba(255,255,255,0.4)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.05)",
  },
  ledgerSectionTitle: {
    fontSize: 22,
    fontWeight: "600",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.5,
    textTransform: "uppercase",
  },
  ledgerSectionSubtitle: {
    fontSize: 8,
    fontWeight: "500",
    color: Theme.textMuted,
    letterSpacing: 2,
    textTransform: "uppercase",
    marginTop: 6,
  },
  loading: {
    paddingVertical: 32,
    textAlign: "center",
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textMutedDemo,
    letterSpacing: 0.5,
  },
  emptyState: {
    paddingVertical: 32,
    paddingHorizontal: 24,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textMutedDemo,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    textAlign: "center",
  },
  emptyStateAddBtn: {
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: Theme.primary,
    borderRadius: 8,
  },
  emptyStateAddBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textOnPrimary ?? "#fff",
  },
  inlineReceiptWrap: {
    marginTop: 0,
    backgroundColor: Theme.screenBackground,
  },
});
