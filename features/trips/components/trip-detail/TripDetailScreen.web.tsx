/**
 * Web Trip Detail — two-tab layout.
 * "Tracking" tab (default): TripInfo + Assignment + Timeline + Map + LR Docs
 * "Finance" tab: Expenses + Finance Overview + Receivables
 */
import { CenteredLoadingView } from "@/components/CenteredLoadingView";
import { ThemedAlertModal } from "@/components/ThemedAlertModal";
import { LeafletMap } from "@/components/driver/LeafletMap.web";
import { useLanguage } from "@/contexts/LanguageContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { TripRatingsBlock } from "@/features/ratings/components/TripRatingsBlock";
import { isAggregateTrip } from "@/lib/driverUtils";
import { formatINR } from "@/lib/format";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getTripDisplayNumber } from "../../services/trips.service";
import { TripAdjustmentModal } from "./TripAdjustmentModal";
import type { TripDetailScreenProps } from "./TripDetailScreen";
import { useTripDetail } from "./hooks/useTripDetail";
import { ExpensesTable, type ExpenseRow } from "./sections/ExpensesTable";
import { FinanceOverview } from "./sections/FinanceOverview";
import { LRDocumentsSection } from "./sections/LRDocumentsSection";
import { TripInfoCard } from "./sections/TripInfoCard";
import { TripStatusTimeline, type TripStageTimestamp } from "./sections/TripStatusTimeline";
import { TruckAssignmentCard } from "./sections/TruckAssignmentCard";

type Tab = "tracking" | "finance";

