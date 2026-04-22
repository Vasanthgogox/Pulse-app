/**
 * Web Trip Detail — two-tab layout.
 * "Tracking" tab (default): TripInfo + Assignment + Timeline + Map + LR Docs
 * "Finance" tab: FinanceOverview (left) + Financial Ledger + Expenses List (right)
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
import type { LedgerRow } from "@/features/finance/services/finance.service";
import type { TripAdjustment } from "../../services/tripAdjustments";
import { getTripDisplayNumber } from "../../services/trips.service";
import { TripAdjustmentModal } from "./TripAdjustmentModal";
import type { TripDetailScreenProps } from "./TripDetailScreen";
import { useTripDetail } from "./hooks/useTripDetail";
import type { ExpenseRow } from "./sections/ExpensesTable";
import { FinanceOverview } from "./sections/FinanceOverview";
import { LRDocumentsSection } from "./sections/LRDocumentsSection";
import { TripInfoCard } from "./sections/TripInfoCard";
import { TripStatusTimeline, type TripStageTimestamp } from "./sections/TripStatusTimeline";
import { TruckAssignmentCard } from "./sections/TruckAssignmentCard";

type Tab = "tracking" | "finance";

function formatLedgerDate(s: string | null | undefined) {
  if (!s) return "—";
  const d = s.slice(0, 10);
  const [y, m, day] = d.split("-");
  const months = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");
  const mi = Number(m);
  if (!y || !day || !Number.isFinite(mi) || mi < 1 || mi > 12) return "—";
  return `${day} ${months[mi - 1]} ${y}`;
}

function ledgerHistoryTitle(tx: LedgerRow, isIn: boolean) {
  const desc = tx.description?.trim();
  if (desc) return desc;
  if (isIn && tx.contact_type === "client") return "Customer payment";
  if (!isIn && tx.contact_type === "supplier") return "Supplier payment";
  if (!isIn && tx.contact_type === "driver") return "Driver payment";
  return isIn ? "Cash in" : "Cash out";
}

function adjustmentsCountingAsIncome(adjustments: TripAdjustment[]) {
  return adjustments.filter(
    (a) =>
      (a.type === "revenue" && a.impact === "plus") ||
      (a.type === "cost" && a.impact === "minus"),
  );
}

function adjustmentsCountingAsDeductions(adjustments: TripAdjustment[]) {
  return adjustments.filter(
    (a) =>
      (a.type === "revenue" && a.impact === "minus") ||
      (a.type === "cost" && a.impact === "plus"),
  );
}

function adjustmentIncomeLineLabel(a: TripAdjustment) {
  if (a.type === "cost") return `${a.reason} (supplier credit)`;
  return a.reason;
}

function adjustmentDeductionLineLabel(a: TripAdjustment) {
  if (a.type === "cost") return `${a.reason} (supplier charge)`;
  return a.reason;
}

export default function TripDetailScreen({
  tripId,
  entryContext,
  clientIdFromContext,
  clientNameFromContext,
  onBack,
}: TripDetailScreenProps) {
  const insets = useSafeAreaInsets();
  const { currentOrganization } = useOrganization();
  const { t: _t } = useLanguage();
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
    .map((e) => ({
      id: e.id,
      date: new Date(e.transaction_date).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }),
      expenseId: e.id.replace(/-/g, "").slice(0, 10).toUpperCase(),
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
  const incomeAdjustmentRows = adjustmentsCountingAsIncome(detail.adjustments);
  const deductionAdjustmentRows = adjustmentsCountingAsDeductions(detail.adjustments);
  const additionalIncome = incomeAdjustmentRows.reduce((s, a) => s + a.amount, 0);
  const deductions = deductionAdjustmentRows.reduce((s, a) => s + a.amount, 0);

  const sales = Number(trip.client_price ?? 0);
  const received = detail.tripLedgerEntries.reduce(
    (s, tx) => s + Number(tx.amount_in ?? 0),
    0,
  );
  const pending = Math.max(0, sales - received);

  const supplierPaid = detail.tripLedgerEntries.reduce(
    (s, tx) => s + Number(tx.amount_out ?? 0),
    0,
  );
  const supplierDue = Math.max(0, totalExpenses - supplierPaid);

  type FinanceHistoryRow = { key: string; tx: LedgerRow; isIn: boolean; amount: number };
  const financeHistoryRows: FinanceHistoryRow[] = (() => {
    const rows: FinanceHistoryRow[] = [];
    for (const tx of detail.tripLedgerEntries) {
      const inAmt = Number(tx.amount_in ?? 0);
      const outAmt = Number(tx.amount_out ?? 0);
      if (inAmt > 0) rows.push({ key: `${tx.id}-in`, tx, isIn: true, amount: inAmt });
      if (outAmt > 0) rows.push({ key: `${tx.id}-out`, tx, isIn: false, amount: outAmt });
    }
    rows.sort((a, b) => {
      const da = new Date(a.tx.transaction_date || a.tx.created_at).getTime();
      const db = new Date(b.tx.transaction_date || b.tx.created_at).getTime();
      return db - da;
    });
    return rows;
  })();

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

      {/* ── Dark navigation bar ─────────────────────────────────────────────── */}
      <View style={styles.navBar}>
        <View style={styles.navLeft}>
          <TouchableOpacity onPress={onBack} style={styles.navBackBtn} activeOpacity={0.8}>
            <FontAwesome name="chevron-left" size={11} color="#94a3b8" />
            <Text style={styles.navBackText}>Back</Text>
          </TouchableOpacity>
          <View style={styles.navTitleWrap}>
            <View style={styles.navIconBubble}>
              <FontAwesome name="truck" size={12} color="#fff" />
            </View>
            <Text style={styles.navTitle}>{getTripDisplayNumber(trip)}</Text>
            <View style={[styles.navPill, isAggregate ? styles.navPillAggregate : styles.navPillAsset]}>
              <Text style={styles.navPillText}>{isAggregate ? "AGGREGATE" : "ASSET"}</Text>
            </View>
          </View>
        </View>
        <View style={styles.navActions}>
          <NavAction icon="plus" label="Add Expense" onPress={detail.openAddExpense} />
          <NavAction icon="pencil" label="Edit Trip" onPress={() => {}} />
          <NavAction icon="trash" label="Delete" onPress={() => {}} danger />
          <NavAction icon="file-text-o" label="Generate Memo" onPress={() => {}} primary />
        </View>
      </View>

      {/* ── Tab bar ─────────────────────────────────────────────────────────── */}
      <View style={styles.tabBar}>
        <TabButton
          label="Tracking"
          icon="location-arrow"
          active={activeTab === "tracking"}
          onPress={() => setActiveTab("tracking")}
        />
        <TabButton
          label="Finance"
          icon="pie-chart"
          active={activeTab === "finance"}
          onPress={() => setActiveTab("finance")}
        />
      </View>

      {/* ── Scrollable content ───────────────────────────────────────────────── */}
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
            <View style={styles.trackingTopRow}>

              {/* Left col: TripInfoCard + TruckAssignment + LR Docs */}
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
                  />
                </View>
              </View>

              {/* Right col: Timeline with embedded Live Map */}
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

            {/* Feedback / Ratings */}
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
          <View style={styles.financeColsRow}>

            {/* Left col: Finance Overview */}
            <View style={styles.financeLeftCol}>
              <FinanceOverview
                baseFreight={baseFreight}
                totalExpenses={totalExpenses}
                additionalIncome={additionalIncome}
                deductions={deductions}
                expenseDetails={expenseRows.map((e) => ({ label: e.description, amount: e.amount }))}
                incomeDetails={incomeAdjustmentRows.map((a) => ({
                  label: adjustmentIncomeLineLabel(a),
                  amount: a.amount,
                }))}
                deductionDetails={deductionAdjustmentRows.map((a) => ({
                  label: adjustmentDeductionLineLabel(a),
                  amount: a.amount,
                }))}
                onAddIncome={detail.openLedgerSyncForTripIncome}
                onAddDeduction={detail.openClientDeductionAdjustment}
              />
            </View>

            {/* Right col: Dark Ledger + Expense List */}
            <View style={styles.financeRightCol}>

              {/* Financial Ledger dark card */}
              <LedgerCard
                sales={sales}
                received={received}
                pending={pending}
                totalExpenses={totalExpenses}
                supplierPaid={supplierPaid}
                supplierDue={supplierDue}
                financeHistoryRows={financeHistoryRows}
              />

              {/* Expense List card */}
              <ExpenseListCard expenses={expenseRows} onAddExpense={detail.openAddExpense} />
            </View>
          </View>
        )}

        <View style={{ height: 48 }} />
      </ScrollView>

      {/* ── Modals ──────────────────────────────────────────────────────────── */}
      <TripAdjustmentModal
        visible={detail.showAdjustmentModal}
        preset={detail.adjustmentModalPreset}
        onClose={detail.closeTripAdjustmentModal}
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

