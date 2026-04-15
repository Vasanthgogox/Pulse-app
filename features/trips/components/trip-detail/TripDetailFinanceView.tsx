/**
 * Trip detail — Trip Details layout (aligned with reference):
 * Grid Tracking Node, Protocol Specification (financial blueprint), Adjustment Registry,
 * Supplier Sync bar, Associated Handshakes.
 */
import Theme from "@/constants/Theme";
import { useLanguage } from "@/contexts/LanguageContext";
import { getDoubleEntryDisplayLabel } from "@/features/finance/accounting/accountingModel";
import type { LedgerRow } from "@/features/finance/services/finance.service";
import { adjustedCost, adjustedRevenue } from "@/features/trips/services/tripAdjustments";
import type { TripAdjustment } from "@/features/trips/services/tripAdjustments";
import type { TripAssignmentAuditRow } from "@/features/trips/services/trip-assignment-audit.service";
import type { TripRow } from "@/features/trips/services/trips.service";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import type { ReactNode } from "react";
import { useMemo } from "react";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

function formatLedgerDateShort(s: string | null | undefined): string {
  if (!s) return "—";
  const d = (s ?? "").slice(0, 10);
  if (!d) return "—";
  const [, m, day] = d.split("-");
  const months = "JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC".split(" ");
  return `${day} ${months[Number(m) - 1] ?? m}`;
}