export default function TripDetailScreen({
  tripId,
  entryContext,
  clientIdFromContext,
  clientNameFromContext,
  onBack,
}: TripDetailScreenProps) {
  const insets = useSafeAreaInsets();
  const { currentOrganization } = useOrganization();
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<Tab>("tracking");

  const detail = useTripDetail({
    tripId,
    entryContext,
    clientIdFromContext,
    clientNameFromContext,
    onBack,
  });

  if (detail.loading && !detail.trip) {
    return <CenteredLoadingView message="Loading trip…" />;
  }

  if (detail.error || !detail.trip) {
    return (
      <View style={styles.errorWrap}>
        <Text style={styles.errorText}>{detail.error ?? "Trip not found"}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={detail.load} activeOpacity={0.8}>
          <FontAwesome name="refresh" size={14} color="#fff" style={{ marginRight: 8 }} />
          <Text style={styles.retryBtnText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const { trip } = detail;
  const isAggregate = isAggregateTrip(trip);

  // ── Stage timestamps ──────────────────────────────────────────────────────────
  const stageTimestamps: TripStageTimestamp[] = [];
  if (trip.pickup_date)
    stageTimestamps.push({ stageKey: "confirmed", timestamp: trip.pickup_date });
  if (trip.started_at)
    stageTimestamps.push({ stageKey: "intransit", timestamp: trip.started_at });
  if (trip.completed_at)
    stageTimestamps.push({ stageKey: "pod_received", timestamp: trip.completed_at });

  const stageLocations: Partial<Record<string, string>> = {
    confirmed: trip.pickup_area?.trim() || undefined,
    s_in: trip.pickup_area?.trim() || undefined,
    s_out: trip.pickup_area?.trim() || undefined,
    d_in: trip.drop_location?.trim() || undefined,
    d_out: trip.drop_location?.trim() || undefined,
  };

  // ── Expense rows ──────────────────────────────────────────────────────────────
  const expenseRows: ExpenseRow[] = detail.tripLedgerEntries
    .filter((e) => Number(e.amount_out ?? 0) > 0)
    .map((e, idx) => ({
      id: e.id,
      date: new Date(e.transaction_date).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }),
      expenseId: `EXP${String(idx + 1488).padStart(4, "0")}`,
      category: e.primary_category ?? "Petty Cash",
      type: e.contact_type ?? e.party_name ?? "—",
      description: e.description ?? "—",
      amount: Number(e.amount_out),
      status: (
        e.reconciliation_status === "reconciled"
          ? "Paid"
          : e.reconciliation_status === "mismatch"
            ? "Requested"
            : "Pending"
      ) as ExpenseRow["status"],
    }));

  // ── Finance numbers ───────────────────────────────────────────────────────────
  const baseFreight = Number(trip.client_price ?? 0);
  const totalExpenses = expenseRows.reduce((s, r) => s + r.amount, 0);
  const additionalIncome = detail.adjustments
    .filter((a) => a.type === "revenue" && a.impact === "plus")
    .reduce((s, a) => s + a.amount, 0);
  const deductions = detail.adjustments
    .filter((a) => a.type === "revenue" && a.impact === "minus")
    .reduce((s, a) => s + a.amount, 0);

  const sales = Number(trip.client_price ?? 0);
  const received = detail.tripLedgerEntries.reduce(
    (s, tx) => s + Number(tx.amount_in ?? 0),
    0,
  );
  const pending = Math.max(0, sales - received);

  // For supplier, we assume client_price is our cost, supplier_rate is what we owe our supplier
  const supplierCost = Number(trip.client_price ?? 0) || Number(trip.supplier_rate ?? 0);
  const supplierPaid = detail.tripLedgerEntries.reduce(
    (s, tx) => s + Number(tx.amount_out ?? 0),
    0,
  );
  const supplierDue = Math.max(0, supplierCost - supplierPaid);

  // ── Map ───────────────────────────────────────────────────────────────────────
  const hasOrigin = !!detail.trackingMapOriginCoordinate;
  const hasDest = !!detail.trackingMapDestinationCoordinate;
  const mapCenter = hasOrigin
    ? {
        latitude: detail.trackingMapOriginCoordinate!.latitude,
        longitude: detail.trackingMapOriginCoordinate!.longitude,
      }
    : { latitude: 20.5937, longitude: 78.9629 };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>

      {/* ── Dark top navigation bar ───────────────────────────────────────────── */}
      <View style={styles.navBar}>
        <View style={styles.navLeft}>
          <TouchableOpacity onPress={onBack} style={styles.navBackBtn} activeOpacity={0.8}>
            <FontAwesome name="chevron-left" size={12} color="#94a3b8" />
            <Text style={styles.navBackText}>Back</Text>
          </TouchableOpacity>
          <View style={styles.navTitleWrap}>
            <Text style={styles.navTitle}>{getTripDisplayNumber(trip)}</Text>
            <View style={[styles.navPill, isAggregate ? styles.navPillAggregate : styles.navPillAsset]}>
              <Text style={styles.navPillText}>{isAggregate ? "AGGREGATE" : "ASSET"}</Text>
            </View>
          </View>
        </View>
        <View style={styles.navActions}>
          <NavAction icon="plus" label="Add Expense" onPress={detail.handleAddAdjustment} />
          <NavAction icon="pencil" label="Edit Trip" onPress={() => {}} />
          <NavAction icon="trash" label="Delete Trip" onPress={() => {}} danger />
          <NavAction icon="file-text-o" label="Generate Memo" onPress={() => {}} primary />
        </View>
      </View>

      {/* ── Tab bar ───────────────────────────────────────────────────────────── */}
      <View style={styles.tabBar}>
        <TabButton
          label="Tracking"
          icon="map-marker"
          active={activeTab === "tracking"}
          onPress={() => setActiveTab("tracking")}
        />
        <TabButton
          label="Finance"
          icon="bar-chart"
          active={activeTab === "finance"}
          onPress={() => setActiveTab("finance")}
        />
      </View>

      {/* ── Scrollable content ────────────────────────────────────────────────── */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={detail.refreshing} onRefresh={detail.handleRefresh} />
        }
      >

        {/* ════════════════════ TRACKING TAB ════════════════════ */}
        {activeTab === "tracking" && (
          <>
            {/* Main row — stretch so left and right reach equal height */}
            <View style={styles.trackingTopRow}>

              {/* Left col: TripInfoCard (top) + LR & Documents (grows to fill) */}
              <View style={styles.infoCol}>
                <TripInfoCard
                  trip={trip}
                  clientName={detail.displayClientName}
                  currentStageLabel={isAggregate ? "AGGREGATE" : undefined}
                />
                <TruckAssignmentCard
                  trip={trip}
                  vehicleLabel={
                    isAggregate
                      ? detail.displayVehicleFromInput.trim() || detail.vehicleLabel
                      : detail.vehicleLabel
                  }
                  driverName={detail.driverName}
                  isDriverOnline={!detail.isDriverOffline}
                  canAssign={detail.canAssign}
                  onChangeDriver={() => setActiveTab("finance")}
                  onViewVehicleDetails={() => setActiveTab("finance")}
                />
                <View style={styles.lrGrow}>
                  <LRDocumentsSection
                    docs={detail.computedTripDocs
                      .filter((d) => d?.status === "Uploaded")
                      .map((d) => ({
                        id: d.id,
                        label: d.label,
                        type: d.type,
                        status: "Uploaded" as const,
                        onView: d.storagePath ? () => detail.setSelectedDoc(d) : undefined,
                      }))}
                    onUpdateLR={() => detail.setShowAdjustmentModal(true)}
                    onAddDocument={() => detail.setShowAdjustmentModal(true)}
                  />
                </View>
              </View>

              {/* Right col: Timeline with Live Map embedded */}
              <View style={styles.trackingRightCol}>
                <TripStatusTimeline
                  trip={trip}
                  stageTimestamps={stageTimestamps}
                  stageLocations={stageLocations}
                  lastUpdatedAt={trip.updated_at}
                  canAdvance={detail.canAssign}
                  distanceKm={trip.distance ? String(trip.distance) : undefined}
                  mapPreview={
                    <LeafletMap
                      style={{ width: "100%", height: 600 }}
                      center={mapCenter}
                      zoom={6}
                      markers={(
                        [
                          hasOrigin
                            ? {
                                id: "origin",
                                coordinate: {
                                  latitude: detail.trackingMapOriginCoordinate!.latitude,
                                  longitude: detail.trackingMapOriginCoordinate!.longitude,
                                },
                                label: trip.pickup_area ?? "Origin",
                              }
                            : null,
                          hasDest
                            ? {
                                id: "dest",
                                coordinate: {
                                  latitude: detail.trackingMapDestinationCoordinate!.latitude,
                                  longitude: detail.trackingMapDestinationCoordinate!.longitude,
                                },
                                label: trip.drop_location ?? "Destination",
                              }
                            : null,
                        ].filter(Boolean)
                      ) as any}
                    />
                  }
                />
              </View>
            </View>

            {/* Feedback / Ratings section */}
            {currentOrganization?.id && (
              <View style={styles.feedbackWrap}>
                {detail.tripCompleted ? (
                  <TripRatingsBlock
                    trip={trip}
                    organizationId={currentOrganization.id}
                    partnerName={detail.partnerName}
                    driverName={detail.driverName}
                    driverAvatarUri={detail.driverAvatarUri}
                    clientName={detail.displayClientName ?? trip.client_name ?? null}
                    paymentCaptured={detail.tripLedgerEntries.some(
                      (row) => row.contact_type === "client" && Number(row.amount_in ?? 0) > 0,
                    )}
                  />
                ) : (
                  <FeedbackPlaceholder />
                )}
              </View>
            )}
          </>
        )}

        {/* ════════════════════ FINANCE TAB ════════════════════ */}
        {activeTab === "finance" && (
          <>
            {/* Expenses table — full width */}
            <ExpensesTable
              expenses={expenseRows}
              totalAmount={totalExpenses}
              onAddExpense={detail.handleAddAdjustment}
            />

            <View style={styles.financeContentRow}>
              <View style={styles.financeOverviewCol}>
                <FinanceOverview
                  baseFreight={baseFreight}
                  totalExpenses={totalExpenses}
                  additionalIncome={additionalIncome}
                  deductions={deductions}
                  expenseDetails={expenseRows.map((e) => ({ label: e.description, amount: e.amount }))}
                  incomeDetails={detail.adjustments
                    .filter((a) => a.type === "revenue" && a.impact === "plus")
                    .map((a) => ({ label: a.reason, amount: a.amount }))}
                  deductionDetails={detail.adjustments
                    .filter((a) => a.type === "revenue" && a.impact === "minus")
                    .map((a) => ({ label: a.reason, amount: a.amount }))}
                  onAddIncome={detail.handleAddAdjustment}
                  onAddDeduction={detail.handleAddAdjustment}
                />
              </View>
              <View style={styles.financeSummaryCol}>
                {/* INNER BLACK CARD (TRANSACTION) */}
                <View style={styles.transactionHistoryCard}>
                  {/* Stats Top Row */}
                  <View style={styles.summaryCardRow}>
                    <View style={styles.summaryCardItem}>
                      <Text style={styles.summaryCardLabel}>SALE</Text>
                      <Text style={styles.summaryCardValue}>{formatINR(25000)}</Text>
                    </View>
                    <View style={styles.summaryCardItem}>
                      <Text style={styles.summaryCardLabel}>RECEIVED</Text>
                      <Text style={[styles.summaryCardValue, styles.summaryCardValueGreen]}>{formatINR(5000)}</Text>
                    </View>
                    <View style={styles.summaryCardItem}>
                      <Text style={styles.summaryCardLabel}>DUE</Text>
                      <Text style={[styles.summaryCardValue, styles.summaryCardValueRed]}>{formatINR(20000)}</Text>
                    </View>
                  </View>

                  {/* Transaction History Wrapper */}
                  <View>
                    <Text style={styles.transactionHistoryHeader}>TRANSACTION HISTORY</Text>
                    {/* Transaction Item 1 */}
                    <View style={styles.transactionRow}>
                      <View style={[styles.transactionIconWrap, styles.transactionIconIn]}>
                        <FontAwesome name="arrow-down" size={12} color="#fff" />
                      </View>
                      <View style={styles.transactionInfo}>
                        <Text style={styles.transactionText1}>Customer payment</Text>
                        <Text style={styles.transactionText2}>09 MAR 2026 • DAVID TAYLOR</Text>
                      </View>
                      <Text style={[styles.transactionAmount, styles.transactionAmountIn]}>+ {formatINR(5000)}</Text>
                    </View>

                    {/* Transaction Item 2 */}
                    <View style={styles.transactionRow}>
                      <View style={[styles.transactionIconWrap, styles.transactionIconOut]}>
                        <FontAwesome name="arrow-up" size={12} color="#fff" />
                      </View>
                      <View style={styles.transactionInfo}>
                        <Text style={styles.transactionText1}>Supplier payment</Text>
                        <Text style={styles.transactionText2}>07 MAR 2026 • KATE BELL</Text>
                      </View>
                      <Text style={[styles.transactionAmount, styles.transactionAmountOut]}>− {formatINR(3000)}</Text>
                    </View>
                  </View>
                </View>
              </View>
            </View>

          </>
        )}

        <View style={{ height: 48 }} />
      </ScrollView>

      {/* ── Modals ────────────────────────────────────────────────────────────── */}
      <TripAdjustmentModal
        visible={detail.showAdjustmentModal}
        onClose={() => detail.setShowAdjustmentModal(false)}
        onSave={detail.handleSaveAdjustment}
      />
      <ThemedAlertModal
        visible={detail.showDriverRejectedModal}
        title="Driver Rejected"
        message="The assigned driver has rejected this trip."
        onOk={() => detail.setShowDriverRejectedModal(false)}
        variant="warning"
      />
    </View>
  );
}

