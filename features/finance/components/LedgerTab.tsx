/**
 * Treasury Financial Summary — Ledger tab. Table view (default) or Transaction view (GPay-style).
 * When transactions prop is provided, uses it (single read from parent); otherwise uses TanStack Query cache.
 */
import { ALL_LEDGER_CATEGORY_VALUES } from "@/components/AddTransactionModal";
import Theme from "@/constants/Theme";
import { useLanguage } from "@/contexts/LanguageContext";
import { PartyAvatar } from "@/components/PartyAvatar";
import {
  type LedgerIdentityContext,
  resolveLedgerRowPartyIdentity,
  resolvedIdentityToEntityAvatarProps,
} from "@/lib/entityIdentity";
import type { LinkedOrgDisplay } from "@/lib/useLinkedOrgProfileMap";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { getDoubleEntryDisplayLabel } from "../accounting/accountingModel";
import * as financeService from "../services/finance.service";
import { getProfileImageBatch } from "../services/finance.service";
import { FinancialRow, type FinancialRowData } from "./FinancialRow";
import { FinanceEntryDetailScreen } from "./FinanceEntryDetailScreen";
import { LedgerTransactionListView } from "./LedgerTransactionListView";
import type { ClientRow } from "@/features/clients/services/clients.service";
import type { DriverRow } from "@/features/drivers/services/drivers.service";
import type { SupplierRow } from "@/features/suppliers/services/suppliers.service";
import { useDisputeMapQuery, useTransactionsQuery } from "@/lib/queries";
import {
  buildFinancialRowDataForLedgerRow,
  formatLedgerEntryDate,
  formatLedgerRoute,
  formatLedgerTripDateForDisplay,
  resolveLedgerPartyName,
} from "@/features/finance/components/ledger/buildFinancialRowDataForLedgerRow";

export type LedgerViewMode = "table" | "transaction";

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

  const { disputesByTripId } = useDisputeMapQuery(organizationId);
  const [selectedDetailData, setSelectedDetailData] = useState<FinancialRowData | null>(
    null,
  );

  const getResolvedPartyName = useCallback(
    (row: financeService.LedgerRow) =>
      resolveLedgerPartyName(row, {
        clientById,
        supplierById,
        tripPartyMap,
        tripDetailsMap,
      }),
    [clientById, supplierById, tripPartyMap, tripDetailsMap],
  );

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
    const fetchDriverProfileImages = async () => {
      const driverIds = rows
        .filter((row) => row.contact_type === 'driver' && row.contact_id && !profileImages[row.contact_id] && !driverProfileImageUrls[row.contact_id!])
        .map((row) => row.contact_id as string);

      if (driverIds.length === 0) return;
      const fetched = await getProfileImageBatch(driverIds);
      if (Object.keys(fetched).length > 0) {
        setProfileImages((prev) => ({ ...prev, ...fetched }));
      }
    };
    void fetchDriverProfileImages();
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

  function buildFinancialRowDataForRow(
    row: financeService.LedgerRow,
  ): FinancialRowData {
    return buildFinancialRowDataForLedgerRow(row, {
      allRows: rows,
      tripDetailsMap,
      tripPartyMap,
      clientById,
      supplierById,
      driverById,
      getVehicleNumberForTripId,
      linkedOrgDisplayMap,
      profileImages,
      driverProfileImageUrls: {
        ...driverProfileImageUrls,
        ...profileImages,
      },
      disputesByTripId,
    });
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
        const props = resolvedIdentityToEntityAvatarProps(identity);
        return (
          <PartyAvatar
            name={props.name}
            initialsColorSeed={row.contact_id ?? row.party_name}
            avatarUrl={props.avatarUrl}
            avatarSeed={props.avatarSeed}
            organizationImageUrl={props.organizationImageUrl}
            organizationAvatarSeed={props.organizationAvatarSeed}
            entityType={props.entityType}
            size={40}
          />
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
        const entryDateStr = formatLedgerEntryDate(row.transaction_date);
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
                    route: formatLedgerRoute(detail),
                    trip_date:
                      (t as { trip_date?: string | null }).trip_date ??
                      (detail?.pickup_date
                        ? formatLedgerTripDateForDisplay(detail.pickup_date)
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
                    date: formatLedgerEntryDate(r.transaction_date),
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
            expandedRowId={expandedLedgerRowId}
            onExpandedChange={setExpandedLedgerRowId}
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
