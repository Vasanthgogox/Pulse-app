import Feather from "@expo/vector-icons/Feather";
import { useFocusEffect } from "@react-navigation/native";
import type { ComponentProps } from "react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Theme from "@/constants/Theme";
import Layout from "@/constants/Layout";
import { useAuth } from "@/contexts/AuthContext";
import type { TripRow } from "@/features/trips/services/trips.service";
import {
  useCancelDriverExpenseRequest,
  useRemindDriverExpenseRequest,
  useReviewTripFuelEntry,
  useReviewTripOtherExpenseEntry,
  useReviewTripTollEntry,
  useSetTripFuelReimbursementState,
  useSetTripOtherReimbursementState,
  useSetTripTollReimbursementState,
  useTripOperationsSummary,
} from "../queries/useTripOperations";
import { useTripOperationsSync } from "../hooks/useTripOperationsSync";
import { isDriverReimbursementCostEvent } from "../shared/driverReimbursementEvents.util";
import { formatOtherExpenseCategoryLabel } from "../shared/tripOtherExpenseCategories";
import { canEditTripCostEvent } from "../shared/expenseEntryEdit.util";
import { ExpensePreviewSheet } from "./ExpensePreviewSheet";
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
  rail: string;
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
      return { initials: "FU", bg: "#dcfce7", fg: "#15803d", icon: "droplet", rail: "#22c55e" };
    case "toll":
    case "fastag":
      return { initials: "TL", bg: "#ede9fe", fg: "#6d28d9", icon: "map-pin", rail: "#8b5cf6" };
    case "loading":
    case "unloading":
      return { initials: "LD", bg: "#ffedd5", fg: "#c2410c", icon: "package", rail: "#f97316" };
    case "parking":
      return { initials: "PK", bg: "#e0f2fe", fg: "#0369a1", icon: "square", rail: "#0ea5e9" };
    default:
      return { initials: "EX", bg: "#f1f5f9", fg: "#475569", icon: "file-text", rail: "#94a3b8" };
  }
}

const QUICK_ACTION_STYLE: Record<
  string,
  { bg: string; fg: string; ring: string }
> = {
  fuel: { bg: "#ecfdf5", fg: "#15803d", ring: "#bbf7d0" },
  toll: { bg: "#f5f3ff", fg: "#6d28d9", ring: "#ddd6fe" },
  other: { bg: "#eef2ff", fg: Theme.primary, ring: "#c7d2fe" },
};

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

function needsDriverPendingAction(event: TripCostEvent): boolean {
  return (
    event.incurredBy === "driver" &&
    event.reimbursable &&
    event.approvalState === "pending" &&
    event.postingState !== "posted"
  );
}

function isDriverReimbursementEvent(event: TripCostEvent): boolean {
  return isDriverReimbursementCostEvent(event);
}

function driverEventStatusLabel(event: TripCostEvent): string {
  if (event.approvalState === "pending") return "Awaiting fleet approval";
  if (event.approvalState === "rejected") return "Cancelled";
  if (event.settlementState === "settled") return "Reimbursed";
  // settlementState is narrowed to non-"settled" here (guarded above)
  if (event.approvalState === "approved") {
    return "Approved · payout pending";
  }
  return eventStatusLabel(event);
}

function driverReimbursementHint(event: TripCostEvent): string | null {
  if (event.approvalState === "pending") {
    return "Submitted for fleet reimbursement";
  }
  if (event.approvalState === "rejected") return "Request cancelled";
  if (event.settlementState === "settled") return "Fleet marked this reimbursed";
  // settlementState is narrowed to non-"settled" here (guarded above)
  if (event.approvalState === "approved") {
    return "Approved by fleet · payout pending";
  }
  return formatReimbursedHint(event);
}

function needsUserAction(event: TripCostEvent): boolean {
  if (canApproveAndPostToLedger(event)) return true;
  return (
    event.reimbursable &&
    event.approvalState === "approved" &&
    event.settlementState !== "settled"
  );
}

function StatusChip({
  event,
  isDriverViewer = false,
}: {
  event: TripCostEvent;
  isDriverViewer?: boolean;
}) {
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
        {isDriverViewer ? driverEventStatusLabel(event) : eventStatusLabel(event)}
      </Text>
    </View>
  );
}