// ── Feedback placeholder (trip not yet completed) ─────────────────────────────

function FeedbackPlaceholder() {
  return (
    <View style={fbStyles.card}>
      <View style={fbStyles.header}>
        <FontAwesome name="star" size={14} color="#f59e0b" />
        <Text style={fbStyles.title}>Trip Feedback & Ratings</Text>
      </View>
      <View style={fbStyles.body}>
        <FontAwesome name="clock-o" size={28} color="#d1d5db" />
        <Text style={fbStyles.message}>Feedback available once the trip is completed</Text>
        <Text style={fbStyles.sub}>Ratings for driver performance, client satisfaction, and trip quality will appear here.</Text>
      </View>
    </View>
  );
}

const fbStyles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  title: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
  },
  body: {
    paddingVertical: 36,
    paddingHorizontal: 20,
    alignItems: "center",
    gap: 10,
  },
  message: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    textAlign: "center",
  },
  sub: {
    fontSize: 12,
    color: "#9ca3af",
    textAlign: "center",
    maxWidth: 420,
  },
});

// ── Tab button ─────────────────────────────────────────────────────────────────

function TabButton({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon: React.ComponentProps<typeof FontAwesome>["name"];
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.tabBtn, active && styles.tabBtnActive]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <FontAwesome name={icon} size={13} color={active ? "#2563eb" : "#6b7280"} />
      <Text style={[styles.tabBtnText, active && styles.tabBtnTextActive]}>{label}</Text>
      {active && <View style={styles.tabUnderline} />}
    </TouchableOpacity>
  );
}