// ── Financial Ledger Card (dark) ───────────────────────────────────────────────

type FinanceHistoryRow = { key: string; tx: LedgerRow; isIn: boolean; amount: number };

function LedgerCard({
  sales,
  received,
  pending,
  totalExpenses,
  supplierPaid,
  supplierDue,
  financeHistoryRows,
}: {
  sales: number;
  received: number;
  pending: number;
  totalExpenses: number;
  supplierPaid: number;
  supplierDue: number;
  financeHistoryRows: FinanceHistoryRow[];
}) {
  return (
    <View style={ldStyles.card}>
      {/* Header */}
      <View style={ldStyles.header}>
        <View style={ldStyles.headerLeft}>
          <FontAwesome name="book" size={12} color="#3b82f6" />
          <Text style={ldStyles.headerTitle}>FINANCIAL LEDGER</Text>
        </View>
        <View style={ldStyles.syncBadge}>
          <Text style={ldStyles.syncText}>Synced</Text>
        </View>
      </View>

      {/* Sale / Received / Due */}
      <View style={ldStyles.statRow}>
        <View style={ldStyles.statGroup}>
          <Text style={ldStyles.statLabel}>Sale</Text>
          <Text style={ldStyles.statValue}>{formatINR(sales)}</Text>
        </View>
        <View style={ldStyles.statDivider} />
        <View style={ldStyles.statGroup}>
          <View style={ldStyles.statLabelRow}>
            <View style={ldStyles.greenDot} />
            <Text style={[ldStyles.statLabel, ldStyles.statLabelGreen]}>Received</Text>
          </View>
          <Text style={[ldStyles.statValue, ldStyles.statValueGreen]}>{formatINR(received)}</Text>
        </View>
        <View style={ldStyles.statDivider} />
        <View style={ldStyles.statGroup}>
          <Text style={ldStyles.statLabel}>Due</Text>
          <Text style={ldStyles.statValue}>{formatINR(pending)}</Text>
        </View>
      </View>

      {/* Asset Expenses / Paid / Payable */}
      <View style={ldStyles.statRow}>
        <View style={ldStyles.statGroup}>
          <Text style={ldStyles.statLabel}>Asset Expenses</Text>
          <Text style={ldStyles.statValue}>{formatINR(totalExpenses)}</Text>
        </View>
        <View style={ldStyles.statDivider} />
        <View style={ldStyles.statGroup}>
          <Text style={[ldStyles.statLabel, ldStyles.statLabelRed]}>Paid</Text>
          <Text style={[ldStyles.statValue, ldStyles.statValueRed]}>{formatINR(supplierPaid)}</Text>
        </View>
        <View style={ldStyles.statDivider} />
        <View style={ldStyles.statGroup}>
          <Text style={[ldStyles.statLabel, ldStyles.statLabelOrange]}>Payable</Text>
          <Text style={[ldStyles.statValue, ldStyles.statValueOrange]}>{formatINR(supplierDue)}</Text>
        </View>
      </View>

      {/* Transactions */}
      <View style={ldStyles.txSection}>
        <View style={ldStyles.txSectionHeader}>
          <Text style={ldStyles.txHeader}>RECENT TRANSACTIONS</Text>
          {financeHistoryRows.length > 0 && (
            <Text style={ldStyles.txViewAll}>View All →</Text>
          )}
        </View>

        {financeHistoryRows.length === 0 ? (
          <Text style={ldStyles.txEmpty}>No transactions for this trip yet</Text>
        ) : (
          financeHistoryRows.slice(0, 5).map(({ key, tx, isIn, amount }) => (
            <View key={key} style={ldStyles.txRow}>
              <View style={[ldStyles.txIcon, isIn ? ldStyles.txIconIn : ldStyles.txIconOut]}>
                <FontAwesome
                  name={isIn ? "arrow-down" : "arrow-up"}
                  size={11}
                  color={isIn ? "#34d399" : "#f43f5e"}
                />
              </View>
              <View style={ldStyles.txInfo}>
                <Text style={ldStyles.txTitle} numberOfLines={1}>
                  {ledgerHistoryTitle(tx, isIn)}
                </Text>
                <Text style={ldStyles.txMeta} numberOfLines={1}>
                  {formatLedgerDate(tx.transaction_date || tx.created_at)} ·{" "}
                  {tx.party_name?.trim() || "—"}
                </Text>
              </View>
              <Text style={[ldStyles.txAmount, isIn ? ldStyles.txAmountIn : ldStyles.txAmountOut]}>
                {isIn ? "+ " : "− "}
                {formatINR(amount)}
              </Text>
            </View>
          ))
        )}
      </View>
    </View>
  );
}