type ExpenseRowProps = {
  event: TripCostEvent;
  embedded: boolean;
  iconMd: number;
  loadingAction: boolean;
  isDriverViewer: boolean;
  onApprove: (event: TripCostEvent) => void;
  onReject: (event: TripCostEvent) => void;
  onMarkSettled: (event: TripCostEvent) => void;
  onCancelRequest: (event: TripCostEvent) => void;
  onRemindRequest: (event: TripCostEvent) => void;
  onEdit?: (event: TripCostEvent) => void;
  onPreview: (event: TripCostEvent) => void;
};

const ExpenseRow = memo(function ExpenseRow({
  event,
  embedded,
  iconMd,
  loadingAction,
  isDriverViewer,
  onApprove,
  onReject,
  onMarkSettled,
  onCancelRequest,
  onRemindRequest,
  onEdit,
  onPreview,
}: ExpenseRowProps) {
  const visual = categoryVisual(event.category);
  const showFleetActions = !isDriverViewer && needsUserAction(event);
  const showDriverActions = isDriverViewer && needsDriverPendingAction(event);
  const showActions = showFleetActions || showDriverActions;
  const tone = statusTone(event);
  const hint = isDriverViewer ? driverReimbursementHint(event) : formatReimbursedHint(event);
  const editable = canEditTripCostEvent(event) && typeof onEdit === "function";

  return (
    <View
      style={[
        styles.row,
        embedded && styles.rowEmbedded,
        showActions && styles.rowNeedsAction,
        { borderLeftColor: visual.rail, borderLeftWidth: 3 },
      ]}
    >
      <Pressable
        style={styles.rowMain}
        onPress={() => onPreview(event)}
        accessibilityRole="button"
        accessibilityLabel={`View ${toCategoryLabel(event)} expense`}
      >
        <View style={[styles.rowAvatar, { backgroundColor: visual.bg }]}>
          <Feather name={visual.icon} size={iconMd} color={visual.fg} />
        </View>
        <View style={styles.rowBody}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {toCategoryLabel(event)}
          </Text>
          {hint ? (
            <Text style={styles.rowHint} numberOfLines={2}>
              {hint}
            </Text>
          ) : null}
        </View>
        <View style={styles.rowRight}>
          <Text
            style={[
              styles.rowAmount,
              tone === "settled" && styles.rowAmountSettled,
            ]}
          >
            {inr(event.amount)}
          </Text>
          <StatusChip event={event} isDriverViewer={isDriverViewer} />
          <Feather name="chevron-right" size={iconMd} color={Theme.textMuted} />
        </View>
      </Pressable>

      {editable ? (
        <Pressable
          style={({ pressed }) => [styles.rowEditLink, pressed && styles.editBtnPressed]}
          onPress={() => onEdit?.(event)}
          disabled={loadingAction}
          accessibilityRole="button"
          accessibilityLabel={`Edit ${toCategoryLabel(event)}`}
        >
          <Feather name="edit-2" size={iconMd} color={Theme.primary} />
          <Text style={styles.rowEditLinkText}>Edit</Text>
        </Pressable>
      ) : null}

      {showActions ? (
        <View style={styles.actions}>
          {showDriverActions ? (
            <>
              <Pressable
                style={({ pressed }) => [
                  styles.actionBtn,
                  styles.actionBtnPrimary,
                  pressed && styles.actionBtnPressed,
                ]}
                onPress={() => void onRemindRequest(event)}
                disabled={loadingAction}
              >
                <Text style={styles.actionBtnTextPrimary}>Remind fleet</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.actionBtn,
                  pressed && styles.actionBtnSecondaryPressed,
                ]}
                onPress={() => void onCancelRequest(event)}
                disabled={loadingAction}
              >
                <Text style={styles.actionBtnText}>Cancel request</Text>
              </Pressable>
            </>
          ) : canApproveAndPostToLedger(event) ? (
            <>
              <Pressable
                style={({ pressed }) => [
                  styles.actionBtn,
                  styles.actionBtnPrimary,
                  pressed && styles.actionBtnPressed,
                ]}
                onPress={() => void onApprove(event)}
                disabled={loadingAction}
              >
                <Text style={styles.actionBtnTextPrimary}>
                  {approveAndPostButtonLabel(event)}
                </Text>
              </Pressable>
              {event.approvalState === "pending" || event.approvalState === "rejected" ? (
                <Pressable
                  style={({ pressed }) => [
                    styles.actionBtn,
                    pressed && styles.actionBtnSecondaryPressed,
                  ]}
                  onPress={() => void onReject(event)}
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
              style={({ pressed }) => [
                styles.actionBtn,
                styles.actionBtnPrimary,
                styles.actionBtnFull,
                pressed && styles.actionBtnPressed,
              ]}
              onPress={() => void onMarkSettled(event)}
              disabled={loadingAction}
            >
              <Text style={styles.actionBtnTextPrimary}>Mark reimbursed</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
});

export function TripExpensesScreen({
  trip,
  onBack,
  embedded = false,
  onAddFuel,
  onAddToll,
  onAddOtherExpense,
  onEditExpense,
  initialPreviewEventId,
  driverCashPayouts = [],
  onRecordDriverPayment,
}: {
  trip: TripRow;
  onBack?: () => void;
  embedded?: boolean;
  onAddFuel?: () => void;
  onAddToll?: () => void;
  onAddOtherExpense?: () => void;
  onEditExpense?: (event: TripCostEvent) => void;
  /** Opens preview sheet on mount (e.g. deep link from Operations tab row). */
  initialPreviewEventId?: string | null;
  /** Cash-out rows to driver from Finance ledger (`transactions` on this trip). */
  driverCashPayouts?: TripDriverCashPayoutRow[];
  onRecordDriverPayment?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const isDriverViewer = profile?.role === "driver";
  const [listFilter, setListFilter] = useState<ListFilter>(isDriverViewer ? "action" : "all");
  const driverDefaultTabSetRef = useRef(false);
  const [previewEvent, setPreviewEvent] = useState<TripCostEvent | null>(null);
  const summaryQuery = useTripOperationsSummary(trip.id, { enabled: true });
  useTripOperationsSync();
  const ledgerBackfillTripRef = useRef<string | null>(null);

  const vehicleLabel = useMemo(() => {
    const raw = (trip.vehicle_display_number ?? "").trim();
    return raw ? formatIndianVehicleNumber(raw) : null;
  }, [trip.vehicle_display_number]);

  useEffect(() => {
    if (!isDriverViewer || driverDefaultTabSetRef.current) return;
    setListFilter("action");
  }, [isDriverViewer]);

  useEffect(() => {
    if (isDriverViewer || !trip.id || !trip.vehicle_id || ledgerBackfillTripRef.current === trip.id) {
      return;
    }
    ledgerBackfillTripRef.current = trip.id;
    void syncPostedTripExpensesToOperationLedger(trip.id).then(() => {
      syncOperationalFinanceProjection({
        queryClient,
        organizationId: trip.organization_id,
        tripId: trip.id,
        vehicleId: trip.vehicle_id ?? null,
      });
    });
  }, [isDriverViewer, queryClient, trip.id, trip.organization_id, trip.vehicle_id]);

  useFocusEffect(
    useCallback(() => {
      if (!trip.id) return;
      void summaryQuery.refetch();
    }, [summaryQuery.refetch, trip.id]),
  );

  const previewDeepLinkRef = useRef<string | null>(null);

  useEffect(() => {
    const id = initialPreviewEventId?.trim();
    if (!id) {
      previewDeepLinkRef.current = null;
      return;
    }
    const match = (summaryQuery.data?.costEvents ?? []).find((event) => event.id === id);
    if (match) {
      setPreviewEvent(match);
      return;
    }
    if (summaryQuery.isLoading || previewDeepLinkRef.current === id) return;
    previewDeepLinkRef.current = id;
    void summaryQuery.refetch().then((res) => {
      const found = res.data?.costEvents.find((event) => event.id === id);
      if (found) setPreviewEvent(found);
    });
  }, [initialPreviewEventId, summaryQuery]);

  const handlePreview = useCallback((event: TripCostEvent) => {
    setPreviewEvent(event);
  }, []);
  const reviewFuel = useReviewTripFuelEntry();
  const reviewToll = useReviewTripTollEntry();
  const reviewOther = useReviewTripOtherExpenseEntry();
  const setFuelReimbursement = useSetTripFuelReimbursementState();
  const setTollReimbursement = useSetTripTollReimbursementState();
  const setOtherReimbursement = useSetTripOtherReimbursementState();
  const cancelDriverExpense = useCancelDriverExpenseRequest();
  const remindDriverExpense = useRemindDriverExpenseRequest();

  const allCostEvents = summaryQuery.data?.costEvents ?? [];
  const events = useMemo(() => {
    if (!isDriverViewer) return allCostEvents;
    return allCostEvents.filter(isDriverReimbursementEvent);
  }, [allCostEvents, isDriverViewer]);

  useEffect(() => {
    if (!isDriverViewer || driverDefaultTabSetRef.current || summaryQuery.isLoading) return;
    driverDefaultTabSetRef.current = true;
    if (events.some(needsDriverPendingAction)) setListFilter("action");
  }, [events, isDriverViewer, summaryQuery.isLoading]);

  const loadingAction =
    reviewFuel.isPending ||
    reviewToll.isPending ||
    reviewOther.isPending ||
    setFuelReimbursement.isPending ||
    setTollReimbursement.isPending ||
    setOtherReimbursement.isPending ||
    cancelDriverExpense.isPending ||
    remindDriverExpense.isPending;

  const snapshot = summaryQuery.data?.financialSnapshot ?? null;
  const actionNeededEvents = useMemo(() => {
    if (isDriverViewer) {
      return events.filter(needsDriverPendingAction);
    }
    return events.filter(needsUserAction);
  }, [events, isDriverViewer]);
  const postedCostInr = snapshot?.postedOperationalCostInr ?? 0;
  const pendingPostCount = snapshot?.approvedAwaitingPostingCount ?? 0;
  const reimbursementDueInr = snapshot?.payableOutstandingInr ?? 0;
  const hasSummaryAlerts = pendingPostCount > 0 || reimbursementDueInr > 0;
  const hasReimbursableExpenses = events.some((event) => event.reimbursable);
  const driverExpensesInr = useMemo(
    () =>
      events
        .filter((event) => event.incurredBy === "driver")
        .reduce((sum, event) => sum + Math.max(0, event.amount), 0),
    [events],
  );
  const showDriverPaymentCta =
    !isDriverViewer &&
    typeof onRecordDriverPayment === "function" &&
    !!trip.driver_id &&
    (reimbursementDueInr > 0 || hasReimbursableExpenses);

  const handleApprove = useCallback(async (event: TripCostEvent) => {
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
  }, [
    profile?.uid,
    queryClient,
    reviewFuel,
    reviewOther,
    reviewToll,
    trip.id,
    trip.organization_id,
    trip.vehicle_id,
  ]);

  const handleReject = useCallback(async (event: TripCostEvent) => {
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
  }, [profile?.uid, reviewFuel, reviewOther, reviewToll, trip.id]);

  const handleMarkSettled = useCallback(async (event: TripCostEvent) => {
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
  }, [
    onRecordDriverPayment,
    profile?.uid,
    setFuelReimbursement,
    setOtherReimbursement,
    setTollReimbursement,
    trip.id,
  ]);

  const handleCancelRequest = useCallback(
    (event: TripCostEvent) => {
      Alert.alert(
        "Cancel reimbursement request?",
        `Remove ${toCategoryLabel(event)} (${inr(event.amount)}) from fleet review?`,
        [
          { text: "Keep request", style: "cancel" },
          {
            text: "Cancel request",
            style: "destructive",
            onPress: () => {
              void cancelDriverExpense
                .mutateAsync({
                  tripId: trip.id,
                  eventId: event.id,
                  actorUserId: profile?.uid ?? null,
                  organizationId: trip.organization_id,
                })
                .catch((e) => {
                  Alert.alert(
                    "Could not cancel request",
                    e instanceof Error ? e.message : "Unknown error",
                  );
                });
            },
          },
        ],
      );
    },
    [cancelDriverExpense, profile?.uid, trip.id, trip.organization_id],
  );

  const handleRemindRequest = useCallback(
    async (event: TripCostEvent) => {
      try {
        await remindDriverExpense.mutateAsync({
          tripId: trip.id,
          eventId: event.id,
          actorUserId: profile?.uid ?? null,
          organizationId: trip.organization_id,
        });
        Alert.alert(
          "Reminder sent",
          "Fleet owner will see this reimbursement request at the top of their queue.",
        );
      } catch (e) {
        Alert.alert(
          "Could not send reminder",
          e instanceof Error ? e.message : "Unknown error",
        );
      }
    },
    [profile?.uid, remindDriverExpense, trip.id, trip.organization_id],
  );

  const displayedEvents = useMemo(() => {
    if (listFilter === "action") return actionNeededEvents;
    return events;
  }, [actionNeededEvents, events, listFilter]);

  const iconSm = embedded ? 10 : 12;
  const iconMd = embedded ? 11 : 14;
  const iconLg = embedded ? 14 : 16;
  const iconEmpty = embedded ? 18 : 22;

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

      <View style={[styles.toolbar, embedded && styles.toolbarEmbedded]}>
          <View style={[styles.hubShell, embedded && styles.hubShellEmbedded]}>
            {!isDriverViewer ? (
            <View style={styles.ledgerHero}>
              <View style={styles.ledgerAccent} />
              <View style={styles.ledgerHeroBody}>
                <View style={styles.ledgerHeroTop}>
                  <View style={styles.ledgerHeroIcon}>
                    <Feather name="book-open" size={11} color={Theme.primary} />
                  </View>
                  <View style={styles.summaryLeft}>
                    <Text style={styles.summaryLabel}>Posted to ledger</Text>
                    <Text style={styles.summaryValue}>{inr(postedCostInr)}</Text>
                  </View>
                </View>
                {vehicleLabel ? (
                  <View style={styles.vehicleRow}>
                    <Feather name="truck" size={iconSm} color={Theme.textMuted} />
                    <Text style={styles.vehicleRowText} numberOfLines={1}>
                      {vehicleLabel}
                    </Text>
                  </View>
                ) : null}
                {hasSummaryAlerts ? (
                  <View style={styles.summaryAlerts}>
                    {pendingPostCount > 0 ? (
                      <View style={styles.alertPill}>
                        <Feather name="clock" size={iconSm} color={Theme.warning} />
                        <Text style={styles.alertPillText}>
                          {pendingPostCount} awaiting post
                        </Text>
                      </View>
                    ) : null}
                    {reimbursementDueInr > 0 ? (
                      <View style={[styles.alertPill, styles.alertPillDue]}>
                        <Feather name="credit-card" size={iconSm} color="#7c3aed" />
                        <Text style={[styles.alertPillText, styles.alertPillDueText]}>
                          {inr(reimbursementDueInr)} to reimburse
                        </Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </View>
            </View>
            ) : (
              <View style={styles.driverSummaryHero}>
                <View style={styles.ledgerAccent} />
                <View style={styles.ledgerHeroBody}>
                  <View style={styles.ledgerHeroTop}>
                    <View style={styles.ledgerHeroIcon}>
                      <Feather name="clock" size={11} color={Theme.primary} />
                    </View>
                    <View style={styles.summaryLeft}>
                      <Text style={styles.summaryLabel}>Expenses</Text>
                      <Text style={styles.summaryValue}>{inr(driverExpensesInr)}</Text>
                    </View>
                  </View>
                  <Text style={styles.driverSummaryHint}>
                    {actionNeededEvents.length > 0
                      ? `${actionNeededEvents.length} request${actionNeededEvents.length === 1 ? "" : "s"} awaiting fleet approval`
                      : reimbursementDueInr > 0
                        ? `${inr(reimbursementDueInr)} pending payout from fleet`
                        : "Submit expenses you paid out of pocket for fleet review"}
                  </Text>
                </View>
              </View>
            )}

            {quickActions.length > 0 ? (
              <View style={styles.quickActionsRow}>
                {quickActions.map((action) => {
                  const accent =
                    QUICK_ACTION_STYLE[action.key] ?? QUICK_ACTION_STYLE.other;
                  return (
                    <Pressable
                      key={action.key}
                      style={({ pressed }) => [
                        styles.quickTile,
                        pressed && styles.quickTilePressed,
                      ]}
                      onPress={() => action.onPress?.()}
                      accessibilityRole="button"
                      accessibilityLabel={`Add ${action.label}`}
                    >
                      <View
                        style={[
                          styles.quickTileIcon,
                          {
                            backgroundColor: accent.bg,
                            borderColor: accent.ring,
                          },
                        ]}
                      >
                        <Feather name={action.icon} size={14} color={accent.fg} />
                      </View>
                      <Text style={styles.quickTileLabel}>{action.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </View>

          <View style={[styles.controlDeck, embedded && styles.controlDeckEmbedded]}>
            <View style={[styles.segmentTrack, embedded && styles.segmentTrackEmbedded]}>
            <Pressable
              style={({ pressed }) => [
                styles.segmentBtn,
                listFilter === "all" ? styles.segmentBtnActive : null,
                pressed && styles.segmentBtnPressed,
              ]}
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
              style={({ pressed }) => [
                styles.segmentBtn,
                listFilter === "action" ? styles.segmentBtnActive : null,
                pressed && styles.segmentBtnPressed,
              ]}
              onPress={() => setListFilter("action")}
            >
              <Text
                style={[
                  styles.segmentBtnText,
                  listFilter === "action" ? styles.segmentBtnTextActive : null,
                ]}
              >
                {isDriverViewer ? "Pending" : "Needs action"}
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
              style={({ pressed }) => [
                styles.driverPayBanner,
                embedded && styles.driverPayBannerEmbedded,
                pressed && styles.driverPayBannerPressed,
              ]}
              onPress={() => onRecordDriverPayment?.()}
            >
              <View style={styles.driverPayAccent} />
              <View style={styles.driverPayIconWrap}>
                <Feather name="credit-card" size={iconMd} color={Theme.primary} />
              </View>
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
              <Feather name="chevron-right" size={iconLg} color={Theme.textMuted} />
            </Pressable>
          ) : null}
          </View>
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
        {summaryQuery.isError ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Could not load expenses</Text>
            <Text style={styles.empty}>
              {summaryQuery.error instanceof Error
                ? summaryQuery.error.message
                : "Pull to refresh or go back and try again."}
            </Text>
          </View>
        ) : summaryQuery.isLoading ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Loading expenses…</Text>
          </View>
        ) : displayedEvents.length === 0 ? (
          <View style={styles.emptyCard}>
            <Feather
              name={listFilter === "action" ? "check-circle" : "inbox"}
              size={iconEmpty}
              color={Theme.textMuted}
            />
            <Text style={styles.emptyTitle}>
              {listFilter === "action" ? "All caught up" : "No expenses yet"}
            </Text>
            <Text style={styles.empty}>
              {listFilter === "action"
                ? isDriverViewer
                  ? "No reimbursement requests waiting on fleet right now."
                  : "Nothing waiting for approve, post, or reimburse."
                : isDriverViewer
                  ? "Log fuel, toll, or other trip costs you paid for reimbursement."
                  : "Add fuel, toll, or other costs for this trip."}
            </Text>
          </View>
        ) : (
          <>
            {!summaryQuery.isLoading && displayedEvents.length > 0 ? (
              <View style={styles.listSectionHead}>
                <Text style={styles.listSectionTitle}>Line items</Text>
                <View style={styles.listSectionBadge}>
                  <Text style={styles.listSectionBadgeText}>
                    {displayedEvents.length}
                  </Text>
                </View>
              </View>
            ) : null}
            {displayedEvents.map((event) => (
              <ExpenseRow
                key={event.id}
                event={event}
                embedded={embedded}
                iconMd={iconMd}
                loadingAction={loadingAction}
                isDriverViewer={isDriverViewer}
                onApprove={handleApprove}
                onReject={handleReject}
                onMarkSettled={handleMarkSettled}
                onCancelRequest={handleCancelRequest}
                onRemindRequest={handleRemindRequest}
                onEdit={onEditExpense}
                onPreview={handlePreview}
              />
            ))}
            {!isDriverViewer && hasReimbursableExpenses ? (
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
                        <Feather name="user" size={iconMd} color="#0f766e" />
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

      <ExpensePreviewSheet
        visible={previewEvent != null}
        costEventId={previewEvent?.id ?? null}
        event={previewEvent}
        isDriverViewer={isDriverViewer}
        onClose={() => setPreviewEvent(null)}
        onEdit={onEditExpense}
        onRemind={handleRemindRequest}
        onCancel={handleCancelRequest}
        statusLabel={
          previewEvent
            ? isDriverViewer
              ? driverEventStatusLabel(previewEvent)
              : eventStatusLabel(previewEvent)
            : undefined
        }
      />
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
  toolbarEmbedded: {
    gap: 8,
    marginBottom: 6,
  },
  hubShell: {
    backgroundColor: Theme.cardWhite,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#0f172a",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
      },
      android: { elevation: 2 },
      default: { boxShadow: "0 2px 10px rgba(15,23,42,0.06)" } as object,
    }),
  },
  hubShellEmbedded: {
  },
  ledgerHero: {
    position: "relative",
    backgroundColor: Theme.pulseIndigoWash,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e6edf5",
  },
  driverSummaryHero: {
    position: "relative",
    backgroundColor: "#f0fdf4",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#dcfce7",
  },
  driverSummaryHint: {
    fontSize: 9,
    fontWeight: "600",
    color: Theme.textSecondary,
    lineHeight: 13,
  },
  ledgerAccent: {
    position: "absolute",
    left: 0,
    top: 8,
    bottom: 8,
    width: 3,
    borderTopRightRadius: 3,
    borderBottomRightRadius: 3,
    backgroundColor: Theme.buttonPrimary,
  },
  ledgerHeroBody: {
    paddingHorizontal: 10,
    paddingVertical: 10,
    paddingLeft: 12,
    gap: 6,
  },
  ledgerHeroTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  ledgerHeroIcon: {
    width: 24,
    height: 24,
    backgroundColor: Theme.cardWhite,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  controlDeck: {
    gap: 8,
  },
  controlDeckEmbedded: {
    gap: 6,
  },
  summaryCard: {
    backgroundColor: Theme.cardWhite,
    padding: 10,
    gap: 8,
  },
  summaryCardEmbedded: {
    padding: 8,
    gap: 6,
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
    fontSize: 8,
    fontWeight: "800",
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    fontVariant: ["tabular-nums"],
    letterSpacing: -0.3,
    lineHeight: 22,
  },
  vehicleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingTop: 2,
  },
  vehicleRowText: {
    flex: 1,
    fontSize: 9,
    fontWeight: "600",
    color: Theme.textSecondary,
    letterSpacing: 0.2,
  },
  vehiclePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    maxWidth: 118,
    paddingHorizontal: 6,
    paddingVertical: 3,
    backgroundColor: "#eef2ff",
  },
  vehiclePillText: {
    fontSize: 8,
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
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    backgroundColor: "#fffbeb",
  },
  alertPillText: {
    fontSize: 8,
    fontWeight: "600",
    color: "#b45309",
  },
  alertPillDue: {
    backgroundColor: "#f5f3ff",
  },
  alertPillDueText: {
    color: "#6d28d9",
  },
  driverPayBanner: {
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    paddingLeft: 12,
    backgroundColor: "#faf5ff",
    overflow: "hidden",
  },
  driverPayBannerEmbedded: {
    gap: 8,
    paddingVertical: 9,
    backgroundColor: Theme.cardWhite,
  },
  driverPayBannerPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.995 }],
  },
  driverPayAccent: {
    position: "absolute",
    left: 0,
    top: 8,
    bottom: 8,
    width: 3,
    borderTopRightRadius: 3,
    borderBottomRightRadius: 3,
    backgroundColor: Theme.buttonPrimary,
  },
  driverPayIconWrap: {
    width: 28,
    height: 28,
    backgroundColor: Theme.cardWhite,
    alignItems: "center",
    justifyContent: "center",
  },
  driverPayBannerText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  driverPayBannerTitle: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.primary,
    lineHeight: 13,
  },
  driverPayBannerSub: {
    fontSize: 8,
    fontWeight: "500",
    color: Theme.textSecondary,
    lineHeight: 11,
  },
  payoutSection: {
    marginTop: 4,
    padding: 10,
    backgroundColor: Theme.surface,
    gap: 6,
  },
  payoutSectionTitle: {
    fontSize: 8,
    fontWeight: "800",
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  payoutSectionHint: {
    fontSize: 9,
    fontWeight: "500",
    color: Theme.textSecondary,
    lineHeight: 13,
    marginBottom: 4,
  },
  payoutEmpty: {
    fontSize: 9,
    fontWeight: "500",
    color: Theme.textMuted,
    fontStyle: "italic",
    lineHeight: 14,
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
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  payoutRowDate: {
    fontSize: 9,
    fontWeight: "500",
    color: Theme.textMuted,
  },
  payoutRowAmount: {
    fontSize: 10,
    fontWeight: "700",
    color: "#0f766e",
    fontVariant: ["tabular-nums"],
  },
  quickActionsRow: {
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 8,
    backgroundColor: Theme.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e6edf5",
  },
  quickTile: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 4,
    minHeight: 58,
  },
  quickTilePressed: {
    opacity: 0.82,
    transform: [{ scale: 0.97 }],
  },
  quickTileIcon: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  quickTileLabel: {
    fontSize: 8,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  quickActionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 6,
    paddingVertical: 6,
    minHeight: 32,
  },
  quickActionBtnText: {
    color: Theme.textPrimaryDark,
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  segmentTrack: {
    flexDirection: "row",
    padding: 3,
    backgroundColor: Theme.surface,
    gap: 3,
  },
  segmentTrackEmbedded: {
    padding: 2,
  },
  segmentBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 6,
    minHeight: 28,
  },
  segmentBtnActive: {
    backgroundColor: Theme.cardWhite,
    ...Platform.select({
      ios: {
        shadowColor: Theme.pulseIndigo,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.12,
        shadowRadius: 3,
      },
      android: { elevation: 1 },
      default: { boxShadow: "0 1px 4px rgba(79,70,229,0.12)" } as object,
    }),
  },
  segmentBtnPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  segmentBtnText: {
    fontSize: 8,
    fontWeight: "600",
    color: Theme.textSecondary,
  },
  segmentBtnTextActive: {
    color: Theme.primary,
    fontWeight: "700",
  },
  segmentCount: {
    minWidth: 18,
    paddingHorizontal: 5,
    paddingVertical: 1,
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
    fontSize: 8,
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
    paddingTop: 2,
  },
  listSectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 2,
    paddingTop: 4,
    paddingBottom: 2,
  },
  listSectionTitle: {
    fontSize: 8,
    fontWeight: "800",
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  listSectionBadge: {
    minWidth: 20,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: "#eef2ff",
    alignItems: "center",
  },
  listSectionBadgeText: {
    fontSize: 8,
    fontWeight: "800",
    color: Theme.primary,
  },
  row: {
    backgroundColor: Theme.cardWhite,
    padding: 10,
    paddingLeft: 8,
    gap: 8,
    overflow: "hidden",
  },
  rowEmbedded: {
    padding: 8,
    gap: 6,
  },
  rowNeedsAction: {
    backgroundColor: "#fafbff",
  },
  rowMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rowAvatar: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  rowTitle: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    lineHeight: 13,
  },
  rowHint: {
    fontSize: 8,
    fontWeight: "500",
    color: Theme.textSecondary,
    lineHeight: 11,
  },
  rowRight: {
    alignItems: "flex-end",
    gap: 3,
    maxWidth: 100,
  },
  editBtn: {
    minWidth: 28,
    minHeight: 28,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  editBtnPressed: {
    opacity: 0.65,
  },
  rowEditLink: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-end",
    gap: 4,
    paddingHorizontal: 12,
    paddingBottom: 8,
    marginTop: -2,
  },
  rowEditLinkText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.primary,
  },
  rowAmount: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    fontVariant: ["tabular-nums"],
    lineHeight: 13,
  },
  rowAmountSettled: {
    color: "#15803d",
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
    maxWidth: 100,
  },
  chipDot: {
    width: 4,
    height: 4,
  },
  chipDotGood: { backgroundColor: "#16a34a" },
  chipDotPending: { backgroundColor: "#d97706" },
  chipDotBad: { backgroundColor: "#dc2626" },
  chipDotSettled: { backgroundColor: "#ffffff" },
  chipText: {
    fontSize: 7,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    flexShrink: 1,
    letterSpacing: 0.1,
  },
  chipTextOnSolid: {
    color: Theme.textOnPrimary,
  },
  chipGood: { borderColor: "#86efac", backgroundColor: "#f0fdf4" },
  chipPending: { borderColor: "#fcd34d", backgroundColor: "#fffbeb" },
  chipBad: { borderColor: "#fecaca", backgroundColor: "#fef2f2" },
  chipSettled: {
    backgroundColor: "#16a34a",
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
  },
  actionBtn: {
    flex: 1,
    minWidth: 100,
    paddingHorizontal: 8,
    paddingVertical: 6,
    minHeight: 30,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Theme.surface,
  },
  actionBtnFull: {
    flex: 1,
    minWidth: "100%",
  },
  actionBtnPrimary: {
    backgroundColor: Theme.buttonPrimary,
    ...Platform.select({
      ios: {
        shadowColor: Theme.pulseIndigo,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
      },
      android: { elevation: 2 },
      default: {},
    }),
  },
  actionBtnPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  actionBtnSecondaryPressed: {
    backgroundColor: Theme.borderLight,
  },
  actionBtnText: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  actionBtnTextPrimary: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.buttonPrimaryText,
  },
  emptyCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e6edf5",
    backgroundColor: Theme.surface,
    padding: 14,
    alignItems: "center",
    gap: 5,
  },
  emptyTitle: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  empty: {
    fontSize: 8,
    fontWeight: "500",
    color: Theme.textMuted,
    textAlign: "center",
    lineHeight: 12,
  },
});
