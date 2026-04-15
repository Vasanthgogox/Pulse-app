/**
 * Trip Ledger Detail — matches reference: Treasury header + summary card with search,
 * Transaction Ledger (TRIP ID / SALES / PAID / DUE), Contact, Tax & Compliance,
 * Telemetry History, and FAB. Uses TreasuryDetailLayout for alignment with app.
 */
import { TreasuryDetailLayout } from "./TreasuryDetailLayout";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { useLanguage } from "@/contexts/LanguageContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { getDriverById } from "@/features/drivers/services/drivers.service";
import {
  getTripById,
  getTripDisplayNumber,
  type TripRow,
} from "@/features/trips";
import { getVehicleById } from "@/features/vehicles/services/vehicles.service";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
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
import { getTripLedgerEntries } from "@/features/finance/utils/getTripLedgerEntries";
import { FinanceFAB } from "@/components/navigation/FinanceFAB";
import {
  getTransactionsByOrganization,
  type LedgerRow,
} from "../services/finance.service";
import { getDoubleEntryDisplayLabel } from "../accounting/accountingModel";
import {
  formatIndianVehicleNumber,
  formatINR,
  formatLedgerDate,
  formatRelative,
} from "@/lib/format";

const PREVIEW_TRIP_ID = "preview";

/** Mock trip for preview mode (e.g. /trip-ledger/preview) so the full UI can be seen without API. */
function getPreviewTrip(): TripRow {
  const now = new Date().toISOString();
  return {
    id: PREVIEW_TRIP_ID,
    organization_id: "preview-org",
    trip_number: "123GO",
    sequence_number: 123,
    display_trip_id: "123GO",
    indent_id: null,
    source: "manual",
    pickup_area: "Mumbai",
    drop_location: "Delhi",
    distance: "1400",
    estimated_duration: "24h",
    client_id: null,
    client_name: "RJ Transport",
    supplier_id: null,
    supplier_name: null,
    driver_id: null,
    vehicle_id: null,
    client_price: 20000,
    supplier_rate: 15000,
    margin: 5000,
    platform_fee: 0,
    driver_commission: 2000,
    is_guaranteed: false,
    payment_status: "pending",
    amount_paid: 20000,
    status: "completed",
    pickup_date: now.slice(0, 10),
    started_at: null,
    completed_at: null,
    load_type: null,
    notes: null,
    created_at: now,
    updated_at: now,
  };
}

/** Mock ledger entries for preview. */
function getPreviewTransactions(): LedgerRow[] {
  const d = new Date().toISOString().slice(0, 10);
  return [
    {
      id: "preview-tx-1",
      organization_id: "preview-org",
      trip_id: PREVIEW_TRIP_ID,
      trip_number: "123GO",
      party_name: "RJ Transport",
      description: "ADJ – GENERAL",
      amount_in: 20000,
      amount_out: 0,
      transaction_date: d,
      created_at: new Date().toISOString(),
    },
    {
      id: "preview-tx-2",
      organization_id: "preview-org",
      trip_id: PREVIEW_TRIP_ID,
      trip_number: "123GO",
      party_name: "RJ Transport",
      description: "Payment received",
      amount_in: 0,
      amount_out: 0,
      transaction_date: d,
      created_at: new Date().toISOString(),
    },
  ];
}

export type TripLedgerEntityType = "CLIENT" | "SUPPLIER" | "DRIVER" | "VEHICLE";

export interface TripLedgerDetailScreenProps {
  tripId: string;
  entityType?: TripLedgerEntityType | null;
  entityId?: string | null;
  partyName?: string | null;
  onBack: () => void;
}