// ── Expense List Card (white) ──────────────────────────────────────────────────

function ExpenseListCard({
  expenses,
  onAddExpense,
}: {
  expenses: ExpenseRow[];
  onAddExpense?: () => void;
}) {
  const total = expenses.reduce((s, e) => s + e.amount, 0);

  function getCategoryIcon(category: string): React.ComponentProps<typeof FontAwesome>["name"] {
    const c = category.toLowerCase();
    if (c.includes("fuel") || c.includes("diesel") || c.includes("petrol")) return "tint";
    if (c.includes("toll") || c.includes("road")) return "road";
    if (c.includes("driver") || c.includes("labour")) return "user";
    if (c.includes("maintenance") || c.includes("repair")) return "wrench";
    if (c.includes("loading") || c.includes("unloading")) return "archive";
    return "file-text-o";
  }

  function getCategoryColor(category: string): string {
    const c = category.toLowerCase();
    if (c.includes("fuel") || c.includes("diesel") || c.includes("petrol")) return "#f97316";
    if (c.includes("toll") || c.includes("road")) return "#3b82f6";
    if (c.includes("driver") || c.includes("labour")) return "#8b5cf6";
    if (c.includes("maintenance") || c.includes("repair")) return "#ef4444";
    return "#64748b";
  }

  return (
    <View style={elStyles.card}>
      <View style={elStyles.header}>
        <View style={elStyles.headerLeft}>
          <Text style={elStyles.title}>Trip Expenses</Text>
          {expenses.length > 0 && (
            <View style={elStyles.badge}>
              <Text style={elStyles.badgeText}>{expenses.length}</Text>
            </View>
          )}
        </View>
        <View style={elStyles.headerRight}>
          <Text style={elStyles.total}>{formatINR(total)}</Text>
          {onAddExpense && (
            <TouchableOpacity style={elStyles.addBtn} onPress={onAddExpense} activeOpacity={0.8}>
              <FontAwesome name="plus" size={10} color="#fff" />
              <Text style={elStyles.addBtnText}>Add</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {expenses.length === 0 ? (
        <View style={elStyles.empty}>
          <FontAwesome name="inbox" size={24} color="#cbd5e1" />
          <Text style={elStyles.emptyText}>No expenses recorded</Text>
        </View>
      ) : (
        <View style={elStyles.list}>
          {expenses.map((exp) => {
            const iconColor = getCategoryColor(exp.category);
            const iconName = getCategoryIcon(exp.category);
            const isPaid = exp.status === "Paid";
            return (
              <View key={exp.id} style={elStyles.item}>
                <View
                  style={[
                    elStyles.itemIcon,
                    { backgroundColor: iconColor + "18" },
                  ]}
                >
                  <FontAwesome name={iconName} size={16} color={iconColor} />
                </View>
                <View style={elStyles.itemInfo}>
                  <Text style={elStyles.itemTitle} numberOfLines={1}>
                    {exp.description !== "—" ? exp.description : exp.category}
                  </Text>
                  <Text style={elStyles.itemMeta} numberOfLines={1}>
                    {exp.date} · {exp.type}
                  </Text>
                </View>
                <View style={elStyles.itemRight}>
                  <Text style={elStyles.itemAmount}>
                    ₹{exp.amount.toLocaleString("en-IN")}
                  </Text>
                  <View
                    style={[
                      elStyles.itemStatus,
                      {
                        backgroundColor: isPaid ? "#dcfce7" : "#fef3c7",
                        borderColor: isPaid ? "#bbf7d0" : "#fde68a",
                      },
                    ]}
                  >
                    <Text
                      style={[
                        elStyles.itemStatusText,
                        { color: isPaid ? "#15803d" : "#b45309" },
                      ]}
                    >
                      {exp.status}
                    </Text>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

// ── Feedback placeholder ───────────────────────────────────────────────────────

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
        <Text style={fbStyles.sub}>
          Ratings for driver performance, client satisfaction, and trip quality will appear here.
        </Text>
      </View>
    </View>
  );
}

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
        size={11}
        color={primary ? "#1d4ed8" : danger ? "#f43f5e" : "#94a3b8"}
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

  // Dark nav
  navBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingVertical: 14,
    backgroundColor: "#0b1120",
    flexWrap: "wrap",
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(30, 41, 59, 0.6)",
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
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(51, 65, 85, 0.5)",
    backgroundColor: "rgba(30, 41, 59, 0.5)",
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
  navIconBubble: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#2563eb",
    alignItems: "center",
    justifyContent: "center",
  },
  navTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#f8fafc",
    letterSpacing: -0.3,
  },
  navPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  navPillAsset: {
    backgroundColor: "rgba(37, 99, 235, 0.1)",
    borderColor: "rgba(37, 99, 235, 0.2)",
  },
  navPillAggregate: {
    backgroundColor: "rgba(245, 158, 11, 0.1)",
    borderColor: "rgba(245, 158, 11, 0.2)",
  },
  navPillText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#94a3b8",
    letterSpacing: 1.2,
    textTransform: "uppercase",
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
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(51, 65, 85, 0.5)",
    backgroundColor: "rgba(30, 41, 59, 0.3)",
  },
  navActionBtnPrimary: {
    backgroundColor: "#fff",
    borderColor: "transparent",
  },
  navActionBtnDanger: {
    borderColor: "rgba(244, 63, 94, 0.3)",
    backgroundColor: "rgba(159, 18, 57, 0.15)",
  },
  navActionText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#94a3b8",
  },
  navActionTextPrimary: {
    color: "#0f172a",
    fontWeight: "700",
  },
  navActionTextDanger: {
    color: "#f43f5e",
  },

  // Tab bar
  tabBar: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.92)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(226, 232, 240, 0.8)",
    paddingHorizontal: 24,
    paddingVertical: 8,
    gap: 6,
  },
  tabBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  tabBtnActive: {
    backgroundColor: "#eff6ff",
  },
  tabBtnText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#64748b",
  },
  tabBtnTextActive: {
    color: "#2563eb",
    fontWeight: "700",
  },

  // Scroll
  scroll: { flex: 1 },
  scrollContent: {
    padding: 24,
    gap: 24,
  },

  // Tracking tab layout
  trackingTopRow: {
    flexDirection: "row",
    gap: 24,
    alignItems: "stretch",
    minHeight: 620,
    flexWrap: "wrap",
  },
  infoCol: {
    flex: 1,
    flexShrink: 0,
    gap: 20,
    minWidth: 300,
  },
  lrGrow: {
    flex: 1,
  },
  trackingRightCol: {
    flex: 1,
    minWidth: 0,
  },
  feedbackWrap: {
    marginTop: 4,
  },

  // Finance tab layout
  financeColsRow: {
    flexDirection: "row",
    gap: 24,
    alignItems: "flex-start",
    flexWrap: "wrap",
  },
  financeLeftCol: {
    flex: 1,
    minWidth: 320,
  },
  financeRightCol: {
    flex: 1,
    minWidth: 320,
    flexDirection: "column",
    gap: 20,
  },

  // Error
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

// ── Ledger card styles ────────────────────────────────────────────────────────

const ldStyles = StyleSheet.create({
  card: {
    backgroundColor: "#0b1120",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#1e293b",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 6,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(30, 41, 59, 0.8)",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerTitle: {
    fontSize: 10,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  syncBadge: {
    backgroundColor: "rgba(30, 41, 59, 0.5)",
    borderWidth: 1,
    borderColor: "#334155",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
  },
  syncText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 1,
  },

  // Stat rows
  statRow: {
    flexDirection: "row",
    alignItems: "stretch",
    marginHorizontal: 16,
    marginTop: 14,
    backgroundColor: "rgba(30, 41, 59, 0.4)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(51, 65, 85, 0.5)",
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  statGroup: {
    flex: 1,
    alignItems: "flex-start",
  },
  statLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 6,
  },
  greenDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#34d399",
  },
  statLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 6,
  },
  statLabelGreen: { color: "#34d399" },
  statLabelRed: { color: "#f43f5e" },
  statLabelOrange: { color: "#fb923c" },
  statValue: {
    fontSize: 16,
    fontWeight: "800",
    color: "#f8fafc",
    letterSpacing: -0.3,
  },
  statValueGreen: { color: "#34d399" },
  statValueRed: { color: "#f43f5e" },
  statValueOrange: { color: "#fb923c" },
  statDivider: {
    width: 1,
    backgroundColor: "rgba(51, 65, 85, 0.5)",
    marginHorizontal: 12,
    alignSelf: "stretch",
  },

  // Transaction section
  txSection: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
  },
  txSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  txHeader: {
    fontSize: 9,
    fontWeight: "700",
    color: "#475569",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  txViewAll: {
    fontSize: 10,
    fontWeight: "700",
    color: "#3b82f6",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  txEmpty: {
    fontSize: 13,
    color: "#475569",
    paddingVertical: 8,
  },
  txRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(30, 41, 59, 0.3)",
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "rgba(51, 65, 85, 0.5)",
    gap: 12,
  },
  txIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  txIconIn: {
    backgroundColor: "rgba(52, 211, 153, 0.1)",
    borderColor: "rgba(52, 211, 153, 0.2)",
  },
  txIconOut: {
    backgroundColor: "rgba(244, 63, 94, 0.1)",
    borderColor: "rgba(244, 63, 94, 0.2)",
  },
  txInfo: {
    flex: 1,
    minWidth: 0,
  },
  txTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#e2e8f0",
    marginBottom: 4,
  },
  txMeta: {
    fontSize: 9,
    fontWeight: "700",
    color: "#475569",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  txAmount: {
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  txAmountIn: { color: "#34d399" },
  txAmountOut: { color: "#f43f5e" },
});