// ── Nav action button ──────────────────────────────────────────────────────────

function NavAction({
  icon,
  label,
  onPress,
  primary,
  danger,
}: {
  icon: React.ComponentProps<typeof FontAwesome>["name"];
  label: string;
  onPress?: () => void;
  primary?: boolean;
  danger?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.navActionBtn,
        primary && styles.navActionBtnPrimary,
        danger && styles.navActionBtnDanger,
      ]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <FontAwesome
        name={icon}
        size={12}
        color={primary ? "#fff" : danger ? "#ef4444" : "#94a3b8"}
      />
      <Text
        style={[
          styles.navActionText,
          primary && styles.navActionTextPrimary,
          danger && styles.navActionTextDanger,
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#f1f5f9",
  },

  // ── Dark nav ──
  navBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingVertical: 14,
    backgroundColor: "#0f141a",
    flexWrap: "wrap",
    gap: 12,
  },
  navLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  navBackBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#334155",
  },
  navBackText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#94a3b8",
  },
  navTitleWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  navTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#f8fafc",
  },
  navPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  navPillAsset: { backgroundColor: "#1e3a5f" },
  navPillAggregate: { backgroundColor: "#3b2e00" },
  navPillText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#94a3b8",
    letterSpacing: 0.5,
  },
  navActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  navActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#334155",
    backgroundColor: "#1e293b",
  },
  navActionBtnPrimary: {
    backgroundColor: "#2563eb",
    borderColor: "#2563eb",
  },
  navActionBtnDanger: {
    borderColor: "#7f1d1d",
    backgroundColor: "#1e293b",
  },
  navActionText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#94a3b8",
  },
  navActionTextPrimary: { color: "#fff" },
  navActionTextDanger: { color: "#ef4444" },

  // ── Tab bar ──
  tabBar: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    paddingHorizontal: 24,
  },
  tabBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingVertical: 14,
    paddingHorizontal: 4,
    marginRight: 28,
    position: "relative",
  },
  tabBtnActive: {},
  tabBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6b7280",
  },
  tabBtnTextActive: {
    color: "#2563eb",
  },
  tabUnderline: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: "#2563eb",
    borderRadius: 1,
  },

  // ── Scroll ──
  scroll: { flex: 1 },
  scrollContent: {
    padding: 20,
    gap: 20,
  },

  // ── Tracking tab layout ──
  trackingTopRow: {
    flexDirection: "row",
    gap: 20,
    alignItems: "stretch",
    minHeight: 620,
    flexWrap: "wrap",
  },
  infoCol: {
    flex: 1,
    flexShrink: 0,
    gap: 16,
  },
  lrGrow: {
    flex: 1,
  },
  trackingRightCol: {
    flex: 1,
    minWidth: 0,
  },
  assignTimelineRow: {
    flexDirection: "row",
    gap: 16,
    alignItems: "flex-start",
    flex: 1,
  },
  truckCol: {
    width: "36%",
    flexShrink: 0,
    minWidth: 240,
  },
  timelineCol: {
    flex: 1,
    minWidth: 0,
  },
  feedbackWrap: {
    marginTop: 4,
  },

  // ── Finance tab layout ──
  financeRow: {
    flexDirection: "row",
    gap: 20,
    alignItems: "flex-start",
  },
  financeContentRow: {
    flexDirection: "row",
    gap: 20,
    alignItems: "flex-start",
  },
  financeOverviewCol: {
    flex: 7,
    minWidth: 0,
  },
  financeSummaryCol: {
    flex: 3,
    minWidth: 0,
  },
  darkSection: {
    backgroundColor: "#fff",
    borderRadius: 6,
    marginBottom: 6,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  darkSectionTitle: {
    fontSize: 9,
    fontWeight: "700",
    color: "#fff",
    letterSpacing: 1,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: "#0f141a",
    textTransform: "uppercase",
  },
  detailBody: {
    backgroundColor: "#fff",
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  detailLabel: {
    fontSize: 8,
    fontWeight: "700",
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  detailValue: { fontSize: 10, fontWeight: "600", color: "#111827" },
  detailValueRed: { color: "#ef4444" },
  detailValueBoldItalic: { fontSize: 10, fontWeight: "700", color: "#111827", fontStyle: "italic" },
  detailValueBold: { fontSize: 10, fontWeight: "700", color: "#111827" },
  detailValueGreen: { color: "#15803d" },
  twoColRow: {
    flexDirection: "row",
    marginBottom: 8,
    gap: 10,
  },
  twoColItem: { flex: 1, minWidth: 0 },
  summaryCard: {
    backgroundColor: "#0f141a",
    borderRadius: 6,
    marginBottom: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: "#334155",
  },
  summaryCardRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  summaryCardItem: { flex: 1, alignItems: "flex-start" },
  summaryCardLabel: {
    fontSize: 8,
    fontWeight: "700",
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 3,
  },
  summaryCardValue: { fontSize: 11, fontWeight: "700", color: "#f8fafc" },
  summaryCardValueGreen: { color: "#22c55e" },
  summaryCardValueRed: { color: "#ef4444" },
  transactionHistoryCard: {
    backgroundColor: "#0f141a",
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#334155",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  transactionHistoryHeader: {
    fontSize: 10,
    fontWeight: "800",
    color: "#94a3b8",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 12,
  },
  transactionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
    backgroundColor: "#1e293b",
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: "#334155",
  },
  transactionIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  transactionIconIn: {
    backgroundColor: "#16a34a",
  },
  transactionIconOut: {
    backgroundColor: "#dc2626",
  },
  transactionInfo: { flex: 1, minWidth: 0 },
  transactionText1: { fontSize: 13, fontWeight: "600", color: "#f8fafc" },
  transactionText2: { fontSize: 11, color: "#94a3b8", marginTop: 2 },
  transactionAmount: { fontSize: 13, fontWeight: "700" },
  transactionAmountIn: { color: "#22c55e" },
  transactionAmountOut: { color: "#ef4444" },

  // ── Error ──
  errorWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  errorText: { fontSize: 15, color: "#6b7280" },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#111827",
  },
  retryBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
  },
});
