import Feather from "@expo/vector-icons/Feather";
import type { ComponentProps } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Theme from "@/constants/Theme";
import Layout from "@/constants/Layout";
import { useAuth } from "@/contexts/AuthContext";
import type { TripRow } from "@/features/trips/services/trips.service";
import {
  useReviewTripFuelEntry,
  useReviewTripOtherExpenseEntry,
  useReviewTripTollEntry,
  useSetTripFuelReimbursementState,
  useSetTripOtherReimbursementState,
  useSetTripTollReimbursementState,
  useTripOperationsSummary,
} from "../queries/useTripOperations";
import { formatOtherExpenseCategoryLabel } from "../shared/tripOtherExpenseCategories";
import { syncOperationalFinanceProjection } from "@/features/finance/projections";
import { syncPostedTripExpensesToOperationLedger } from "../vehicle/syncPostedExpensesToOperationLedger.service";
import type { TripCostEvent, TripCostCategory } from "@/features/finance";
import { formatIndianVehicleNumber } from "@/lib/format";

type ListFilter = "all" | "action";

type CategoryVisual = {
  initials: string;
  bg: string;
  fg: string;
  icon: ComponentProps<typeof Feather>["name"];
};

function inr(value: number): string {
  return `₹${Math.round(value).toLocaleString("en-IN")}`;
}

function toCategoryLabel(event: TripCostEvent): string {
  if (event.id.startsWith("other:")) {
    return formatOtherExpenseCategoryLabel(event.category);
  }
  const raw = event.category;
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function categoryVisual(category: TripCostCategory): CategoryVisual {
  switch (category) {
    case "fuel":
      return { initials: "FU", bg: "#dcfce7", fg: "#15803d", icon: "droplet" };
    case "toll":
    case "fastag":
      return { initials: "TL", bg: "#ede9fe", fg: "#6d28d9", icon: "map-pin" };
    case "loading":
    case "unloading":
      return { initials: "LD", bg: "#ffedd5", fg: "#c2410c", icon: "package" };
    case "parking":
      return { initials: "PK", bg: "#e0f2fe", fg: "#0369a1", icon: "square" };
    default:
      return { initials: "EX", bg: "#f1f5f9", fg: "#475569", icon: "file-text" };
  }
}

function canApproveAndPostToLedger(event: TripCostEvent): boolean {
  if (event.approvalState === "pending") return true;
  if (event.approvalState === "rejected") return true;
  if (event.approvalState === "approved" && event.postingState !== "posted") return true;
  return false;
}

function approveAndPostButtonLabel(event: TripCostEvent): string {
  if (event.approvalState === "pending") return "Approve & post";
  if (event.approvalState === "rejected") return "Re-approve & post";
  return "Post to ledger";
}

type StatusTone = "good" | "pending" | "bad" | "settled";

function statusTone(event: TripCostEvent): StatusTone {
  if (event.approvalState === "rejected" || event.postingState === "failed") return "bad";
  if (canApproveAndPostToLedger(event)) return "pending";
  if (
    event.reimbursable &&
    event.approvalState === "approved" &&
    event.settlementState !== "settled"
  ) {
    return "pending";
  }
  if (event.settlementState === "settled") return "settled";
  return "good";
}

function eventStatusLabel(event: TripCostEvent): string {
  if (event.approvalState === "pending") return "Awaiting approval";
  if (event.approvalState === "rejected") return "Rejected";
  if (event.postingState !== "posted") return "Approved · not posted";
  if (
    event.reimbursable &&
    event.approvalState === "approved" &&
    event.settlementState !== "settled"
  ) {
    return "Posted · pay driver";
  }
  if (event.settlementState === "settled") return "Reimbursed";
  return "On ledger";
}

function formatReimbursedHint(event: TripCostEvent): string | null {
  if (!event.reimbursable) return null;
  if (event.settlementState === "settled") {
    const when = event.reimbursedAt
      ? new Date(event.reimbursedAt).toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
        })
      : null;
    return when
      ? `Marked reimbursed ${when} · cash payout is separate`
      : "Marked reimbursed · record driver payment in Finance";
  }
  if (event.postingState === "posted") {
    return "Trip cost on ledger · reimburse driver via Finance payment";
  }
  return "Driver paid · reimbursable";
}

export type TripDriverCashPayoutRow = {
  id: string;
  dateLabel: string;
  amount: number;
  description?: string | null;
};

