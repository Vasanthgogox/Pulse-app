import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import Theme from "@/constants/Theme";
import Layout from "@/constants/Layout";
import { useAuth } from "@/contexts/AuthContext";
import type { TripRow } from "@/features/trips/services/trips.service";
import { getTripExecutionModel } from "@/features/trips/domain/tripExecutionModel";
import {
  selectAggregateTripBrokerageMargin,
  selectAggregateTripNetMargin,
  selectAggregateTripSupplierCost,
  type TripCommercialAdjustment,
} from "@/features/finance";
import {
  useReviewTripFuelEntry,
  useReviewTripTollEntry,
  useSetTripFuelReimbursementState,
  useSetTripTollReimbursementState,
  useTripOperationsSummary,
} from "../queries/useTripOperations";
import type { TripCostEvent } from "@/features/finance";
import { deriveReimbursementChipLabel } from "../reimbursement";

type ExpenseTab = "events" | "approvals" | "settlements";

function inr(value: number): string {
  return `₹${Math.round(value).toLocaleString("en-IN")}`;
}

function toCategoryLabel(event: TripCostEvent): string {
  return event.category.toUpperCase();
}

function stateTone(state: string) {
  const normalized = state.toLowerCase();
  if (normalized.includes("posted") || normalized === "approved" || normalized === "settled") {
    return styles.chipGood;
  }
  if (normalized.includes("failed") || normalized.includes("rejected") || normalized.includes("reversed")) {
    return styles.chipBad;
  }
  return styles.chipPending;
}

function toExpenseLifecycleLine(event: TripCostEvent): string {
  const steps = ["Uploaded", "Verified"];
  if (event.approvalState === "approved" || event.approvalState === "rejected") {
    steps.push(event.approvalState === "approved" ? "Approved" : "Rejected");
  }
  if (event.postingState === "posted") steps.push("Posted");
  if (event.approvalState === "approved") steps.push("P&L Synced");
  if (event.settlementState === "settled") steps.push("Settled");
  else if (event.reimbursable) steps.push("Settlement Pending");
  return steps.join(" -> ");
}

function toExpenseLifecycleSteps(event: TripCostEvent): string[] {
  return toExpenseLifecycleLine(event).split(" -> ");
}