export function TripLedgerDetailScreen({
  tripId,
  entityType,
  entityId,
  partyName,
  onBack,
}: TripLedgerDetailScreenProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id ?? null;

  const isPreview = tripId === PREVIEW_TRIP_ID;
  const [trip, setTrip] = useState<TripRow | null>(() =>
    isPreview ? getPreviewTrip() : null,
  );
  const [transactions, setTransactions] = useState<LedgerRow[] | null>(() =>
    isPreview ? getPreviewTransactions() : null,
  );
  const [loading, setLoading] = useState(!isPreview);
  const [error, setError] = useState<string | null>(null);
  const [vehicleLabel, setVehicleLabel] = useState<string | null>(null);
  const [driverName, setDriverName] = useState<string | null>(null);
  const initialLoadDoneRef = React.useRef(false);

  const load = useCallback(() => {
    if (isPreview) return;
    if (!tripId || !orgId) {
      setLoading(false);
      return;
    }
    if (!initialLoadDoneRef.current) setLoading(true);
    setError(null);
    Promise.all([getTripById(tripId), getTransactionsByOrganization(orgId)])
      .then(([tripRes, txRes]) => {
        if (tripRes.error) {
          setError(tripRes.error.message);
          setTrip(null);
        } else {
          setTrip(tripRes.trip ?? null);
        }
        setTransactions(txRes.error ? [] : (txRes.transactions ?? []));
      })
      .finally(() => {
        setLoading(false);
        initialLoadDoneRef.current = true;
      });
  }, [tripId, orgId, isPreview]);

  useEffect(() => {
    if (!isPreview) load();
  }, [load, isPreview]);
  useFocusEffect(useCallback(() => { if (!isPreview) load(); }, [load, isPreview]));

  useEffect(() => {
    if (!trip || !orgId || isPreview) {
      setVehicleLabel(null);
      setDriverName(null);
      return;
    }
    let cancelled = false;
    if (trip.vehicle_id) {
      getVehicleById(orgId, trip.vehicle_id).then((res) => {
        if (cancelled) return;
        if (res.vehicle) {
          const parts = [res.vehicle.vehicle_number];
          if (res.vehicle.vehicle_type) parts.push(res.vehicle.vehicle_type);
          setVehicleLabel(parts.join(" · "));
        } else {
          setVehicleLabel(null);
        }
      });
    } else if (trip.vehicle_display_number?.trim()) {
      setVehicleLabel(formatIndianVehicleNumber(trip.vehicle_display_number.trim()));
    } else {
      setVehicleLabel(null);
    }
    const fallbackDriverName = (trip.driver_display_name ?? "").trim() || null;
    if (trip.driver_id) {
      setDriverName(fallbackDriverName);
      getDriverById(orgId, trip.driver_id).then((res) => {
        if (cancelled) return;
        const fromDriver = res.driver
          ? (res.driver.name || res.driver.phone || "").trim() || null
          : null;
        setDriverName(fromDriver ?? fallbackDriverName ?? "—");
      });
    } else {
      setDriverName(fallbackDriverName);
    }
    return () => {
      cancelled = true;
    };
  }, [trip?.id, trip?.vehicle_id, trip?.vehicle_display_number, trip?.driver_id, trip?.driver_display_name, orgId, isPreview]);

  const tripLedgerEntries = useMemo(() => {
    return getTripLedgerEntries(transactions, trip?.id);
  }, [transactions, trip?.id]);

  const isCrossOrgSupplier =
    trip != null &&
    orgId != null &&
    trip.organization_id != null &&
    trip.organization_id !== orgId &&
    entityType === "CLIENT";

  const sales = trip
    ? isCrossOrgSupplier
      ? Number(trip.supplier_rate ?? 0)
      : Number(trip.client_price ?? 0)
    : 0;

  const received = useMemo(() => {
    if (!tripLedgerEntries.length) return 0;
    return tripLedgerEntries.reduce((s, tx) => s + Number(tx.amount_in ?? 0), 0);
  }, [tripLedgerEntries]);
  const pending = Math.max(0, sales - received);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);

  // When we are the client (trip owned by another org), amount we owe = client_price; else supplier_rate (align with supplier detail / aggregateSuppliers).
  const isTripWhereWeAreClient =
    trip != null &&
    orgId != null &&
    trip.organization_id != null &&
    trip.organization_id !== orgId &&
    entityType === "SUPPLIER";

  const supplierCost = trip
    ? isTripWhereWeAreClient
      ? Number(trip.client_price ?? 0) || Number(trip.supplier_rate ?? 0)
      : isCrossOrgSupplier
        ? 0 // We are the supplier, this record is our revenue, not our cost.
        : Number(trip.supplier_rate ?? 0)
    : 0;
  const supplierPaid = useMemo(() => {
    if (!tripLedgerEntries.length) return 0;
    return tripLedgerEntries.reduce((s, tx) => s + Number(tx.amount_out ?? 0), 0);
  }, [tripLedgerEntries]);
  const supplierDue = Math.max(0, supplierCost - supplierPaid);

  const focusedEntry = useMemo(() => {
    if (!tripLedgerEntries.length) return null;
    const id = selectedEntryId && tripLedgerEntries.some((e) => e.id === selectedEntryId)
      ? selectedEntryId
      : tripLedgerEntries[0]?.id ?? null;
    return tripLedgerEntries.find((e) => e.id === id) ?? tripLedgerEntries[0] ?? null;
  }, [tripLedgerEntries, selectedEntryId]);

  const associatedTransactionsList = useMemo(() => {
    if (!focusedEntry) return tripLedgerEntries;
    return tripLedgerEntries.filter((tx) => tx.id !== focusedEntry.id);
  }, [tripLedgerEntries, focusedEntry]);

  const openLedgerSync = useCallback(
    (params: Record<string, string>) => {
      const q = new URLSearchParams(params);
      q.set("returnTo", "trip-ledger");
      router.push(`/(modals)/ledger-sync?${q.toString()}` as const);
    },
    [router],
  );

  const onRecordCashIn = useCallback(() => {
    if (!trip || !entityId) return;
    const p: Record<string, string> = {
      tripId: trip.id,
      tripNumber: getTripDisplayNumber(trip),
      defaultType: "in",
      partyContext: "customers",
      partyId: entityId,
      partyName: partyName ?? trip.client_name ?? "Client",
      entityType: "CLIENT",
      entityId,
    };
    if (pending > 0) p.dueAmountIn = String(pending);
    if (supplierDue > 0) p.dueAmountOut = String(supplierDue);
    openLedgerSync(p);
  }, [trip, entityId, partyName, openLedgerSync, pending, supplierDue]);

  const onRecordPayment = useCallback(() => {
    if (!trip || !entityId) return;
    const p: Record<string, string> = {
      tripId: trip.id,
      tripNumber: getTripDisplayNumber(trip),
      defaultType: "in",
      partyContext: entityType === "SUPPLIER" ? "suppliers" : "all",
      partyId: entityId,
      partyName: partyName ?? "",
      entityType: entityType!,
      entityId,
    };
    if (pending > 0) p.dueAmountIn = String(pending);
    if (supplierDue > 0) p.dueAmountOut = String(supplierDue);
    openLedgerSync(p);
  }, [trip, entityId, entityType, partyName, openLedgerSync, pending, supplierDue]);

  const onAddExpense = useCallback(() => {
    if (!trip) return;
    const params: Record<string, string> = {
      tripId: trip.id,
      tripNumber: getTripDisplayNumber(trip),
      defaultType: "out",
    };
    if (entityId) {
      params.entityType = entityType ?? "VEHICLE";
      params.entityId = entityId;
      params.partyName = partyName ?? "";
    }
    if (supplierDue > 0) params.dueAmountOut = String(supplierDue);
    if (pending > 0) params.dueAmountIn = String(pending);
    openLedgerSync(params);
  }, [trip, entityId, entityType, partyName, openLedgerSync, supplierDue, pending]);

  const showFABMenu = useCallback(() => {
    const options: { text: string; onPress: () => void }[] = [];
    if (entityType === "CLIENT") options.push({ text: "Record cash in", onPress: onRecordCashIn });
    if (entityType === "SUPPLIER" || entityType === "DRIVER") options.push({ text: "Record payment", onPress: onRecordPayment });
    options.push({ text: "Add expense", onPress: onAddExpense });
    if (options.length === 0) return;
    Alert.alert(
      "Actions",
      undefined,
      [
        ...options.map((o) => ({ text: o.text, onPress: o.onPress })),
        { text: "Cancel", style: "cancel" },
      ],
    );
  }, [entityType, onRecordCashIn, onRecordPayment, onAddExpense]);

  if (loading && !trip) {
    return (
      <TreasuryDetailLayout
        title="Trip ledger"
        showBack
        onBack={onBack}
        onLoadClick={() => router.push("/load-board")}
        onNetworkClick={() => router.push("/(tabs)/network")}
        onProfileClick={() => router.push("/(tabs)/profile")}
      >
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Theme.primary} />
        </View>
      </TreasuryDetailLayout>
    );
  }

  if (error || !trip) {
    return (
      <TreasuryDetailLayout
        title="Trip ledger"
        showBack
        onBack={onBack}
        onLoadClick={() => router.push("/load-board")}
        onNetworkClick={() => router.push("/(tabs)/network")}
        onProfileClick={() => router.push("/(tabs)/profile")}
      >
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error ?? "Trip not found"}</Text>
        </View>
      </TreasuryDetailLayout>
    );
  }

  const missionId = getTripDisplayNumber(trip);
  const clientName = trip.client_name ?? "—";
  const subtitle = entityType ? String(entityType) : (clientName !== "—" ? clientName : "Trip ledger");

  const summaryTotalIn = entityType === "SUPPLIER" ? supplierCost : sales;
  const summaryTotalOut = entityType === "SUPPLIER" ? supplierDue : pending;
  const summaryLabelOut = entityType === "SUPPLIER" ? t("due") : t("totalBalance");

  return (
    <TreasuryDetailLayout
      title={missionId}
      subtitle={subtitle}
      showBack
      onBack={onBack}
      onLoadClick={() => router.push("/load-board")}
      onNetworkClick={() => router.push("/(tabs)/network")}
      onNotificationClick={() => {}}
      onProfileClick={() => router.push("/(tabs)/profile")}
      summaryCard={{
        totalIn: summaryTotalIn,
        totalOut: summaryTotalOut,
        labelIn: entityType === "SUPPLIER" ? t("supplierCost") : t("totalBilling"),
        labelOut: summaryLabelOut,
        searchQuery,
        onSearchChange: setSearchQuery,
        searchPlaceholder: t("searchMissionDestination"),
        onReportPress: () => {},
      }}
      fab={
        <View
          style={[
            styles.fabWrap,
            { bottom: Layout.fabBottomOffset + insets.bottom },
          ]}
        >
          <FinanceFAB
            onPress={showFABMenu}
            accessibilityLabel={t("addTransaction")}
            icon="receipt-text"
          />
        </View>
      }
    >
      <View style={styles.content}>
        {isPreview && (
          <View style={styles.previewBanner}>
            <Text style={styles.previewBannerText}>Preview — mock data</Text>
          </View>
        )}

        {focusedEntry && (
          <>
            {/* Entry card (e.g. Advance) */}
            <View style={styles.entryCard}>
              <Text style={styles.entryCardTitle}>
                {getDoubleEntryDisplayLabel(focusedEntry) ?? (focusedEntry.description || "ENTRY").split(/[–—]/)[0]?.trim() ?? "ENTRY"}
              </Text>
              <View style={styles.entryCardRow}>
                <View style={styles.entryCardLeft}>
                  <Text style={styles.entryCardMeta} numberOfLines={1}>
                    {t("tripPayment")} {formatLedgerDate(focusedEntry.transaction_date ?? focusedEntry.created_at ?? "")}
                  </Text>
                </View>
                <View style={styles.entryCardCenter}>
                  <Text style={styles.entryCardRoute} numberOfLines={1}>
                    {trip.pickup_area ?? "—"} → {trip.drop_location ?? "—"}
                  </Text>
                  <FontAwesome name="chevron-down" size={10} color={Theme.textMuted} style={styles.entryCardChevron} />
                </View>
                <View style={styles.entryCardRight}>
                  <Text
                    style={[
                      styles.entryCardAmount,
                      Number(focusedEntry.amount_out ?? 0) > 0 && styles.entryCardAmountRed,
                      Number(focusedEntry.amount_in ?? 0) > 0 && Number(focusedEntry.amount_out ?? 0) === 0 && styles.entryCardAmountGreen,
                    ]}
                  >
                    {Number(focusedEntry.amount_out ?? 0) > 0
                      ? formatINR(focusedEntry.amount_out!)
                      : Number(focusedEntry.amount_in ?? 0) > 0
                        ? formatINR(focusedEntry.amount_in!)
                        : "—"}
                  </Text>
                  <FontAwesome name="chevron-down" size={10} color={Theme.textMuted} />
                </View>
              </View>
            </View>

            {/* LEDGER DETAILS */}
            <View style={styles.darkSection}>
              <Text style={styles.darkSectionTitle}>{t("ledgerDetails")}</Text>
              <View style={styles.detailBody}>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>{t("type")}</Text>
                  <Text style={styles.detailValue}>{getDoubleEntryDisplayLabel(focusedEntry) ?? focusedEntry.description ?? "—"}</Text>
                </View>
                <View style={[styles.detailRow, styles.detailRowWithAging]}>
                  <View>
                    <Text style={styles.detailLabel}>{t("entryDate")}</Text>
                    <Text style={styles.detailValue}>{formatLedgerDate(focusedEntry.transaction_date ?? focusedEntry.created_at ?? "")}</Text>
                  </View>
                  <Text style={styles.agingText}>{formatRelative(focusedEntry.transaction_date ?? focusedEntry.created_at ?? "")}</Text>
                </View>
                {Number(focusedEntry.amount_in ?? 0) > 0 ? (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>{t("amountReceived")}</Text>
                    <Text style={[styles.detailValue, styles.detailValueGreen]}>
                      {formatINR(focusedEntry.amount_in!)}
                    </Text>
                  </View>
                ) : null}
                {Number(focusedEntry.amount_out ?? 0) > 0 ? (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>{t("amountPaid")}</Text>
                    <View style={styles.amountPaidPill}>
                      <Text style={styles.amountPaidPillText}>
                        {formatINR(focusedEntry.amount_out!)}
                      </Text>
                    </View>
                  </View>
                ) : null}
                {(focusedEntry.description ?? "").trim() !== "" ? (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>{t("note")}</Text>
                    <Text style={styles.detailValue} numberOfLines={2}>{focusedEntry.description}</Text>
                  </View>
                ) : null}
              </View>
            </View>
          </>
        )}

        {/* ASSOCIATED TRIP */}
        <View style={styles.darkSection}>
          <Text style={styles.darkSectionTitle}>{t("associatedTrip")}</Text>
          <View style={styles.detailBody}>
            <View style={styles.twoColRow}>
              <View style={styles.twoColItem}>
                <Text style={styles.detailLabel}>{t("trip")}</Text>
                <Text style={styles.detailValue}>{missionId}</Text>
              </View>
              <View style={styles.twoColItem}>
                <Text style={styles.detailLabel}>{t("tripDate")}</Text>
                <Text style={styles.detailValue}>{formatLedgerDate(trip.pickup_date ?? trip.created_at ?? "")}</Text>
              </View>
            </View>
            <View style={styles.twoColRow}>
              <View style={styles.twoColItem}>
                <Text style={styles.detailLabel}>{t("route")}</Text>
                <Text style={styles.detailValue} numberOfLines={1}>{trip.pickup_area ?? "—"} → {trip.drop_location ?? "—"}</Text>
              </View>
              <View style={styles.twoColItem}>
                <Text style={styles.detailLabel}>{t("client")}</Text>
                <Text style={styles.detailValue} numberOfLines={1}>{clientName}</Text>
              </View>
            </View>
            {(vehicleLabel?.trim() || driverName?.trim()) ? (
              <View style={styles.twoColRow}>
                {vehicleLabel?.trim() ? (
                  <View style={styles.twoColItem}>
                    <Text style={styles.detailLabel}>{t("truck")}</Text>
                    <Text style={styles.detailValue} numberOfLines={1}>{vehicleLabel.trim()}</Text>
                  </View>
                ) : null}
                {driverName?.trim() ? (
                  <View style={styles.twoColItem}>
                    <Text style={styles.detailLabel}>{t("driver")}</Text>
                    <Text style={styles.detailValue} numberOfLines={1}>{driverName.trim()}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
        </View>

        {/* Financial summary card (dark) */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryCardRow}>
            <View style={styles.summaryCardItem}>
              <Text style={styles.summaryCardLabel}>{t("supplierCost")}</Text>
              <Text style={styles.summaryCardValue}>{formatINR(supplierCost)}</Text>
            </View>
            <View style={styles.summaryCardItem}>
              <Text style={styles.summaryCardLabel}>{t("paid")}</Text>
              <Text style={[styles.summaryCardValue, styles.summaryCardValueGreen]}>{formatINR(supplierPaid)}</Text>
            </View>
            <View style={styles.summaryCardItem}>
              <Text style={styles.summaryCardLabel}>{t("due")}</Text>
              <Text style={[styles.summaryCardValue, styles.summaryCardValueRed]}>{formatINR(supplierDue)}</Text>
            </View>
          </View>
        </View>

        {/* ASSOCIATED TRANSACTIONS */}
        <Text style={styles.associatedLabel}>{t("associatedTransactions")}</Text>
        {associatedTransactionsList.length === 0 ? (
          <Text style={styles.associatedEmpty}>{t("noAssociatedTransactions")}</Text>
        ) : (
          associatedTransactionsList.map((tx) => {
            const typeLabel = getDoubleEntryDisplayLabel(tx) ?? tx.description ?? "ENTRY";
            const dateStr = formatLedgerDate(tx.transaction_date ?? tx.created_at ?? "");
            const outAmt = Number(tx.amount_out ?? 0);
            const inAmt = Number(tx.amount_in ?? 0);
            return (
              <TouchableOpacity
                key={tx.id}
                style={styles.associatedCard}
                onPress={() => setSelectedEntryId(tx.id)}
                activeOpacity={0.8}
              >
                <Text style={styles.associatedCardLine1}>{dateStr} · {typeLabel}</Text>
                <Text
                  style={[
                    styles.associatedCardLine2,
                    outAmt > 0 && styles.associatedCardOut,
                    inAmt > 0 && outAmt === 0 && styles.associatedCardIn,
                  ]}
                >
                  {outAmt > 0 ? `${formatINR(outAmt)} out` : inAmt > 0 ? `${formatINR(inAmt)} in` : "—"} · {tx.description ?? "ENTRY"}
                </Text>
              </TouchableOpacity>
            );
          })
        )}

        {tripLedgerEntries.length === 0 && (
          <View style={styles.ledgerEmptyWrap}>
            <FontAwesome name="file-text-o" size={24} color={Theme.textMuted} />
            <Text style={styles.ledgerEmpty}>{t("noLedgerEntriesForTrip")}</Text>
          </View>
        )}
      </View>
    </TreasuryDetailLayout>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingBottom: 80,
  },
  previewBanner: {
    backgroundColor: Theme.primaryLight,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 16,
    alignItems: "center",
  },
  previewBannerText: {
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textOnPrimary,
    letterSpacing: 0.5,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textMutedDemo,
    letterSpacing: 1.5,
    marginBottom: 8,
    marginTop: 16,
  },
  totalBalanceDueRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: Theme.surfaceGray,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderTopWidth: 2,
    borderTopColor: Theme.darkBackground,
  },
  totalBalanceDueLabel: {
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textMutedDemo,
    letterSpacing: 0.8,
  },
  totalBalanceDueValue: { fontSize: 13, fontWeight: "500", color: Theme.teslaRed },
  table: {
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 8,
    overflow: "hidden",
    marginBottom: 8,
    borderTopWidth: 2,
    borderTopColor: Theme.darkBackground,
  },
  tableHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: Theme.surface,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  th: {
    fontSize: 9,
    fontWeight: "500",
    color: Theme.textMutedDemo,
    letterSpacing: 0.6,
  },
  thMission: { flex: 0.42 },
  thRight: { flex: 0.2, textAlign: "right" as const },
  thRightLast: { flex: 0.18, textAlign: "right" as const },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: Theme.surfaceBorder,
  },
  ledgerCellWide: { flex: 1, minWidth: 0 },
  ledgerDesc: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
  },
  ledgerDate: {
    fontSize: 10,
    color: Theme.textSecondary,
    marginTop: 2,
  },
  ledgerCell: {
    fontSize: 11,
    fontWeight: "600",
    width: 72,
    textAlign: "right",
  },
  ledgerMuted: { color: Theme.textMuted },
  ledgerEmpty: {
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textMuted,
    fontStyle: "italic",
    paddingVertical: 16,
    textAlign: "center",
  },
  quickActionsSection: {
    marginTop: Layout.sectionSpacing,
    paddingTop: 20,
    paddingBottom: 4,
    borderTopWidth: 1,
    borderTopColor: Theme.borderLight,
  },
  quickActionsLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textSecondary,
    letterSpacing: 0.5,
    marginBottom: 12,
    textTransform: "uppercase",
  },
  actionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  actionBtn: {
    flex: 1,
    minWidth: 120,
    minHeight: Layout.minTouchTargetSize,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  actionBtnPrimary: {
    backgroundColor: Theme.primary,
    borderWidth: 0,
  },
  actionBtnPrimaryText: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textOnPrimary,
  },
  actionBtnSecondary: {
    backgroundColor: Theme.surface,
    borderWidth: 1.5,
    borderColor: Theme.borderMedium,
  },
  actionBtnSecondaryText: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.primary,
  },
  tableRowAlt: { backgroundColor: Theme.surfaceLight },
  tableRowTotal: {
    borderBottomWidth: 0,
    backgroundColor: Theme.surfaceGray,
    borderTopWidth: 1,
    borderTopColor: Theme.borderLight,
  },
  tdMission: { flex: 0.42, minWidth: 0 },
  tdMissionId: {
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
  },
  tdDest: { fontSize: 10, color: Theme.textMutedDemo, marginTop: 2 },
  td: { fontSize: 12, fontWeight: "500", color: Theme.textPrimaryDark },
  tdRight: { flex: 0.2, textAlign: "right" as const },
  tdRightLast: { flex: 0.18, textAlign: "right" as const },
  valueGreen: { color: Theme.darkGreen },
  valueRed: { color: Theme.teslaRed },
  ledgerEmptyWrap: {
    paddingVertical: 24,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  contactCard: {
    backgroundColor: Theme.surface,
    borderRadius: 8,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderTopWidth: 2,
    borderTopColor: Theme.darkBackground,
  },
  contactLabel: {
    fontSize: 9,
    fontWeight: "500",
    color: Theme.textMutedDemo,
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  contactValue: { fontSize: 14, fontWeight: "500", color: Theme.textPrimaryDark, marginBottom: 12 },
  taxRow: { flexDirection: "row", gap: 12, marginBottom: 8 },
  taxCard: {
    flex: 1,
    backgroundColor: Theme.surface,
    borderRadius: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderTopWidth: 2,
    borderTopColor: Theme.darkBackground,
  },
  taxLabel: { fontSize: 9, fontWeight: "500", color: Theme.textMutedDemo, letterSpacing: 0.8, marginBottom: 6 },
  taxValue: { fontSize: 16, fontWeight: "500", color: Theme.textPrimaryDark },
  telemetryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: Theme.surface,
    borderRadius: 8,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderTopWidth: 2,
    borderTopColor: Theme.darkBackground,
  },
  telemetryId: { fontSize: 13, fontWeight: "500", color: Theme.textPrimaryDark },
  telemetryDate: { fontSize: 11, color: Theme.textMuted, marginTop: 2 },
  telemetryAmount: { fontSize: 13, fontWeight: "500" },
  telemetryEmpty: { fontSize: 13, color: Theme.textMuted, marginBottom: 16 },
  centered: {
    minHeight: 120,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 40,
  },
  fabWrap: {
    position: "absolute",
    right: Layout.fabRightOffset,
    zIndex: 100,
    elevation: 10,
  },
  errorText: { fontSize: 14, color: Theme.textSecondary, textAlign: "center" },
  entryCard: {
    backgroundColor: Theme.screenBackground,
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  entryCardTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    marginBottom: 6,
    textTransform: "capitalize",
  },
  entryCardRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  entryCardLeft: { flex: 1, minWidth: 0 },
  entryCardCenter: { flex: 1.2, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 },
  entryCardRight: { flex: 0.8, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 4 },
  entryCardMeta: { fontSize: 9, color: Theme.textMuted, textTransform: "uppercase" },
  entryCardRoute: { fontSize: 10, fontWeight: "600", color: Theme.textPrimaryDark },
  entryCardChevron: { marginLeft: 2 },
  entryCardAmount: { fontSize: 11, fontWeight: "700", color: Theme.textPrimaryDark },
  entryCardAmountGreen: { color: Theme.darkGreen },
  entryCardAmountRed: { color: Theme.teslaRed },
  darkSection: {
    backgroundColor: Theme.screenBackground,
    borderRadius: 6,
    marginBottom: 6,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Theme.borderLight,
    marginHorizontal: -Layout.screenPaddingHorizontal,
  },
  darkSectionTitle: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textOnDark,
    letterSpacing: 1,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: Theme.darkBackground,
    textTransform: "uppercase",
  },
  detailBody: {
    backgroundColor: Theme.screenBackground,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  detailRowWithAging: { alignItems: "center" },
  detailLabel: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  detailValue: { fontSize: 10, fontWeight: "600", color: Theme.textPrimaryDark },
  detailValueGreen: { color: Theme.darkGreen },
  agingText: { fontSize: 9, color: Theme.textMuted, marginTop: 12 },
  amountPaidPill: {
    backgroundColor: Theme.teslaRed,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
    alignSelf: "flex-start",
  },
  amountPaidPillText: { fontSize: 10, fontWeight: "700", color: Theme.textOnDark },
  twoColRow: {
    flexDirection: "row",
    marginBottom: 8,
    gap: 10,
  },
  twoColItem: { flex: 1, minWidth: 0 },
  summaryCard: {
    backgroundColor: Theme.darkBackground,
    borderRadius: 6,
    marginBottom: 8,
    marginHorizontal: -Layout.screenPaddingHorizontal,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: Theme.borderOnDark,
  },
  summaryCardRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  summaryCardItem: { flex: 1, alignItems: "center" },
  summaryCardLabel: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textOnDarkMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 3,
  },
  summaryCardValue: { fontSize: 11, fontWeight: "700", color: Theme.textOnDark },
  summaryCardValueGreen: { color: Theme.darkGreen },
  summaryCardValueRed: { color: Theme.teslaRed },
  associatedLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textMuted,
    letterSpacing: 1,
    marginTop: 8,
    marginBottom: 6,
    textTransform: "uppercase",
  },
  associatedEmpty: { fontSize: 11, color: Theme.textMuted, marginBottom: 6, fontStyle: "italic" },
  associatedCard: {
    backgroundColor: Theme.screenBackground,
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  associatedCardLine1: { fontSize: 11, fontWeight: "600", color: Theme.textPrimaryDark, marginBottom: 2 },
  associatedCardLine2: { fontSize: 10, color: Theme.textMuted },
  associatedCardOut: { color: Theme.teslaRed },
  associatedCardIn: { color: Theme.darkGreen },
});