function needsUserAction(event: TripCostEvent): boolean {
  if (canApproveAndPostToLedger(event)) return true;
  return (
    event.reimbursable &&
    event.approvalState === "approved" &&
    event.settlementState !== "settled"
  );
}

function StatusChip({ event }: { event: TripCostEvent }) {
  const tone = statusTone(event);
  const chipStyle =
    tone === "bad"
      ? styles.chipBad
      : tone === "pending"
        ? styles.chipPending
        : tone === "settled"
          ? styles.chipSettled
          : styles.chipGood;
  const dotStyle =
    tone === "bad"
      ? styles.chipDotBad
      : tone === "pending"
        ? styles.chipDotPending
        : tone === "settled"
          ? styles.chipDotSettled
          : styles.chipDotGood;

  return (
    <View style={[styles.chip, chipStyle]}>
      <View style={[styles.chipDot, dotStyle]} />
      <Text style={[styles.chipText, tone === "settled" && styles.chipTextOnSolid]} numberOfLines={1}>
        {eventStatusLabel(event)}
      </Text>
    </View>
  );
}

export function TripExpensesScreen({
  trip,
  onBack,
  embedded = false,
  onAddFuel,
  onAddToll,
  onAddOtherExpense,
  driverCashPayouts = [],
  onRecordDriverPayment,
}: {
  trip: TripRow;
  onBack?: () => void;
  embedded?: boolean;
  onAddFuel?: () => void;
  onAddToll?: () => void;
  onAddOtherExpense?: () => void;
  /** Cash-out rows to driver from Finance ledger (`transactions` on this trip). */
  driverCashPayouts?: TripDriverCashPayoutRow[];
  onRecordDriverPayment?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [listFilter, setListFilter] = useState<ListFilter>("all");
  const summaryQuery = useTripOperationsSummary(trip.id, { enabled: true });
  const ledgerBackfillTripRef = useRef<string | null>(null);

  const vehicleLabel = useMemo(() => {
    const raw = (trip.vehicle_display_number ?? "").trim();
    return raw ? formatIndianVehicleNumber(raw) : null;
  }, [trip.vehicle_display_number]);

  useEffect(() => {
    if (!trip.id || !trip.vehicle_id || ledgerBackfillTripRef.current === trip.id) return;
    ledgerBackfillTripRef.current = trip.id;
    void syncPostedTripExpensesToOperationLedger(trip.id).then(() => {
      syncOperationalFinanceProjection({
        queryClient,
        organizationId: trip.organization_id,
        tripId: trip.id,
        vehicleId: trip.vehicle_id ?? null,
      });
    });
  }, [queryClient, trip.id, trip.organization_id, trip.vehicle_id]);
  const reviewFuel = useReviewTripFuelEntry();
  const reviewToll = useReviewTripTollEntry();
  const reviewOther = useReviewTripOtherExpenseEntry();
  const setFuelReimbursement = useSetTripFuelReimbursementState();
  const setTollReimbursement = useSetTripTollReimbursementState();
  const setOtherReimbursement = useSetTripOtherReimbursementState();

  const loadingAction =
    reviewFuel.isPending ||
    reviewToll.isPending ||
    reviewOther.isPending ||
    setFuelReimbursement.isPending ||
    setTollReimbursement.isPending ||
    setOtherReimbursement.isPending;

  const events = summaryQuery.data?.costEvents ?? [];
  const snapshot = summaryQuery.data?.financialSnapshot ?? null;
  const actionNeededEvents = useMemo(
    () => events.filter(needsUserAction),
    [events],
  );
  const postedCostInr = snapshot?.postedOperationalCostInr ?? 0;
  const pendingPostCount = snapshot?.approvedAwaitingPostingCount ?? 0;
  const reimbursementDueInr = snapshot?.payableOutstandingInr ?? 0;
  const hasSummaryAlerts = pendingPostCount > 0 || reimbursementDueInr > 0;
  const hasReimbursableExpenses = events.some((event) => event.reimbursable);
  const showDriverPaymentCta =
    typeof onRecordDriverPayment === "function" &&
    !!trip.driver_id &&
    (reimbursementDueInr > 0 || hasReimbursableExpenses);

  const handleApprove = async (event: TripCostEvent) => {
    const [kind, sourceId] = event.id.split(":");
    if (!sourceId) return;
    try {
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
        return;
      }
      if (kind === "other") {
        await reviewOther.mutateAsync({
          tripId: trip.id,
          otherEntryId: sourceId,
          approvalState: "approved",
          reviewerUserId: profile?.uid ?? null,
        });
      }
      syncOperationalFinanceProjection({
        queryClient,
        organizationId: trip.organization_id,
        tripId: trip.id,
        vehicleId: trip.vehicle_id ?? null,
      });
    } catch (e) {
      Alert.alert(
        "Could not approve expense",
        e instanceof Error ? e.message : "Unknown error",
      );
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
      return;
    }
    if (kind === "other") {
      await reviewOther.mutateAsync({
        tripId: trip.id,
        otherEntryId: sourceId,
        approvalState: "rejected",
        reviewerUserId: profile?.uid ?? null,
      });
    }
  };

  const handleMarkSettled = async (event: TripCostEvent) => {
    const [kind, sourceId] = event.id.split(":");
    if (!sourceId) return;
    try {
      if (kind === "fuel") {
        await setFuelReimbursement.mutateAsync({
          tripId: trip.id,
          fuelEntryId: sourceId,
          nextState: "reimbursed",
          actorUserId: profile?.uid ?? null,
        });
      } else if (kind === "toll") {
        await setTollReimbursement.mutateAsync({
          tripId: trip.id,
          tollEntryId: sourceId,
          nextState: "reimbursed",
          actorUserId: profile?.uid ?? null,
        });
      } else if (kind === "other") {
        await setOtherReimbursement.mutateAsync({
          tripId: trip.id,
          otherEntryId: sourceId,
          nextState: "reimbursed",
          actorUserId: profile?.uid ?? null,
        });
      }
      if (typeof onRecordDriverPayment === "function") {
        Alert.alert(
          "Reimbursement marked",
          `${toCategoryLabel(event)} (${inr(event.amount)}) is marked reimbursed. Record the cash paid to the driver in Finance so it appears below.`,
          [
            { text: "Later", style: "cancel" },
            { text: "Record driver payment", onPress: onRecordDriverPayment },
          ],
        );
      }
    } catch (e) {
      Alert.alert(
        "Could not update reimbursement",
        e instanceof Error ? e.message : "Unknown error",
      );
    }
  };

  const displayedEvents = useMemo(() => {
    if (listFilter === "action") return actionNeededEvents;
    return events;
  }, [actionNeededEvents, events, listFilter]);

  const quickActions = [
    { key: "fuel", label: "Fuel", icon: "droplet" as const, onPress: onAddFuel },
    { key: "toll", label: "Toll", icon: "map-pin" as const, onPress: onAddToll },
    {
      key: "other",
      label: "Other",
      icon: "plus-circle" as const,
      onPress: onAddOtherExpense,
    },
  ].filter((action) => typeof action.onPress === "function");

  const renderExpenseRow = (event: TripCostEvent) => {
    const visual = categoryVisual(event.category);
    const showActions = needsUserAction(event);

    return (
      <View key={event.id} style={styles.row}>
        <View style={styles.rowMain}>
          <View style={[styles.rowAvatar, { backgroundColor: visual.bg }]}>
            <Feather name={visual.icon} size={14} color={visual.fg} />
          </View>
          <View style={styles.rowBody}>
            <Text style={styles.rowTitle} numberOfLines={1}>
              {toCategoryLabel(event)}
            </Text>
            {formatReimbursedHint(event) ? (
              <Text style={styles.rowHint} numberOfLines={2}>
                {formatReimbursedHint(event)}
              </Text>
            ) : null}
          </View>
          <View style={styles.rowRight}>
            <Text style={styles.rowAmount}>{inr(event.amount)}</Text>
            <StatusChip event={event} />
          </View>
        </View>

        {showActions ? (
          <View style={styles.actions}>
            {canApproveAndPostToLedger(event) ? (
              <>
                <Pressable
                  style={[styles.actionBtn, styles.actionBtnPrimary]}
                  onPress={() => void handleApprove(event)}
                  disabled={loadingAction}
                >
                  <Text style={styles.actionBtnTextPrimary}>
                    {approveAndPostButtonLabel(event)}
                  </Text>
                </Pressable>
                {event.approvalState === "pending" || event.approvalState === "rejected" ? (
                  <Pressable
                    style={styles.actionBtn}
                    onPress={() => void handleReject(event)}
                    disabled={loadingAction}
                  >
                    <Text style={styles.actionBtnText}>Reject</Text>
                  </Pressable>
                ) : null}
              </>
            ) : event.reimbursable &&
              event.approvalState === "approved" &&
              event.settlementState !== "settled" ? (
              <Pressable
                style={[styles.actionBtn, styles.actionBtnPrimary, styles.actionBtnFull]}
                onPress={() => void handleMarkSettled(event)}
                disabled={loadingAction}
              >
                <Text style={styles.actionBtnTextPrimary}>Mark reimbursed</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <View
      style={[
        styles.container,
        embedded ? styles.containerEmbedded : null,
        { paddingTop: embedded ? 0 : insets.top + 10 },
      ]}
    >
      {!embedded && onBack ? (
        <Pressable style={styles.backBtn} onPress={onBack}>
          <Text style={styles.backBtnText}>← Back</Text>
        </Pressable>
      ) : null}

      <View style={styles.toolbar}>
          <View style={styles.summaryCard}>
            <View style={styles.summaryTop}>
              <View style={styles.summaryLeft}>
                <Text style={styles.summaryLabel}>Posted to ledger</Text>
                <Text style={styles.summaryValue}>{inr(postedCostInr)}</Text>
              </View>
              {vehicleLabel ? (
                <View style={styles.vehiclePill}>
                  <Feather name="truck" size={10} color={Theme.primary} />
                  <Text style={styles.vehiclePillText} numberOfLines={1}>
                    {vehicleLabel}
                  </Text>
                </View>
              ) : null}
            </View>
            {hasSummaryAlerts ? (
              <View style={styles.summaryAlerts}>
                {pendingPostCount > 0 ? (
                  <View style={styles.alertPill}>
                    <Feather name="clock" size={10} color={Theme.warning} />
                    <Text style={styles.alertPillText}>
                      {pendingPostCount} awaiting post
                    </Text>
                  </View>
                ) : null}
                {reimbursementDueInr > 0 ? (
                  <View style={styles.alertPill}>
                    <Feather name="credit-card" size={10} color={Theme.warning} />
                    <Text style={styles.alertPillText}>
                      {inr(reimbursementDueInr)} to reimburse
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>

          {quickActions.length > 0 ? (
            <View style={styles.quickActionsRow}>
              {quickActions.map((action) => (
                <Pressable
                  key={action.key}
                  style={styles.quickActionBtn}
                  onPress={() => action.onPress?.()}
                  accessibilityRole="button"
                  accessibilityLabel={action.label}
                >
                  <Feather name={action.icon} size={14} color={Theme.primary} />
                  <Text style={styles.quickActionBtnText}>{action.label}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          <View style={styles.segmentTrack}>
            <Pressable
              style={[styles.segmentBtn, listFilter === "all" ? styles.segmentBtnActive : null]}
              onPress={() => setListFilter("all")}
            >
              <Text
                style={[
                  styles.segmentBtnText,
                  listFilter === "all" ? styles.segmentBtnTextActive : null,
                ]}
              >
                All
              </Text>
              <View
                style={[
                  styles.segmentCount,
                  listFilter === "all" ? styles.segmentCountActive : null,
                ]}
              >
                <Text
                  style={[
                    styles.segmentCountText,
                    listFilter === "all" ? styles.segmentCountTextActive : null,
                  ]}
                >
                  {events.length}
                </Text>
              </View>
            </Pressable>
            <Pressable
              style={[
                styles.segmentBtn,
                listFilter === "action" ? styles.segmentBtnActive : null,
              ]}
              onPress={() => setListFilter("action")}
            >
              <Text
                style={[
                  styles.segmentBtnText,
                  listFilter === "action" ? styles.segmentBtnTextActive : null,
                ]}
              >
                Needs action
              </Text>
              <View
                style={[
                  styles.segmentCount,
                  listFilter === "action" ? styles.segmentCountActive : null,
                  actionNeededEvents.length > 0 && listFilter !== "action"
                    ? styles.segmentCountHighlight
                    : null,
                ]}
              >
                <Text
                  style={[
                    styles.segmentCountText,
                    listFilter === "action" ? styles.segmentCountTextActive : null,
                    actionNeededEvents.length > 0 && listFilter !== "action"
                      ? styles.segmentCountTextHighlight
                      : null,
                  ]}
                >
                  {actionNeededEvents.length}
                </Text>
              </View>
            </Pressable>
          </View>

          {showDriverPaymentCta ? (
            <Pressable
              style={styles.driverPayBanner}
              onPress={() => onRecordDriverPayment?.()}
            >
              <Feather name="credit-card" size={14} color={Theme.primary} />
              <View style={styles.driverPayBannerText}>
                <Text style={styles.driverPayBannerTitle}>
                  {reimbursementDueInr > 0
                    ? `${inr(reimbursementDueInr)} due to driver`
                    : "Record driver payment"}
                </Text>
                <Text style={styles.driverPayBannerSub} numberOfLines={2}>
                  Mark reimbursed on each expense is not cash. Post payout in Finance.
                </Text>
              </View>
              <Feather name="chevron-right" size={16} color={Theme.textMuted} />
            </Pressable>
          ) : null}
      </View>

      <ScrollView
        style={styles.list}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: embedded ? 16 : insets.bottom + 24 },
        ]}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
      >
        {summaryQuery.isLoading ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Loading expenses…</Text>
          </View>
        ) : displayedEvents.length === 0 ? (
          <View style={styles.emptyCard}>
            <Feather
              name={listFilter === "action" ? "check-circle" : "inbox"}
              size={22}
              color={Theme.textMuted}
            />
            <Text style={styles.emptyTitle}>
              {listFilter === "action" ? "All caught up" : "No expenses yet"}
            </Text>
            <Text style={styles.empty}>
              {listFilter === "action"
                ? "Nothing waiting for approve, post, or reimburse."
                : "Add fuel, toll, or other costs for this trip."}
            </Text>
          </View>
        ) : (
          <>
            {displayedEvents.map(renderExpenseRow)}
            {hasReimbursableExpenses ? (
              <View style={styles.payoutSection}>
                <Text style={styles.payoutSectionTitle}>Driver cash payouts</Text>
                <Text style={styles.payoutSectionHint}>
                  Cash paid to driver posts in Finance (separate from expense approve
                  & post).
                </Text>
                {driverCashPayouts.length === 0 ? (
                  <Text style={styles.payoutEmpty}>
                    No driver payment on this trip yet — tap the banner above to record
                    one.
                  </Text>
                ) : (
                  driverCashPayouts.map((payout) => (
                    <View key={payout.id} style={styles.payoutRow}>
                      <View style={styles.payoutRowLeft}>
                        <Feather name="user" size={14} color="#0f766e" />
                        <View style={styles.payoutRowText}>
                          <Text style={styles.payoutRowTitle} numberOfLines={1}>
                            {payout.description?.trim() || "Driver payment"}
                          </Text>
                          <Text style={styles.payoutRowDate}>{payout.dateLabel}</Text>
                        </View>
                      </View>
                      <Text style={styles.payoutRowAmount}>{inr(payout.amount)}</Text>
                    </View>
                  ))
                )}
              </View>
            ) : null}
          </>
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
  },
  containerEmbedded: {
    flex: 0,
    backgroundColor: "transparent",
    paddingHorizontal: 0,
  },
  backBtn: {
    alignSelf: "flex-start",
    paddingVertical: 4,
    minHeight: 44,
    justifyContent: "center",
    marginBottom: 8,
  },
  backBtnText: {
    color: Theme.primary,
    fontSize: 14,
    fontWeight: "700",
  },
  toolbar: {
    gap: 8,
    marginBottom: 8,
  },
  summaryCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    padding: 12,
    gap: 8,
  },
  summaryTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  summaryLeft: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  summaryLabel: {
    fontSize: 9,
    fontWeight: "600",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    fontVariant: ["tabular-nums"],
    letterSpacing: -0.3,
  },
  vehiclePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    maxWidth: 130,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "#eef2ff",
    borderWidth: 1,
    borderColor: "#c7d2fe",
  },
  vehiclePillText: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.primary,
    flexShrink: 1,
  },
  summaryAlerts: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  alertPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "#fffbeb",
    borderWidth: 1,
    borderColor: "#fde68a",
  },
  alertPillText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#b45309",
  },
  driverPayBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#c7d2fe",
    backgroundColor: "#f5f3ff",
  },
  driverPayBannerText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  driverPayBannerTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.primary,
  },
  driverPayBannerSub: {
    fontSize: 11,
    fontWeight: "400",
    color: Theme.textSecondary,
    lineHeight: 15,
  },
  payoutSection: {
    marginTop: 4,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
    gap: 6,
  },
  payoutSectionTitle: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  payoutSectionHint: {
    fontSize: 11,
    fontWeight: "400",
    color: Theme.textSecondary,
    lineHeight: 15,
    marginBottom: 4,
  },
  payoutEmpty: {
    fontSize: 12,
    fontWeight: "400",
    color: Theme.textMuted,
    fontStyle: "italic",
    lineHeight: 16,
  },
  payoutRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
  },
  payoutRowLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  },
  payoutRowText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  payoutRowTitle: {
    fontSize: 13,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
  },
  payoutRowDate: {
    fontSize: 11,
    fontWeight: "400",
    color: Theme.textMuted,
  },
  payoutRowAmount: {
    fontSize: 13,
    fontWeight: "600",
    color: "#0f766e",
    fontVariant: ["tabular-nums"],
  },
  quickActionsRow: {
    flexDirection: "row",
    gap: 8,
  },
  quickActionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    borderRadius: 10,
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 8,
    paddingVertical: 9,
    minHeight: 40,
  },
  quickActionBtnText: {
    color: Theme.textPrimaryDark,
    fontSize: 12,
    fontWeight: "600",
  },
  segmentTrack: {
    flexDirection: "row",
    padding: 3,
    borderRadius: 10,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    gap: 3,
  },
  segmentBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 8,
    borderRadius: 8,
    minHeight: 36,
  },
  segmentBtnActive: {
    backgroundColor: Theme.cardWhite,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderMedium,
  },
  segmentBtnText: {
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textSecondary,
  },
  segmentBtnTextActive: {
    color: Theme.primary,
    fontWeight: "600",
  },
  segmentCount: {
    minWidth: 22,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: Theme.borderLight,
    alignItems: "center",
  },
  segmentCountActive: {
    backgroundColor: "#eef2ff",
  },
  segmentCountHighlight: {
    backgroundColor: "#fef3c7",
  },
  segmentCountText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textSecondary,
  },
  segmentCountTextActive: {
    color: Theme.primary,
  },
  segmentCountTextHighlight: {
    color: "#b45309",
  },
  list: { flex: 1 },
  listContent: {
    gap: 6,
  },
  row: {
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 12,
    backgroundColor: Theme.cardWhite,
    padding: 10,
    gap: 8,
  },
  rowMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rowAvatar: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
  },
  rowHint: {
    fontSize: 12,
    fontWeight: "400",
    color: Theme.textSecondary,
  },
  rowRight: {
    alignItems: "flex-end",
    gap: 4,
    maxWidth: 110,
  },
  rowAmount: {
    fontSize: 14,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    fontVariant: ["tabular-nums"],
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
    maxWidth: 110,
  },
  chipDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  chipDotGood: { backgroundColor: "#16a34a" },
  chipDotPending: { backgroundColor: "#d97706" },
  chipDotBad: { backgroundColor: "#dc2626" },
  chipDotSettled: { backgroundColor: "#ffffff" },
  chipText: {
    fontSize: 9,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    flexShrink: 1,
  },
  chipTextOnSolid: {
    color: Theme.textOnPrimary,
  },
  chipGood: { borderColor: "#86efac", backgroundColor: "#f0fdf4" },
  chipPending: { borderColor: "#fcd34d", backgroundColor: "#fffbeb" },
  chipBad: { borderColor: "#fecaca", backgroundColor: "#fef2f2" },
  chipSettled: {
    borderColor: "#16a34a",
    backgroundColor: "#16a34a",
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
  },
  actionBtn: {
    flex: 1,
    minWidth: 100,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: 40,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Theme.surface,
  },
  actionBtnFull: {
    flex: 1,
    minWidth: "100%",
  },
  actionBtnPrimary: {
    borderColor: Theme.primary,
    backgroundColor: Theme.primary,
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  actionBtnTextPrimary: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textOnPrimary,
  },
  emptyCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
    padding: 20,
    alignItems: "center",
    gap: 6,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  empty: {
    fontSize: 12,
    fontWeight: "400",
    color: Theme.textMuted,
    textAlign: "center",
    lineHeight: 17,
  },
});