// ── Expense list card styles ───────────────────────────────────────────────────

const elStyles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#f1f5f9",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 2,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0f172a",
    letterSpacing: -0.2,
  },
  badge: {
    backgroundColor: "#eff6ff",
    borderWidth: 1,
    borderColor: "#bfdbfe",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#2563eb",
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  total: {
    fontSize: 20,
    fontWeight: "900",
    color: "#0f172a",
    letterSpacing: -0.5,
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#0f172a",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  addBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#fff",
  },
  empty: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    gap: 8,
  },
  emptyText: {
    fontSize: 13,
    color: "#94a3b8",
    fontStyle: "italic",
  },
  list: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#f1f5f9",
    marginBottom: 8,
    gap: 12,
    backgroundColor: "#fff",
  },
  itemIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  itemInfo: {
    flex: 1,
    minWidth: 0,
  },
  itemTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1e293b",
    marginBottom: 3,
  },
  itemMeta: {
    fontSize: 10,
    color: "#94a3b8",
    fontWeight: "500",
  },
  itemRight: {
    alignItems: "flex-end",
    gap: 4,
  },
  itemAmount: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0f172a",
  },
  itemStatus: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  itemStatusText: {
    fontSize: 9,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
});

// ── Feedback placeholder styles ────────────────────────────────────────────────

const fbStyles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#f1f5f9",
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  title: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0f172a",
  },
  body: {
    paddingVertical: 40,
    paddingHorizontal: 24,
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