function formatINR(n: number): string {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0, minimumFractionDigits: 0 })}`;
}

/**
 * Derive tracking step 1–4 from status for progress bar.
 * Aligns with DB + driver app: assigned → 1, in_progress → 2, completed → 4.
 * Legacy/alternate labels (in_transit, delivered, etc.) supported for compatibility.
 */
function trackingStepFromStatus(status: string | null | undefined): number {
  const s = (status ?? "").toLowerCase();
  if (s === "completed" || s === "delivered" || s === "done") return 4;
  if (s === "arrived" || s === "at_destination" || s === "at_drop") return 3;
  if (
    s === "in_progress" ||
    s === "in_transit" ||
    s === "dispatched" ||
    s === "picked_up" ||
    s === "pickup"
  )
    return 2;
  return 1; // draft, assigned, cancelled, or unknown
}

export interface TripDetailFinanceViewProps {
  trip: TripRow;
  tripLedgerEntries: LedgerRow[];
  /** Adjustments to revenue (sale) or cost (supplier) — not in/out ledger. */
  adjustments?: TripAdjustment[];
  driverName?: string | null;
  /** Driver rating (1–5) when trip is completed; shown in tracking card. */
  driverRating?: number | null;
  vehicleLabel?: string | null;
  /** When set, + in Adjustment Registry opens add-adjustment flow. */
  onAddAdjustment?: () => void;
  /** When set, user can remove an adjustment (e.g. long-press or delete icon). */
  onRemoveAdjustment?: (adjustmentId: string) => void;
  /** Assignment / reassignment history for this trip (newest first). */
  assignmentAuditRows?: TripAssignmentAuditRow[];
  /** Resolved driver id → display name for assignment audit rows. */
  assignmentDriverNames?: Record<string, string>;
  /** Resolved vehicle id → display label for assignment audit rows. */
  assignmentVehicleLabels?: Record<string, string>;
  /** For aggregate trips: current OTP (code + expiry) for display in Assignments. */
  tripOtp?: { code: string | null; expires_at: string | null } | null;
  /** For aggregate trips: partner/supplier display name. */
  partnerName?: string | null;
  /** Optional block to render in Assignments section (e.g. TripAssignmentBlock for change/reassign). */
  assignmentBlock?: ReactNode;
  /** Current user id (auth) so Activity Log can show "by you" when changed_by matches. */
  currentUserId?: string | null;
  /** When true, show driver-offline state on tracking card and in live tracking modal. */
  isDriverOffline?: boolean;
  /** When set, the trip status card is tappable and opens the tracking view. */
  onOpenTracking?: () => void;
  /** Documents for this trip (e.g. manifest, vehicle docs, POD). When set, doc section is shown and onOpenDoc called when user taps a doc. */
  tripDocs?: TripDocItem[];
  /** Called when user taps a document to preview. */
  onOpenDoc?: (doc: TripDocItem) => void;
  /** When set, used to determine if we're the trip owner. Owner + indent => revenue = supplier_rate. Client (non-owner) => client_price. */
  viewerOrgId?: string | null;
  /** Display name of the client for this trip */
  clientName?: string | null;
}

export type DocCategory = "vehicle" | "trip" | "driver";

export interface TripDocItem {
  id: string;
  label: string;
  type: string;
  status: "Verified" | "Uploaded" | "Pending";
  /** When set, preview modal can fetch and show the file (e.g. Driver POD from trip_documents). */
  storagePath?: string;
  /** Optional backend document id for future use (e.g. multiple PODs). */
  documentId?: string;
  /** Which storage bucket to resolve signed URLs from. Default: 'trip' (trip-documents bucket). */
  docSource?: "trip" | "vehicle";
  /** Optional grouping metadata for downstream preview behavior. */
  category?: DocCategory;
}

const DEFAULT_TRIP_DOCS: TripDocItem[] = [
  { id: "manifest", label: "Trip Manifest", type: "PDF", status: "Pending", category: "trip" },
  { id: "vehicle-documents", label: "Vehicle Document", type: "DOCS", status: "Pending", category: "vehicle" },
  { id: "pod", label: "Driver POD", type: "JPG", status: "Pending", category: "driver" },
];

function TripDocsGrid({
  tripDocs,
  onOpenDoc,
}: {
  tripDocs: TripDocItem[];
  onOpenDoc?: (doc: TripDocItem) => void;
}) {
  if (tripDocs.length === 0) return null;

  return (
    <View style={styles.docSection}>
      <View style={styles.docSectionHeader}>
        <FontAwesome name="paperclip" size={10} color={Theme.textMuted} />
        <Text style={styles.docSectionTitle}>Documents</Text>
      </View>
      <View style={styles.docGrid}>
        {tripDocs.map((doc) => {
          const isUploaded = doc.status === "Uploaded" || doc.status === "Verified";
          const statusColor =
            doc.status === "Verified"
              ? Theme.darkGreen
              : isUploaded
                ? Theme.primary
                : Theme.textMuted;
          const statusIcon =
            doc.status === "Pending" ? "clock-o" : "check-circle";

          return (
            <TouchableOpacity
              key={doc.id}
              style={styles.docCard}
              onPress={() => onOpenDoc?.(doc)}
              activeOpacity={0.85}
              disabled={!onOpenDoc}
              accessibilityLabel={`${doc.label}, ${doc.status}`}
              accessibilityRole="button"
            >
              <View
                style={[
                  styles.docCardIconWrap,
                  isUploaded ? styles.docCardIconWrapUploaded : styles.docCardIconWrapPending,
                ]}
              >
                <FontAwesome
                  name={isUploaded ? "file-text-o" : "file-o"}
                  size={28}
                  color={isUploaded ? Theme.primary : Theme.textMuted}
                />
              </View>
              <Text style={styles.docCardLabel} numberOfLines={2}>
                {doc.label}
              </Text>
              <Text style={styles.docCardType} numberOfLines={1}>
                {doc.type}
              </Text>
              <View style={styles.docCardStatus}>
                <FontAwesome name={statusIcon as any} size={12} color={statusColor} />
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function formatAssignmentDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso.slice(0, 16).replace("T", " ") || "—";
  }
}

/** Uppercase format for Activity Log: "12 MAR 2026 AT 2:07 PM" */
function formatAssignmentDateActivityMeta(iso: string | null | undefined): string {
  const s = formatAssignmentDate(iso);
  if (s === "—") return s;
  return s.toUpperCase().replace(", ", " AT ");
}

export function TripDetailFinanceView({
  trip,
  tripLedgerEntries,
  adjustments = [],
  driverName,
  driverRating,
  vehicleLabel,
  assignmentAuditRows = [],
  assignmentDriverNames = {},
  assignmentVehicleLabels = {},
  tripOtp: _tripOtp = null,
  partnerName: _partnerName = null,
  onAddAdjustment,
  onRemoveAdjustment,
  assignmentBlock,
  currentUserId = null,
  isDriverOffline = false,
  onOpenTracking,
  tripDocs = DEFAULT_TRIP_DOCS,
  onOpenDoc,
  viewerOrgId = null,
  clientName,
}: TripDetailFinanceViewProps) {
  const { t } = useLanguage();
  const routeStr = `${trip.pickup_area ?? "—"} → ${trip.drop_location ?? "—"}`.trim() || "—";
  const customerSales = Number(trip.client_price ?? 0) || 0;
  const supplierCost = Number(trip.supplier_rate ?? 0) || 0;
  // Indent: owner = client (shipper), revenue = client_price. Non-owner = supplier, revenue = supplier_rate.
  const isTripOwner =
    viewerOrgId != null &&
    trip.organization_id != null &&
    trip.organization_id === viewerOrgId;
  /** Non-owner + indent: supplier_rate. Otherwise: client_price. */
  const sales =
    trip.indent_id != null && !isTripOwner ? supplierCost : customerSales;
  /** Owner + indent: cost = supplier_rate. Non-owner + indent: no cost. Non-indent: supplier_rate. */
  const cost =
    trip.indent_id != null && !isTripOwner ? 0 : supplierCost;

  const adjSales = useMemo(() => adjustedRevenue(sales, adjustments), [sales, adjustments]);
  const adjCost = useMemo(() => adjustedCost(cost, adjustments), [cost, adjustments]);
  const adjMargin = adjSales - adjCost;

  const receivedFromCustomer = useMemo(
    () => tripLedgerEntries.reduce((s, tx) => s + Number(tx.amount_in ?? 0), 0),
    [tripLedgerEntries],
  );
  const dueFromCustomer = Math.max(0, sales - receivedFromCustomer);

  /** Paid to supplier: outflows linked to this trip (supplier payments). Due vs adjusted cost. */
  const paidToSupplier = useMemo(
    () => tripLedgerEntries.reduce((s, tx) => s + Number(tx.amount_out ?? 0), 0),
    [tripLedgerEntries],
  );
  const supplierDue = Math.max(0, adjCost - paidToSupplier);

  /** Commission / payments by party type (for display when present). */
  const { supplierCommission, driverCommission } = useMemo(() => {
    let supplier = 0;
    let driver = 0;
    for (const tx of tripLedgerEntries) {
      const out = Number(tx.amount_out ?? 0);
      if (out <= 0) continue;
      const ct = tx.contact_type;
      if (ct === "supplier") supplier += out;
      else if (ct === "driver") driver += out;
    }
    return { supplierCommission: supplier, driverCommission: driver };
  }, [tripLedgerEntries]);

  const receivableTransactions = useMemo(
    () => tripLedgerEntries.filter((tx) => Number(tx.amount_in ?? 0) > 0),
    [tripLedgerEntries],
  );
  const payableTransactions = useMemo(
    () => tripLedgerEntries.filter((tx) => Number(tx.amount_out ?? 0) > 0),
    [tripLedgerEntries],
  );

  const revenueAdjustments = useMemo(
    () => adjustments.filter((a) => a.type === "revenue"),
    [adjustments],
  );
  const costAdjustments = useMemo(
    () => adjustments.filter((a) => a.type === "cost"),
    [adjustments],
  );

  const trackingStep = useMemo(
    () => trackingStepFromStatus(trip.status),
    [trip.status]
  );
  const statusLabel =
    trip.driver_id == null
      ? "Unassigned"
      : (trip.status ?? "Active").replace(/_/g, " ");
  const trackingLocation = routeStr !== "—" ? routeStr : "Unmapped";

  const handleTrackingCardPress = () => {
    onOpenTracking?.();
  };

  return (
    <View style={styles.content}>
      {/* Active Grid Sync — tappable to open tracking view */}
      <TouchableOpacity
        style={styles.trackingCard}
        onPress={handleTrackingCardPress}
        activeOpacity={0.92}
        accessible
        accessibilityLabel={isDriverOffline ? "Driver offline - Open tracking" : "Open tracking"}
        accessibilityRole="button"
      >
        <View style={styles.trackingHeader}>
          <View style={styles.trackingHeaderLeft}>
            <View
              style={[
                styles.trackingStatusDot,
                isDriverOffline && styles.trackingStatusDotOffline,
              ]}
            />
            <Text
              style={[
                styles.trackingLabel,
                isDriverOffline && styles.trackingLabelOffline,
              ]}
            >
              {isDriverOffline ? "Driver Offline" : "Journey Progress"}
            </Text>
          </View>
          {onOpenTracking ? (
            <View style={styles.trackingLiveMapBadge}>
              <FontAwesome name="location-arrow" size={10} color={Theme.primary} />
              <Text style={styles.trackingLiveMapText}>OPEN MAPS</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.progressRow}>
          {[1, 2, 3, 4].map((step) => (
            <View key={step} style={[styles.progressSegment, step <= trackingStep && styles.progressSegmentActive]} />
          ))}
        </View>
        <View style={styles.trackingFooter}>
          <View style={styles.trackingFooterLeft}>
            <FontAwesome
              name="location-arrow"
              size={10}
              color={isDriverOffline ? Theme.negative : Theme.positive}
              style={styles.clockIcon}
            />
            <Text
              style={[
                styles.trackingFooterValue,
                isDriverOffline && styles.trackingFooterValueOffline,
              ]}
            >
              {statusLabel}
            </Text>
          </View>
          <View style={styles.trackingFooterRight}>
            <Text
              style={[
                styles.trackingFooterValueAccent,
                isDriverOffline && styles.trackingFooterValueAccentOffline,
              ]}
              numberOfLines={1}
            >
              {driverRating != null && driverRating > 0
                ? `${driverName ?? "Driver"} · ${driverRating.toFixed(1)} ★`
                : trackingLocation}
            </Text>
          </View>
        </View>
      </TouchableOpacity>

      {/* Documents */}
      {tripDocs.length > 0 && (
        <TripDocsGrid tripDocs={tripDocs} onOpenDoc={onOpenDoc} />
      )}

      {/* Unified Trip Finances Card */}
      <View style={styles.financeCard}>
        <View style={styles.financeHeader}>
          <View>
            <Text style={styles.financeTitle}>Trip Finances</Text>
            {clientName && <Text style={styles.financeSubtitle}>{clientName}</Text>}
          </View>
          <View style={styles.financeProfitWrap}>
            <Text style={styles.financeProfitLabel}>Profit</Text>
            <Text style={styles.financeProfitValue}>{formatINR(adjMargin)}</Text>
          </View>
        </View>

        {/* Customer Billing Section */}
        <View style={styles.financeSection}>
          <Text style={styles.financeSectionTitle}>Customer Billing</Text>
          <View style={styles.financeRow}>
            <Text style={styles.financeLabel}>Original Price</Text>
            <Text style={styles.financeValue}>{formatINR(sales)}</Text>
          </View>
          
          {revenueAdjustments.length > 0 && (
            <View style={styles.financeAdjustmentsWrap}>
              {revenueAdjustments.map((adj) => (
                <View key={adj.id} style={styles.financeAdjRow}>
                  <Text style={styles.financeAdjReason} numberOfLines={1}>{adj.impact === "plus" ? "+" : "−"} {adj.reason}</Text>
                  <View style={styles.financeAdjRight}>
                    <Text style={[styles.financeAdjAmount, adj.impact === "plus" ? { color: Theme.darkGreen } : { color: Theme.teslaRed }]}>
                      {adj.impact === "plus" ? "+" : "−"}{formatINR(adj.amount)}
                    </Text>
                    {onRemoveAdjustment && (
                      <TouchableOpacity
                        onPress={() => onRemoveAdjustment(adj.id)}
                        hitSlop={8}
                        style={styles.financeAdjRemoveBtn}
                      >
                        <FontAwesome name="times" size={14} color={Theme.textMuted} />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              ))}
            </View>
          )}

          <View style={styles.financeTotalRow}>
            <Text style={styles.financeTotalLabel}>Final Price</Text>
            <Text style={styles.financeTotalValue}>{formatINR(adjSales)}</Text>
          </View>

          <View style={styles.financeStatusBox}>
            <View style={styles.financeStatusCol}>
              <Text style={styles.financeStatusLabel}>Received</Text>
              <Text style={styles.financeStatusValueGreen}>{formatINR(receivedFromCustomer)}</Text>
            </View>
            <View style={styles.financeStatusDivider} />
            <View style={styles.financeStatusColRight}>
              <Text style={styles.financeStatusLabel}>Pending to Collect</Text>
              <Text style={[styles.financeStatusValue, dueFromCustomer > 0 && styles.financeStatusValueRed]}>
                {formatINR(dueFromCustomer)}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.financeSectionDivider} />

        {/* Supplier Payments Section */}
        <View style={styles.financeSection}>
          <Text style={styles.financeSectionTitle}>Supplier Payments</Text>
          <View style={styles.financeRow}>
            <Text style={styles.financeLabel}>Original Cost</Text>
            <Text style={styles.financeValue}>{formatINR(cost)}</Text>
          </View>
          
          {costAdjustments.length > 0 && (
            <View style={styles.financeAdjustmentsWrap}>
              {costAdjustments.map((adj) => (
                <View key={adj.id} style={styles.financeAdjRow}>
                  <Text style={styles.financeAdjReason} numberOfLines={1}>{adj.impact === "plus" ? "+" : "−"} {adj.reason}</Text>
                  <View style={styles.financeAdjRight}>
                    <Text style={[styles.financeAdjAmount, adj.impact === "plus" ? { color: Theme.darkGreen } : { color: Theme.teslaRed }]}>
                      {adj.impact === "plus" ? "+" : "−"}{formatINR(adj.amount)}
                    </Text>
                    {onRemoveAdjustment && (
                      <TouchableOpacity
                        onPress={() => onRemoveAdjustment(adj.id)}
                        hitSlop={8}
                        style={styles.financeAdjRemoveBtn}
                      >
                        <FontAwesome name="times" size={14} color={Theme.textMuted} />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              ))}
            </View>
          )}

          <View style={styles.financeTotalRow}>
            <Text style={styles.financeTotalLabel}>Final Cost</Text>
            <Text style={styles.financeTotalValue}>{formatINR(adjCost)}</Text>
          </View>

          <View style={styles.financeStatusBox}>
            <View style={styles.financeStatusCol}>
              <Text style={styles.financeStatusLabel}>Paid</Text>
              <Text style={styles.financeStatusValueDark}>{formatINR(paidToSupplier)}</Text>
            </View>
            <View style={styles.financeStatusDivider} />
            <View style={styles.financeStatusColRight}>
              <Text style={styles.financeStatusLabel}>Pending to Pay</Text>
              <Text style={[styles.financeStatusValue, supplierDue > 0 && styles.financeStatusValueRed]}>
                {formatINR(supplierDue)}
              </Text>
            </View>
          </View>
        </View>

        {/* Actions & Commissions */}
        <View style={styles.financeFooter}>
          {onAddAdjustment && (
            <TouchableOpacity onPress={onAddAdjustment} style={styles.financeAddBtn} activeOpacity={0.8}>
              <FontAwesome name="plus" size={12} color={Theme.primary} style={{ marginRight: 6 }} />
              <Text style={styles.financeAddBtnText}>Add Adjustment</Text>
            </TouchableOpacity>
          )}
          
          {(supplierCommission > 0 || driverCommission > 0) && (
            <View style={styles.financeCommissionsWrap}>
              {supplierCommission > 0 && (
                <Text style={styles.financeCommissionText}>Supplier Commission: {formatINR(supplierCommission)}</Text>
              )}
              {driverCommission > 0 && (
                <Text style={styles.financeCommissionText}>Driver Commission: {formatINR(driverCommission)}</Text>
              )}
            </View>
          )}
        </View>
      </View>

      {/* Transaction list */}
      <Text style={styles.handshakesLabel}>Transaction list</Text>
      <View style={styles.handshakesWrap}>
        {tripLedgerEntries.length === 0 ? (
          <Text style={styles.handshakesEmpty}>No transactions linked to this corridor</Text>
        ) : (
          <View style={styles.txList}>
            {tripLedgerEntries.map((row) => {
              const dateStr = formatLedgerDateShort(row.transaction_date ?? row.created_at);
              const typeLabel = getDoubleEntryDisplayLabel(row) ?? row.description ?? row.party_name ?? "—";
              const party = row.party_name?.trim() || "—";
              const inAmt = Number(row.amount_in ?? 0);
              const outAmt = Number(row.amount_out ?? 0);
              const isIn = inAmt > 0;
              const amount = isIn ? inAmt : outAmt;
              return (
                <View key={row.id} style={styles.txCard}>
                  <View style={[styles.txCardIcon, isIn ? styles.txCardIconIn : styles.txCardIconOut]}>
                    <FontAwesome name={isIn ? "arrow-down" : "arrow-up"} size={14} color={isIn ? Theme.darkGreen : Theme.teslaRed} />
                  </View>
                  <View style={styles.txCardBody}>
                    <Text style={styles.txCardTitle} numberOfLines={1}>{typeLabel}</Text>
                    <Text style={styles.txCardSubtitle} numberOfLines={1}>{dateStr} · {party}</Text>
                  </View>
                  <Text style={[styles.txCardAmount, isIn ? styles.txCardAmountIn : styles.txCardAmountOut]}>
                    {isIn ? "+" : "−"}{formatINR(amount)}
                  </Text>
                </View>
              );
            })}
          </View>
        )}
      </View>

      {/* Assignments Registry (Current Node card + Activity Log; aggregate partner/OTP live inside the block) */}
      <Text style={styles.handshakesLabel}>Assignments Registry</Text>
      <View style={styles.handshakesWrap}>
        {assignmentBlock ? (
          <View style={styles.assignmentBlockWrap}>
            {assignmentBlock}
          </View>
        ) : null}
        <View style={styles.activityWrap}>
          <View style={styles.activitySectionHeader}>
            <FontAwesome name="refresh" size={10} color={Theme.textMuted} />
            <Text style={styles.handshakesLabel}>Activity Log</Text>
          </View>
          {(() => {
            const hasCurrentAssignment = !!(
              trip.driver_id ||
              trip.vehicle_id ||
              (trip.vehicle_display_number ?? "").trim()
            );
            const fallbackRow: TripAssignmentAuditRow | null =
              assignmentAuditRows.length === 0 && hasCurrentAssignment
                ? {
                    id: "fallback",
                    trip_id: trip.id,
                    event_type: "assignment",
                    driver_id_prev: null,
                    driver_id_new: trip.driver_id ?? null,
                    vehicle_id_prev: null,
                    vehicle_id_new: trip.vehicle_id ?? null,
                    changed_at: trip.created_at ?? trip.updated_at ?? new Date().toISOString(),
                    changed_by: null,
                  }
                : null;
            const dedupeKey = (row: TripAssignmentAuditRow) =>
              `${row.changed_at}-${row.event_type}-${row.driver_id_new ?? ""}-${row.vehicle_id_new ?? ""}-${row.changed_by ?? ""}`;
            const seenKeys = new Set<string>();
            const dedupedAuditRows = assignmentAuditRows.filter((row) => {
              const key = dedupeKey(row);
              if (seenKeys.has(key)) return false;
              seenKeys.add(key);
              return true;
            });
            const effectiveRows: TripAssignmentAuditRow[] =
              dedupedAuditRows.length > 0
                ? dedupedAuditRows
                : fallbackRow
                  ? [fallbackRow]
                  : [];

            if (effectiveRows.length === 0) {
              return (
                <Text style={styles.activityEmpty}>
                  No assignment activity recorded
                </Text>
              );
            }

            return (
              <View style={styles.activityTimeline}>
                {effectiveRows.map((row) => {
                  const eventLabel =
                    row.event_type === "reassignment" ? "Reassignment" : "Assignment";
                  const dateStr = formatAssignmentDateActivityMeta(row.changed_at);
                  const isDriverDeclined =
                    row.event_type === "reassignment" &&
                    row.driver_id_prev != null &&
                    row.driver_id_new == null;
                  const byLabel = isDriverDeclined
                    ? ` · ${t("driverRejected")}`
                    : row.changed_by != null
                      ? row.changed_by === currentUserId
                        ? " • BY YOU"
                        : " • BY DISPATCHER"
                      : "";
                  const isFallback = row.id === "fallback";
                  const driverPrev = !isFallback && row.driver_id_prev
                    ? (assignmentDriverNames[row.driver_id_prev] ?? row.driver_id_prev)
                    : null;
                  const driverNew = row.driver_id_new
                    ? (assignmentDriverNames[row.driver_id_new] ?? (isFallback ? (driverName ?? null) : row.driver_id_new))
                    : null;
                  const vehiclePrev = !isFallback && row.vehicle_id_prev
                    ? (assignmentVehicleLabels[row.vehicle_id_prev] ?? row.vehicle_id_prev)
                    : null;
                  const vehicleNew = row.vehicle_id_new
                    ? (assignmentVehicleLabels[row.vehicle_id_new] ?? (isFallback ? (vehicleLabel ?? null) : row.vehicle_id_new))
                    : isFallback && (trip.vehicle_display_number ?? "").trim()
                      ? (trip.vehicle_display_number ?? "").trim()
                      : null;

                  const driverLine =
                    driverPrev != null && driverNew != null
                      ? `Driver: ${driverPrev} → ${driverNew}`
                      : driverNew != null
                        ? `Driver: ${driverNew}`
                        : driverPrev != null
                          ? `Driver: ${driverPrev} (rejected)`
                          : null;
                  const vehicleLine =
                    vehiclePrev != null && vehicleNew != null
                      ? `Vehicle: ${vehiclePrev} → ${vehicleNew}`
                      : vehicleNew != null
                        ? `Vehicle: ${vehicleNew}`
                        : vehiclePrev != null
                          ? `Vehicle: ${vehiclePrev} (rejected)`
                          : null;

                  const detail = [driverLine, vehicleLine].filter(Boolean).join("  ·  ");

                  return (
                    <View key={row.id} style={styles.activityItem}>
                      <View style={styles.activityDot} />
                      <View style={styles.activityCard}>
                        <Text style={styles.activityTitle} numberOfLines={1}>
                          {eventLabel}
                        </Text>
                        <Text style={styles.activityMeta} numberOfLines={1}>
                          {dateStr}
                          {byLabel}
                        </Text>
                        {detail ? (
                          <Text style={styles.activityDetail} numberOfLines={2}>
                            {detail}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  );
                })}
              </View>
            );
          })()}
        </View>
      </View>
    </View>
  );
}

const CARD_PADDING = 16;
const SECTION_GAP = 16;

const styles = StyleSheet.create({
  content: { paddingBottom: 80 },
  trackingCard: {
    backgroundColor: Theme.screenBackground,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    padding: CARD_PADDING,
    marginBottom: SECTION_GAP,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  trackingHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  trackingHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  trackingStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Theme.positive,
  },
  trackingStatusDotOffline: {
    backgroundColor: Theme.negative,
  },
  trackingLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.primary,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  trackingLabelOffline: {
    color: Theme.negative,
  },
  livePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Theme.positiveMuted,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.darkGreen,
  },
  liveDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Theme.darkGreen,
  },
  livePillText: {
    fontSize: 7,
    fontWeight: "700",
    color: Theme.darkGreen,
    textTransform: "uppercase",
  },
  trackingLiveMapBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Theme.surfaceGray,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  trackingLiveMapText: {
    fontSize: 7,
    fontWeight: "700",
    color: Theme.primary,
    textTransform: "uppercase",
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 16,
  },
  progressSegment: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: Theme.surfaceGray,
  },
  progressSegmentActive: {
    backgroundColor: Theme.primary,
  },
  trackingFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  trackingFooterLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    minWidth: 0,
  },
  trackingFooterLabel: {
    fontSize: 7,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    fontStyle: "italic",
    marginBottom: 2,
  },
  trackingFooterValueRow: { flexDirection: "row", alignItems: "center" },
  clockIcon: { marginRight: 6 },
  trackingFooterValueOffline: {
    color: Theme.negative,
  },
  trackingFooterValueAccentOffline: {
    color: Theme.negative,
  },
  trackingFooterValue: {
    fontSize: 10,
    fontWeight: "800",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    flex: 1,
    minWidth: 0,
  },
  trackingFooterRight: {
    alignItems: "flex-end",
    flex: 1,
    minWidth: 0,
  },
  trackingFooterValueAccent: {
    fontSize: 9,
    fontWeight: "800",
    fontStyle: "italic",
    color: Theme.primary,
    textAlign: "right",
  },
  docSection: { marginBottom: SECTION_GAP - 4 },
  docSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  docSectionTitle: {
    fontSize: 8,
    fontWeight: "800",
    color: Theme.textMuted,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    flex: 1,
  },
  docGrid: {
    flexDirection: "row",
    gap: 8,
  },
  docCard: {
    flex: 1,
    minWidth: 0,
    minHeight: 116,
    backgroundColor: Theme.screenBackground,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "flex-start",
  },
  docCardIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  docCardIconWrapUploaded: {
    backgroundColor: "rgba(79,108,255,0.08)",
  },
  docCardIconWrapPending: {
    backgroundColor: Theme.surfaceGray,
  },
  docCardLabel: {
    fontSize: 8,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    textAlign: "center",
    textTransform: "uppercase",
    letterSpacing: 0.3,
    minHeight: 20,
  },
  docCardType: {
    fontSize: 8,
    fontWeight: "600",
    color: Theme.textMuted,
    marginTop: 1,
    marginBottom: 4,
  },
  docCardStatus: {
    marginTop: 0,
  },
  financeCard: {
    backgroundColor: Theme.screenBackground,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    padding: CARD_PADDING,
    marginBottom: SECTION_GAP,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  financeHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  financeTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  financeSubtitle: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
    marginTop: 2,
  },
  financeProfitWrap: {
    alignItems: "flex-end",
  },
  financeProfitLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.darkGreen,
    textTransform: "uppercase",
  },
  financeProfitValue: {
    fontSize: 16,
    fontWeight: "800",
    color: Theme.darkGreen,
    marginTop: 2,
  },
  financeSection: {
    marginBottom: 0,
  },
  financeSectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    marginBottom: 10,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  financeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  financeLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textSecondary,
  },
  financeValue: {
    fontSize: 13,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  financeAdjustmentsWrap: {
    backgroundColor: Theme.surfaceGray,
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
  },
  financeAdjRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
  financeAdjReason: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textSecondary,
    flex: 1,
    marginRight: 8,
  },
  financeAdjRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  financeAdjAmount: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  financeAdjRemoveBtn: {
    marginLeft: 8,
    padding: 4,
  },
  financeTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Theme.borderLight,
    marginBottom: 12,
  },
  financeTotalLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  financeTotalValue: {
    fontSize: 14,
    fontWeight: "900",
    color: Theme.textPrimaryDark,
  },
  financeStatusBox: {
    flexDirection: "row",
    backgroundColor: Theme.surfaceGray,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    padding: 12,
  },
  financeStatusCol: {
    flex: 1,
  },
  financeStatusColRight: {
    flex: 1,
    alignItems: "flex-end",
  },
  financeStatusDivider: {
    width: 1,
    backgroundColor: Theme.borderLight,
    marginHorizontal: 12,
  },
  financeStatusLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textMuted,
    marginBottom: 4,
    textTransform: "uppercase",
  },
  financeStatusValueGreen: {
    fontSize: 13,
    fontWeight: "800",
    color: Theme.darkGreen,
  },
  financeStatusValueDark: {
    fontSize: 13,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  financeStatusValue: {
    fontSize: 13,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  financeStatusValueRed: {
    color: Theme.teslaRed,
  },
  financeSectionDivider: {
    height: 1,
    backgroundColor: Theme.borderLight,
    marginVertical: 16,
  },
  financeFooter: {
    marginTop: 12,
    gap: 12,
  },
  financeAddBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 12,
    paddingVertical: 10,
  },
  financeAddBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  financeCommissionsWrap: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: Theme.surfaceGray,
    padding: 10,
    borderRadius: 10,
  },
  financeCommissionText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textSecondary,
    textTransform: "uppercase",
  },
  handshakesLabel: {
    fontSize: 8,
    fontWeight: "500",
    color: Theme.textMuted,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    fontStyle: "italic",
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  assignmentBlockWrap: {
    marginBottom: 12,
  },
  activityWrap: {
    marginTop: 12,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: Theme.borderLight,
  },
  activitySectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  activityHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  activityHeaderText: {
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textMuted,
    letterSpacing: 1.0,
    textTransform: "uppercase",
  },
  activityEmpty: {
    fontSize: 11,
    fontWeight: "400",
    color: Theme.textMuted,
    fontStyle: "italic",
    paddingHorizontal: 2,
    paddingBottom: 6,
  },
  activityTimeline: {
    gap: 10,
    paddingLeft: 2,
  },
  activityItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  activityDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Theme.borderLight,
    marginTop: 10,
  },
  activityCard: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  activityTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  activityMeta: {
    marginTop: 4,
    fontSize: 9,
    fontWeight: "400",
    color: Theme.textMuted,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  activityDetail: {
    marginTop: 6,
    fontSize: 10,
    fontWeight: "400",
    color: Theme.textMuted,
  },
  handshakesWrap: {
    backgroundColor: Theme.surfaceGray,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    padding: 12,
  },
  handshakesEmpty: {
    fontSize: 8,
    fontWeight: "400",
    color: Theme.textSection,
    textAlign: "center",
    fontStyle: "italic",
    paddingVertical: 24,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  txList: { gap: 8 },
  txCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Theme.screenBackground,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  txCardIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  txCardIconIn: { backgroundColor: Theme.positiveMuted },
  txCardIconOut: { backgroundColor: "#FFF1F2" },
  assignmentCardIcon: { backgroundColor: "rgba(59, 130, 246, 0.12)" },
  txCardBody: { flex: 1, minWidth: 0 },
  txCardTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
  },
  txCardSubtitle: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textMuted,
    marginTop: 2,
    textTransform: "uppercase",
  },
  assignmentDetailLine: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textSecondary,
    marginTop: 4,
  },
  txCardAmount: { fontSize: 12, fontWeight: "800", fontStyle: "italic" },
  txCardAmountIn: { color: Theme.darkGreen },
  txCardAmountOut: { color: Theme.teslaRed },
});