export function TripExpensesScreen({
  trip,
  onBack,
  embedded = false,
  onAddFuel,
  onAddToll,
  onAddOtherExpense,
  commercialAdjustments = [],
}: {
  trip: TripRow;
  onBack?: () => void;
  embedded?: boolean;
  onAddFuel?: () => void;
  onAddToll?: () => void;
  onAddOtherExpense?: () => void;
  commercialAdjustments?: TripCommercialAdjustment[];
}) {
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState<ExpenseTab>("events");
  const summaryQuery = useTripOperationsSummary(trip.id, { enabled: true });
  const reviewFuel = useReviewTripFuelEntry();
  const reviewToll = useReviewTripTollEntry();
  const setFuelReimbursement = useSetTripFuelReimbursementState();
  const setTollReimbursement = useSetTripTollReimbursementState();

  const loadingAction =
    reviewFuel.isPending ||
    reviewToll.isPending ||
    setFuelReimbursement.isPending ||
    setTollReimbursement.isPending;

  const events = summaryQuery.data?.costEvents ?? [];
  const snapshot = summaryQuery.data?.financialSnapshot ?? null;
  const lifecycle = summaryQuery.data?.lifecycle ?? null;
  const integrity = summaryQuery.data?.integrity ?? null;
  const executionModel = useMemo(() => getTripExecutionModel(trip), [trip]);
  const isAssetTrip = executionModel === "asset";
  const commercialSnapshot = useMemo(
    () => ({
      supplierCostInr: selectAggregateTripSupplierCost({
        trip,
        adjustments: commercialAdjustments,
      }),
      brokerageMarginInr: selectAggregateTripBrokerageMargin({
        trip,
        adjustments: commercialAdjustments,
      }),
      netMarginInr: selectAggregateTripNetMargin({
        trip,
        adjustments: commercialAdjustments,
      }),
    }),
    [commercialAdjustments, trip],
  );
  const pendingApprovalEvents = useMemo(
    () => events.filter((event) => event.approvalState === "pending"),
    [events],
  );
  const settlementPendingEvents = useMemo(
    () =>
      events.filter(
        (event) =>
          event.reimbursable &&
          event.approvalState === "approved" &&
          event.settlementState !== "settled",
      ),
    [events],
  );

  const handleApprove = async (event: TripCostEvent) => {
    const [kind, sourceId] = event.id.split(":");
    if (!sourceId) return;
    if (kind === "fuel") {
      await reviewFuel.mutateAsync({
        tripId: trip.id,
        fuelEntryId: sourceId,
        approvalState: "approved",
        reviewerUserId: profile?.uid ?? null,
      });
      return;
    }
    if (kind === "toll") {
      await reviewToll.mutateAsync({
        tripId: trip.id,
        tollEntryId: sourceId,
        approvalState: "approved",
        reviewerUserId: profile?.uid ?? null,
      });
    }
  };

  const handleReject = async (event: TripCostEvent) => {
    const [kind, sourceId] = event.id.split(":");
    if (!sourceId) return;
    if (kind === "fuel") {
      await reviewFuel.mutateAsync({
        tripId: trip.id,
        fuelEntryId: sourceId,
        approvalState: "rejected",
        reviewerUserId: profile?.uid ?? null,
      });
      return;
    }
    if (kind === "toll") {
      await reviewToll.mutateAsync({
        tripId: trip.id,
        tollEntryId: sourceId,
        approvalState: "rejected",
        reviewerUserId: profile?.uid ?? null,
      });
    }
  };

  const handleMarkSettled = async (event: TripCostEvent) => {
    const [kind, sourceId] = event.id.split(":");
    if (!sourceId) return;
    if (kind === "fuel") {
      await setFuelReimbursement.mutateAsync({
        tripId: trip.id,
        fuelEntryId: sourceId,
        nextState: "reimbursed",
        actorUserId: profile?.uid ?? null,
      });
      return;
    }
    if (kind === "toll") {
      await setTollReimbursement.mutateAsync({
        tripId: trip.id,
        tollEntryId: sourceId,
        nextState: "reimbursed",
        actorUserId: profile?.uid ?? null,
      });
    }
  };

  const list =
    activeTab === "events"
      ? events
      : activeTab === "approvals"
        ? pendingApprovalEvents
        : settlementPendingEvents;

  const quickActions = (
    isAssetTrip
      ? [
          { key: "fuel", label: "Add Fuel", onPress: onAddFuel },
          { key: "toll", label: "Add Toll", onPress: onAddToll },
          { key: "other", label: "Add Other Expense", onPress: onAddOtherExpense },
        ]
      : [{ key: "commercial", label: "Add Commercial Adjustment", onPress: onAddOtherExpense }]
  ).filter((action) => typeof action.onPress === "function");

  return (
    <View
      style={[
        styles.container,
        embedded ? styles.containerEmbedded : null,
        { paddingTop: embedded ? 0 : insets.top + 10 },
      ]}
    >
      <View style={styles.header}>
        {!embedded && onBack ? (
          <View style={styles.headerTop}>
            <Pressable style={styles.backBtn} onPress={onBack}>
              <FontAwesome name="chevron-left" size={11} color={Theme.text} />
              <Text style={styles.backBtnText}>Back</Text>
            </Pressable>
          </View>
        ) : null}
        <View style={styles.titleRow}>
          <Text style={styles.title}>{isAssetTrip ? "Trip Expense Control" : "Trip Commercial Control"}</Text>
          <View style={[styles.modePill, isAssetTrip ? styles.modePillAsset : styles.modePillCommercial]}>
            <Text
              style={[
                styles.modePillText,
                isAssetTrip ? styles.modePillTextAsset : styles.modePillTextCommercial,
              ]}
            >
              {isAssetTrip ? "ASSET MODE" : "COMMERCIAL MODE"}
            </Text>
          </View>
        </View>
        <Text style={styles.subtitle}>
          {isAssetTrip
            ? "Unified operational expense events synced with trip P&L"
            : "Commercial cost and brokerage margin controls for aggregate execution"}
        </Text>
      </View>

      <View style={styles.widgetBlock}>
      <View style={styles.kpiRow}>
        <View style={styles.kpiCell}>
          <Text style={styles.kpiLabel}>
            {isAssetTrip ? "Approved Awaiting Posting" : "Supplier Cost"}
          </Text>
          <Text style={styles.kpiValue}>
            {isAssetTrip
              ? snapshot?.approvedAwaitingPostingCount ?? 0
              : inr(commercialSnapshot.supplierCostInr)}
          </Text>
        </View>
        <View style={styles.kpiCell}>
          <Text style={styles.kpiLabel}>{isAssetTrip ? "Posted Cost" : "Brokerage Margin"}</Text>
          <Text style={styles.kpiValue}>
            {isAssetTrip
              ? inr(snapshot?.postedOperationalCostInr ?? 0)
              : inr(commercialSnapshot.brokerageMarginInr)}
          </Text>
        </View>
        <View style={styles.kpiCell}>
          <Text style={styles.kpiLabel}>{isAssetTrip ? "Settlement Pending" : "Net Margin"}</Text>
          <Text style={styles.kpiValue}>
            {isAssetTrip
              ? inr(snapshot?.payableOutstandingInr ?? 0)
              : inr(commercialSnapshot.netMarginInr)}
          </Text>
        </View>
      </View>
      </View>

      {isAssetTrip && lifecycle ? (
        <View style={[styles.lifecycleStrip, styles.widgetBlock]}>
          <View style={styles.lifecycleTopRow}>
            <Text style={styles.lifecycleTitle}>Ledger + P&L Lifecycle</Text>
            <Text style={styles.lifecycleHint}>Approval = Financial Recognition</Text>
          </View>
          <View style={styles.lifecycleMetricGrid}>
            <View style={styles.lifecycleMetricCell}>
              <Text style={styles.lifecycleMetricLabel}>Approved Costs</Text>
              <Text style={styles.lifecycleMetricValue}>{inr(lifecycle.approvedCostsInr)}</Text>
            </View>
            <View style={styles.lifecycleMetricCell}>
              <Text style={styles.lifecycleMetricLabel}>Posted to Ledger</Text>
              <Text style={styles.lifecycleMetricValue}>{inr(lifecycle.postedToLedgerInr)}</Text>
            </View>
            <View style={styles.lifecycleMetricCell}>
              <Text style={styles.lifecycleMetricLabel}>Pending Posting</Text>
              <Text style={styles.lifecycleMetricValue}>{inr(lifecycle.pendingPostingInr)}</Text>
            </View>
            <View style={styles.lifecycleMetricCell}>
              <Text style={styles.lifecycleMetricLabel}>Outstanding Reimbursement</Text>
              <Text style={styles.lifecycleMetricValue}>{inr(lifecycle.outstandingReimbursementInr)}</Text>
            </View>
          </View>
          <View style={styles.lifecycleChipRow}>
            <View style={[styles.chip, stateTone(lifecycle.pendingPostingInr > 0 ? "pending" : "posted")]}>
              <Text style={styles.chipText}>
                {lifecycle.pendingPostingInr > 0 ? "Ledger Pending" : "Ledger Healthy"}
              </Text>
            </View>
            <View style={[styles.chip, stateTone(lifecycle.outstandingReimbursementInr > 0 ? "pending" : "settled")]}>
              <Text style={styles.chipText}>
                {lifecycle.outstandingReimbursementInr > 0 ? "Settlement Required" : "Settlement Healthy"}
              </Text>
            </View>
            <View style={[styles.chip, stateTone(lifecycle.marginImpacted ? "approved" : "pending")]}>
              <Text style={styles.chipText}>{lifecycle.marginImpacted ? "P&L Synced" : "P&L Pending"}</Text>
            </View>
          </View>
        </View>
      ) : null}

      {isAssetTrip && integrity ? (
        <View style={[styles.integrityStrip, styles.widgetBlock]}>
          <Text style={styles.integrityTitle}>Financial Integrity Surface</Text>
          <View style={styles.integrityChipRow}>
            <View
              style={[
                styles.chip,
                stateTone(integrity.trip.health === "healthy" ? "approved" : "pending"),
              ]}
            >
              <Text style={styles.chipText}>
                {integrity.trip.health === "healthy"
                  ? "Trip Accounting Healthy"
                  : "Trip Accounting Drift"}
              </Text>
            </View>
            <View
              style={[
                styles.chip,
                stateTone(integrity.posting.unpostedApprovedCount > 0 ? "pending" : "posted"),
              ]}
            >
              <Text style={styles.chipText}>
                {integrity.posting.unpostedApprovedCount > 0
                  ? "Settlement Attention Required"
                  : "Settlement Lifecycle Healthy"}
              </Text>
            </View>
            <View
              style={[
                styles.chip,
                stateTone(integrity.trip.marginDriftInr > 0 ? "pending" : "approved"),
              ]}
            >
              <Text style={styles.chipText}>
                {integrity.trip.marginDriftInr > 0 ? "Margin Drift Detected" : "Margin Integrity Healthy"}
              </Text>
            </View>
          </View>
        </View>
      ) : null}

      {isAssetTrip ? <View style={[styles.tabRow, styles.widgetBlock]}>
        {([
          ["events", `Events (${events.length})`],
          ["approvals", `Approvals (${pendingApprovalEvents.length})`],
          ["settlements", `Settlements (${settlementPendingEvents.length})`],
        ] as const).map(([id, label]) => (
          <Pressable
            key={id}
            style={[styles.tabBtn, activeTab === id ? styles.tabBtnActive : null]}
            onPress={() => setActiveTab(id)}
          >
            <Text style={[styles.tabText, activeTab === id ? styles.tabTextActive : null]}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View> : (
        <View style={styles.commercialHeaderStrip}>
          <Text style={styles.commercialHeaderTitle}>Commercial Workspace</Text>
          <Text style={styles.commercialHeaderMeta}>Supplier cost, adjustments, and brokerage margin only</Text>
        </View>
      )}

      {quickActions.length > 0 ? (
        <View style={[styles.quickActionsRow, styles.widgetBlock]}>
          {quickActions.map((action) => (
            <Pressable
              key={action.key}
              style={styles.quickActionBtn}
              onPress={() => {
                if (action.onPress) action.onPress();
              }}
            >
              <Text style={styles.quickActionBtnText}>{action.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <ScrollView
        style={styles.list}
        contentContainerStyle={{ paddingBottom: embedded ? 20 : insets.bottom + 20 }}
        showsVerticalScrollIndicator={false}
      >
        {!isAssetTrip ? (
          <View style={styles.commercialCard}>
            <Text style={styles.rowTitle}>Commercial Margin Workspace</Text>
            <Text style={styles.rowMeta}>
              Aggregate trips avoid fuel/toll/mileage workflows and focus on supplier and brokerage accounting.
            </Text>
            <Text style={styles.rowMeta}>
              Use commercial adjustments to update supplier cost and net margin visibility.
            </Text>
          </View>
        ) : summaryQuery.isLoading ? (
          <Text style={styles.empty}>Loading financial events...</Text>
        ) : list.length === 0 ? (
          <Text style={styles.empty}>No events in this section.</Text>
        ) : (
          list.map((event) => (
            <View key={event.id} style={styles.row}>
              <View style={styles.rowTop}>
                <Text style={styles.rowTitle}>
                  {toCategoryLabel(event)} · {inr(event.amount)}
                </Text>
                <View style={[styles.chip, stateTone(event.approvalState)]}>
                  <Text style={styles.chipText}>{event.approvalState}</Text>
                </View>
              </View>
              <Text style={styles.rowMeta}>
                Posting: {event.postingState} · Settlement: {event.settlementState} · Payer: {event.payer}
              </Text>
              <View style={styles.timelineRow}>
                {toExpenseLifecycleSteps(event).map((step, index) => (
                  <View key={`${event.id}-${step}-${index}`} style={styles.timelineStep}>
                    <Text style={styles.timelineStepText}>{step}</Text>
                  </View>
                ))}
              </View>
              <Text style={styles.rowMeta}>
                {event.reimbursable
                  ? deriveReimbursementChipLabel(
                      event.settlementState === "settled"
                        ? "reimbursed"
                        : event.settlementState === "partial"
                          ? "reimbursement_pending"
                          : "reported",
                    )
                  : "No reimbursement flow"}
              </Text>
              <View style={styles.actions}>
                {event.approvalState === "pending" ? (
                  <>
                    <Pressable
                      style={[styles.actionBtn, styles.actionBtnPrimary]}
                      onPress={() => void handleApprove(event)}
                      disabled={loadingAction}
                    >
                      <Text style={styles.actionBtnTextPrimary}>Approve</Text>
                    </Pressable>
                    <Pressable
                      style={styles.actionBtn}
                      onPress={() => void handleReject(event)}
                      disabled={loadingAction}
                    >
                      <Text style={styles.actionBtnText}>Reject</Text>
                    </Pressable>
                  </>
                ) : event.reimbursable &&
                  event.approvalState === "approved" &&
                  event.settlementState !== "settled" ? (
                  <Pressable
                    style={[styles.actionBtn, styles.actionBtnPrimary]}
                    onPress={() => void handleMarkSettled(event)}
                    disabled={loadingAction}
                  >
                    <Text style={styles.actionBtnTextPrimary}>Mark Reimbursed</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    gap: 8,
  },
  containerEmbedded: {
    flex: 0,
    backgroundColor: "transparent",
    paddingHorizontal: 0,
    gap: 8,
  },
  widgetBlock: {
    marginBottom: 10,
  },
  header: {
    backgroundColor: Theme.surface,
    borderColor: Theme.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 9,
    marginBottom: 10,
  },
  headerTop: {
    flexDirection: "row",
    marginBottom: 4,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: Theme.border,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    backgroundColor: Theme.whiteMuted,
    minHeight: 32,
  },
  backBtnText: {
    color: Theme.text,
    fontSize: 9,
    fontWeight: "800",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 6,
  },
  title: {
    color: Theme.textPrimaryDark,
    fontSize: 13,
    fontWeight: "800",
    flex: 1,
    minWidth: 0,
    lineHeight: 16,
  },
  modePill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  modePillAsset: {
    borderColor: Theme.primary,
    backgroundColor: "#eef2ff",
  },
  modePillCommercial: {
    borderColor: Theme.warning,
    backgroundColor: Theme.whiteMuted,
  },
  modePillText: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  modePillTextAsset: {
    color: Theme.primary,
  },
  modePillTextCommercial: {
    color: Theme.warning,
  },
  subtitle: {
    color: Theme.textMuted,
    fontSize: 9,
    marginTop: 3,
    lineHeight: 13,
  },
  kpiRow: {
    flexDirection: "row",
    gap: 6,
  },
  kpiCell: {
    flex: 1,
    borderWidth: 1,
    borderColor: Theme.border,
    borderRadius: 10,
    backgroundColor: Theme.surface,
    paddingHorizontal: 8,
    paddingVertical: 7,
    minHeight: 52,
    justifyContent: "center",
  },
  kpiLabel: {
    color: Theme.textMuted,
    fontSize: 8,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.3,
    lineHeight: 11,
  },
  kpiValue: {
    color: Theme.textPrimaryDark,
    fontSize: 11,
    fontWeight: "800",
    marginTop: 3,
  },
  tabRow: { flexDirection: "row", gap: 5 },
  tabBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: Theme.border,
    backgroundColor: Theme.surface,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 4,
    minHeight: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  tabBtnActive: {
    borderColor: Theme.primary,
    backgroundColor: "#eef2ff",
  },
  tabText: {
    color: Theme.textMuted,
    fontSize: 9,
    fontWeight: "800",
    textAlign: "center",
  },
  tabTextActive: { color: Theme.primary },
  commercialHeaderStrip: {
    borderWidth: 1,
    borderColor: Theme.border,
    borderRadius: 10,
    backgroundColor: Theme.surface,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
    marginBottom: 10,
  },
  commercialHeaderTitle: {
    color: Theme.textPrimaryDark,
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  commercialHeaderMeta: {
    color: Theme.textMuted,
    fontSize: 9,
    lineHeight: 13,
  },
  lifecycleStrip: {
    borderWidth: 1,
    borderColor: Theme.border,
    borderRadius: 12,
    backgroundColor: Theme.surface,
    paddingHorizontal: 10,
    paddingVertical: 9,
    gap: 7,
  },
  lifecycleTopRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 6,
  },
  lifecycleTitle: {
    color: Theme.textPrimaryDark,
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  lifecycleHint: {
    color: Theme.textMuted,
    fontSize: 8,
    fontWeight: "600",
  },
  lifecycleMetricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  lifecycleMetricCell: {
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 8,
    backgroundColor: Theme.whiteMuted,
    paddingHorizontal: 7,
    paddingVertical: 6,
    minWidth: "48%",
    flex: 1,
  },
  lifecycleMetricLabel: {
    color: Theme.textMuted,
    fontSize: 8,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  lifecycleMetricValue: {
    color: Theme.textPrimaryDark,
    fontSize: 10,
    fontWeight: "800",
    marginTop: 2,
  },
  lifecycleChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
    marginTop: 2,
  },
  integrityStrip: {
    borderWidth: 1,
    borderColor: Theme.border,
    borderRadius: 12,
    backgroundColor: Theme.surface,
    paddingHorizontal: 10,
    paddingVertical: 9,
    gap: 6,
  },
  integrityTitle: {
    color: Theme.textPrimaryDark,
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  integrityChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
  },
  quickActionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
  },
  quickActionBtn: {
    borderWidth: 1,
    borderColor: Theme.border,
    borderRadius: 999,
    backgroundColor: Theme.whiteMuted,
    paddingHorizontal: 9,
    paddingVertical: 6,
    minHeight: 32,
    justifyContent: "center",
  },
  quickActionBtnText: {
    color: Theme.text,
    fontSize: 9,
    fontWeight: "800",
  },
  list: { flex: 1, marginTop: 4 },
  row: {
    borderWidth: 1,
    borderColor: Theme.border,
    borderRadius: 10,
    backgroundColor: Theme.surface,
    paddingHorizontal: 10,
    paddingVertical: 9,
    gap: 5,
    marginBottom: 8,
    shadowColor: "#0f172a",
    shadowOpacity: 0.03,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  rowTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 6,
  },
  rowTitle: {
    color: Theme.textPrimaryDark,
    fontSize: 10,
    fontWeight: "800",
    flex: 1,
    minWidth: 0,
  },
  rowMeta: {
    color: Theme.textMuted,
    fontSize: 9,
    lineHeight: 13,
  },
  timelineRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 1,
  },
  timelineStep: {
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 999,
    backgroundColor: Theme.whiteMuted,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  timelineStepText: {
    color: Theme.textSecondary,
    fontSize: 8,
    fontWeight: "700",
  },
  commercialCard: {
    borderWidth: 1,
    borderColor: Theme.border,
    borderRadius: 10,
    backgroundColor: Theme.surface,
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 4,
    marginBottom: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  chipText: {
    color: Theme.text,
    fontSize: 8,
    fontWeight: "800",
    textTransform: "capitalize",
  },
  chipGood: { borderColor: "#a7f3d0", backgroundColor: "#f0fdf4" },
  chipPending: { borderColor: "#fcd34d", backgroundColor: "#fffbeb" },
  chipBad: { borderColor: "#fecdd3", backgroundColor: "#fff1f2" },
  actions: { flexDirection: "row", gap: 6, marginTop: 3, flexWrap: "wrap" },
  actionBtn: {
    borderWidth: 1,
    borderColor: Theme.border,
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 6,
    minHeight: 32,
    backgroundColor: Theme.whiteMuted,
    justifyContent: "center",
  },
  actionBtnPrimary: {
    borderColor: Theme.primary,
    backgroundColor: Theme.primary,
  },
  actionBtnText: { color: Theme.text, fontSize: 9, fontWeight: "800" },
  actionBtnTextPrimary: { color: Theme.surface, fontSize: 9, fontWeight: "800" },
  empty: {
    color: Theme.textMuted,
    fontSize: 10,
    paddingVertical: 16,
    textAlign: "center",
  },
});
