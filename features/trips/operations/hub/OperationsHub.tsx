import { Pressable, StyleSheet, Text, View, type TextStyle, type ViewStyle } from "react-native";
import { useMemo, useState } from "react";
import Theme from "@/constants/Theme";
import { useAuth } from "@/contexts/AuthContext";
import {
  getDriverOperationalDisplay,
  getTripOperationalDisplay,
  getVehicleOperationalDisplay,
} from "@/features/operations/display";
import { useResolvedIdentities, useResolvedIdentity } from "@/features/identity";
import {
  useOperationalHealthSnapshot,
  useOperationalObservability,
} from "@/features/operations/observability";
import type { TripRow } from "@/features/trips/services/trips.service";
import {
  getTripOperationalCapabilities,
  selectOperationsHubSections,
} from "@/features/trips/capabilities";
import { toVerificationSnapshot } from "@/features/trips/verification/selectors/verificationSelectors";
import { VerificationStatusChip } from "@/features/trips/verification/components/VerificationStatusChip";
import { OperationalBottomActionBar } from "@/components/operational";
import {
  useReviewTripFuelEntry,
  useReviewTripTollEntry,
  useSetTripFuelReimbursementState,
  useSetTripTollReimbursementState,
  useTripOperationalTimeline,
  useTripOperationsSummary,
} from "../queries/useTripOperations";
import { toOperationsDisplayMetrics } from "../metrics/operationsMetrics";
import { deriveOperationalHealth } from "../health/operationalHealth";
import { useVehicleOperationsLedger } from "../vehicle/useVehicleOperationsLedger";
import {
  groupPendingReimbursements,
  toReimbursableEntries,
} from "../reimbursement";
import {
  usePostingReconciliationState,
  useRunPostingReconciliation,
} from "@/features/ledger/vehicle";

function inr(v: number): string {
  return `₹${Math.round(v).toLocaleString("en-IN")}`;
}

function km(v: number | null | undefined): string {
  if (!Number.isFinite(Number(v))) return "—";
  return `${Number(v).toLocaleString("en-IN", { maximumFractionDigits: 1 })} KM`;
}

type HealthChipState = "active" | "pending" | "unavailable" | "aggregation-mode";
type StatusChipState = "good" | "pending" | "warning" | "blocked";

function getHealthChipStyle(state: HealthChipState) {
  if (state === "active") return styles.chip_active;
  if (state === "pending") return styles.chip_pending;
  if (state === "aggregation-mode") return styles.chip_aggregation_mode;
  return styles.chip_unavailable;
}

function getStatusChipStyle(state: StatusChipState) {
  if (state === "good") return styles.statusChipGood;
  if (state === "pending") return styles.statusChipPending;
  if (state === "warning") return styles.statusChipWarning;
  return styles.statusChipBlocked;
}

type TimelineSeverity = "neutral" | "warning" | "critical";

function eventSeverity(eventType: string): TimelineSeverity {
  const normalized = String(eventType).toLowerCase();
  if (normalized.includes("failed") || normalized.includes("rejected")) return "critical";
  if (normalized.includes("reconciliation") || normalized.includes("retry")) return "warning";
  return "neutral";
}

export type OperationsHubDriverTheme = {
  surface: string;
  surfaceElevated: string;
  border: string;
  text: string;
  textMuted: string;
  emerald: string;
  emeraldMuted: string;
  emeraldDark: string;
  background: string;
  isDark: boolean;
};

type HubVariantStyles = {
  card: ViewStyle;
  header: ViewStyle;
  headerLeft: ViewStyle;
  title: TextStyle;
  sub: TextStyle;
  healthStrip: ViewStyle;
  execStrip: ViewStyle;
  execCell: ViewStyle;
  execLabel: TextStyle;
  execValue: TextStyle;
  compactGrid: ViewStyle;
  compactCell: ViewStyle;
  compactLabel: TextStyle;
  compactValue: TextStyle;
  sectionTitle: TextStyle;
  expenseControlCard: ViewStyle;
  expenseControlBtn: ViewStyle;
  expenseControlBtnText: TextStyle;
  timelineWrap: ViewStyle;
  actions: ViewStyle;
  actionBtn: ViewStyle;
  actionBtnPrimary: ViewStyle;
  actionBtnDark: ViewStyle;
  actionText: TextStyle;
  actionTextPrimary: TextStyle;
  actionTextOnDark: TextStyle;
};

function makeDriverHubStyles(c: OperationsHubDriverTheme): HubVariantStyles {
  const stripBg = c.isDark ? "rgba(16,185,129,0.06)" : c.emeraldMuted;
  const cellBg = c.isDark ? c.surfaceElevated : c.surface;
  return {
    card: {
      borderRadius: 14,
      borderColor: c.border,
      backgroundColor: c.surface,
      padding: 10,
      gap: 10,
    },
    header: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 8,
    },
    headerLeft: { flex: 1, minWidth: 0 },
    title: {
      fontSize: 9,
      fontWeight: "800",
      color: c.text,
      textTransform: "uppercase",
      letterSpacing: 0.8,
    },
    sub: {
      marginTop: 2,
      fontSize: 10,
      fontWeight: "600",
      color: c.textMuted,
      lineHeight: 14,
    },
    healthStrip: {
      borderRadius: 12,
      borderColor: c.border,
      backgroundColor: stripBg,
      paddingHorizontal: 10,
      paddingVertical: 10,
    },
    execStrip: {
      borderBottomColor: c.border,
      gap: 8,
    },
    execCell: {
      width: "48%",
      borderRadius: 10,
      borderColor: c.border,
      backgroundColor: cellBg,
      paddingHorizontal: 8,
      paddingVertical: 7,
    },
    execLabel: {
      fontSize: 8,
      fontWeight: "800",
      textTransform: "uppercase",
      letterSpacing: 0.7,
      color: c.textMuted,
    },
    execValue: {
      fontSize: 11,
      fontWeight: "700",
      color: c.text,
    },
    compactGrid: {
      borderRadius: 12,
      borderColor: c.border,
      overflow: "hidden",
    },
    compactCell: {
      backgroundColor: cellBg,
      borderColor: c.border,
      paddingVertical: 10,
    },
    compactLabel: {
      fontSize: 8,
      fontWeight: "800",
      textTransform: "uppercase",
      letterSpacing: 0.6,
      color: c.textMuted,
    },
    compactValue: {
      fontSize: 13,
      fontWeight: "800",
      color: c.text,
    },
    sectionTitle: {
      fontSize: 9,
      fontWeight: "800",
      textTransform: "uppercase",
      letterSpacing: 0.8,
      color: c.textMuted,
    },
    expenseControlCard: {
      borderRadius: 12,
      borderColor: c.border,
      backgroundColor: stripBg,
      flexDirection: "column",
      alignItems: "stretch",
      gap: 8,
    },
    expenseControlBtn: {
      borderRadius: 10,
      backgroundColor: c.emeraldDark,
      borderColor: c.emeraldDark,
      width: "100%",
    },
    expenseControlBtnText: {
      fontSize: 10,
      fontWeight: "800",
      textTransform: "uppercase",
      letterSpacing: 0.5,
      color: "#fff",
    },
    timelineWrap: {
      borderTopColor: c.border,
      paddingTop: 8,
    },
    actions: { gap: 6 },
    actionBtn: {
      borderRadius: 10,
      borderColor: c.border,
      backgroundColor: cellBg,
      minWidth: "30%",
      flexGrow: 1,
    },
    actionBtnPrimary: {
      backgroundColor: c.emeraldMuted,
      borderColor: c.emerald,
    },
    actionBtnDark: {
      backgroundColor: c.emeraldDark,
      borderColor: c.emeraldDark,
    },
    actionText: {
      fontSize: 9,
      fontWeight: "800",
      textTransform: "uppercase",
      letterSpacing: 0.4,
      color: c.text,
    },
    actionTextPrimary: { color: c.emerald },
    actionTextOnDark: { color: "#fff" },
  };
}

export function OperationsHub({
  trip,
  variant = "default",
  driverTheme,
  hideHeader = false,
  onEditStart,
  onEditEnd,
  onAddFuel,
  onAddToll,
  onOpenExpenses,
}: {
  trip: TripRow;
  /** Pulse intelligence layout — always expanded, compact executive styling. */
  variant?: "default" | "pulse" | "driver";
  /** Required when variant is driver — theme tokens from driver app. */
  driverTheme?: OperationsHubDriverTheme;
  /** Omit top header (e.g. driver tab provides its own hero). */
  hideHeader?: boolean;
  onEditStart?: () => void;
  onEditEnd?: () => void;
  onAddFuel?: () => void;
  onAddToll?: () => void;
  onOpenExpenses?: () => void;
}) {
  const { profile } = useAuth();
  const isPulse = variant === "pulse";
  const isDriver = variant === "driver";
  const isThemed = isPulse || isDriver;
  const [expanded, setExpanded] = useState(isThemed);
  const showDetails = isThemed || expanded;
  const driverHubStyles = useMemo(
    () => (isDriver && driverTheme ? makeDriverHubStyles(driverTheme) : null),
    [isDriver, driverTheme],
  );
  const hubStyles: HubVariantStyles | null = isDriver
    ? driverHubStyles
    : isPulse
      ? (pulseStyles as HubVariantStyles)
      : null;
  const reviewFuel = useReviewTripFuelEntry();
  const reviewToll = useReviewTripTollEntry();
  const setFuelReimbursement = useSetTripFuelReimbursementState();
  const setTollReimbursement = useSetTripTollReimbursementState();
  const snapshot = toVerificationSnapshot(trip);
  const capabilities = getTripOperationalCapabilities(trip);
  const enabledSections = selectOperationsHubSections(trip);
  const summaryQuery = useTripOperationsSummary(trip.id, { enabled: showDetails });
  const timelineQuery = useTripOperationalTimeline(trip.id, { enabled: showDetails });
  const postingEnabled =
    String(process.env.EXPO_PUBLIC_ENABLE_VEHICLE_LEDGER_POSTING ?? "false").toLowerCase() ===
    "true";
  const vehicleLedger = useVehicleOperationsLedger({
    organizationId: trip.organization_id,
    vehicleId: trip.vehicle_id ?? null,
    enabled: showDetails && capabilities.canTrackVehicleEconomics && !!trip.vehicle_id,
  });
  const updatedIdentity = useResolvedIdentity({
    userId: snapshot.odometerUpdatedBy,
    orgId: trip.organization_id,
    verificationState: snapshot.state,
  });
  const health = deriveOperationalHealth(trip);
  const observability = useOperationalObservability({
    tripId: showDetails ? trip.id : null,
    enabled: showDetails,
  });
  const operationalHealth = useOperationalHealthSnapshot({
    organizationId: showDetails ? trip.organization_id : null,
    enabled: showDetails,
  });
  const reconciliation = usePostingReconciliationState(showDetails ? trip.id : null, showDetails);
  const runReconciliation = useRunPostingReconciliation();

  const metrics = useMemo(() => {
    if (!summaryQuery.data) return null;
    return toOperationsDisplayMetrics(summaryQuery.data.mileage);
  }, [summaryQuery.data]);

  const timelineActors = useMemo(() => {
    const ids = (timelineQuery.data ?? [])
      .map((item) => String(item.actor_user_id ?? "").trim())
      .filter(Boolean);
    return Array.from(new Set(ids));
  }, [timelineQuery.data]);
  const timelineIdentities = useResolvedIdentities({
    userIds: timelineActors,
    orgId: trip.organization_id,
  });
  const timelineIdentityByUserId = useMemo(() => {
    const map: Record<string, string> = {};
    for (const identity of timelineIdentities.data ?? []) {
      map[identity.userId] = identity.displayName;
    }
    return map;
  }, [timelineIdentities.data]);

  const pendingFuelApprovals = useMemo(() => {
    const entries = summaryQuery.data?.fuelEntries ?? [];
    return entries.filter(
      (entry) => entry.approval_state === "reported" || entry.approval_state === "review_pending",
    );
  }, [summaryQuery.data?.fuelEntries]);

  const pendingTollApprovals = useMemo(() => {
    const entries = summaryQuery.data?.tollEntries ?? [];
    return entries.filter(
      (entry) => entry.approval_state === "reported" || entry.approval_state === "review_pending",
    );
  }, [summaryQuery.data?.tollEntries]);

  const totalPendingApprovals = pendingFuelApprovals.length + pendingTollApprovals.length;
  const reimbursementEntries = useMemo(
    () =>
      summaryQuery.data
        ? toReimbursableEntries({
            fuelEntries: summaryQuery.data.fuelEntries,
            tollEntries: summaryQuery.data.tollEntries,
          })
        : [],
    [summaryQuery.data],
  );
  const pendingReimbursements = useMemo(
    () => groupPendingReimbursements(reimbursementEntries),
    [reimbursementEntries],
  );

  const ledgerState = useMemo(() => {
    if (!capabilities.canTrackVehicleEconomics) return "aggregation_not_applicable" as const;
    if (!postingEnabled) return "posting_disabled" as const;
    const summary = summaryQuery.data;
    if (!summary) return "loading" as const;
    const operationsCount = summary.fuelEntries.length + summary.tollEntries.length;
    if (operationsCount === 0) return "no_operations" as const;
    if (totalPendingApprovals > 0) return "pending_approval" as const;
    if ((vehicleLedger.data?.approvedEntries ?? 0) > 0) return "accounting_active" as const;
    return "pending_approval" as const;
  }, [
    capabilities.canTrackVehicleEconomics,
    postingEnabled,
    summaryQuery.data,
    totalPendingApprovals,
    vehicleLedger.data?.approvedEntries,
  ]);

  const ledgerMessage = useMemo(() => {
    if (ledgerState === "aggregation_not_applicable") {
      return "Vehicle economics not applicable for aggregation operations";
    }
    if (ledgerState === "posting_disabled") return "Vehicle accounting disabled";
    if (ledgerState === "no_operations") return "No operational expenses logged";
    if (ledgerState === "pending_approval") return "Awaiting accounting approval";
    return null;
  }, [ledgerState]);

  const reconciliationChip = useMemo(() => {
    const state = reconciliation.data?.chip ?? "awaiting_posting";
    if (state === "posted") return { label: "Posted", state: "good" as const };
    if (state === "awaiting_posting") return { label: "Awaiting Posting", state: "pending" as const };
    if (state === "retry_needed") return { label: "Retry Needed", state: "warning" as const };
    if (state === "reconciliation_required")
      return { label: "Reconciliation Required", state: "warning" as const };
    return { label: "Blocked", state: "blocked" as const };
  }, [reconciliation.data?.chip]);

  const operationalCode = useMemo(
    () =>
      getTripOperationalDisplay({
        trip_operational_code: trip.trip_operational_code ?? null,
        trip_code: trip.trip_code ?? null,
        display_trip_id: trip.display_trip_id ?? null,
        trip_number: trip.trip_number ?? null,
      }),
    [trip],
  );

  const vehicleRef = useMemo(
    () =>
      getVehicleOperationalDisplay({
        vehicle_display_number: trip.vehicle_display_number ?? null,
        id: trip.vehicle_id ?? null,
      }),
    [trip.vehicle_display_number, trip.vehicle_id],
  );

  const driverRef = useMemo(
    () =>
      getDriverOperationalDisplay({
        driver_display_name: trip.driver_display_name ?? null,
        id: trip.driver_id ?? null,
      }),
    [trip.driver_display_name, trip.driver_id],
  );

  const syncStateLabel = useMemo(() => {
    if (
      reviewFuel.isPending ||
      reviewToll.isPending ||
      setFuelReimbursement.isPending ||
      setTollReimbursement.isPending ||
      runReconciliation.isPending
    ) {
      return "Syncing";
    }
    if (summaryQuery.isFetching || timelineQuery.isFetching) return "Refreshing";
    if ((operationalHealth.data?.sync.pendingCount ?? 0) > 0) return "Replaying";
    return "Live";
  }, [
    operationalHealth.data?.sync.pendingCount,
    reviewFuel.isPending,
    reviewToll.isPending,
    runReconciliation.isPending,
    setFuelReimbursement.isPending,
    setTollReimbursement.isPending,
    summaryQuery.isFetching,
    timelineQuery.isFetching,
  ]);

  const timelineRows = useMemo(() => {
    const entries = [...(timelineQuery.data ?? [])];
    entries.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
    return entries;
  }, [timelineQuery.data]);

  const latestTimelineEvent = timelineRows[0] ?? null;

  const timelineClusters = useMemo(() => {
    const byDay = new Map<string, typeof timelineRows>();
    for (const item of timelineRows.slice(0, 16)) {
      const dateKey = new Date(item.created_at).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
      });
      const list = byDay.get(dateKey) ?? [];
      list.push(item);
      byDay.set(dateKey, list);
    }
    return Array.from(byDay.entries()).map(([day, items]) => ({ day, items }));
  }, [timelineRows]);

  const healthChips = useMemo(() => {
    const summary = summaryQuery.data;
    const hasOps = !!summary && summary.fuelEntries.length + summary.tollEntries.length > 0;
    return [
      { label: "Verification", state: snapshot.state === "none" ? "pending" : "active" },
      {
        label: "Fuel",
        state: capabilities.canTrackFuel
          ? hasOps && (summary?.fuelEntries.length ?? 0) > 0
            ? "active"
            : "pending"
          : "aggregation-mode",
      },
      {
        label: "Toll",
        state: hasOps && (summary?.tollEntries.length ?? 0) > 0 ? "active" : "pending",
      },
      {
        label: "Mileage",
        state: capabilities.canTrackMileage ? "active" : "unavailable",
      },
      {
        label: "Vehicle Economics",
        state:
          ledgerState === "accounting_active"
            ? "active"
            : ledgerState === "pending_approval"
              ? "pending"
              : ledgerState === "aggregation_not_applicable"
                ? "aggregation-mode"
                : "unavailable",
      },
    ] as ReadonlyArray<{ label: string; state: HealthChipState }>;
  }, [summaryQuery.data, snapshot.state, capabilities, ledgerState]);

  return (
    <View style={[styles.card, hubStyles?.card]}>
      {!hideHeader ? (
        isThemed ? (
        <View style={hubStyles?.header ?? pulseStyles.header}>
          <View style={hubStyles?.headerLeft ?? pulseStyles.headerLeft}>
            <Text style={hubStyles?.title ?? pulseStyles.title}>Operations hub</Text>
            <Text style={hubStyles?.sub ?? pulseStyles.sub}>
              {capabilities.isAssetTrip
                ? "Asset manifest · fuel, toll & vehicle economics"
                : "Aggregation manifest · coordination & verification"}
            </Text>
          </View>
          <VerificationStatusChip state={snapshot.state} />
        </View>
      ) : (
        <Pressable style={styles.header} onPress={() => setExpanded((v) => !v)}>
          <View style={styles.headerLeft}>
            <Text style={styles.title}>Operations Hub</Text>
            <Text style={styles.sub}>
              {capabilities.isAssetTrip
                ? "Asset operations, approval controls and vehicle economics"
                : "Aggregation operations, verification and coordination controls"}
            </Text>
          </View>
          <View style={styles.headerRight}>
            <VerificationStatusChip state={snapshot.state} />
            <Text style={styles.toggle}>{expanded ? "Hide" : "View"}</Text>
          </View>
        </Pressable>
      )
      ) : null}

      <View style={[styles.healthStrip, hubStyles?.healthStrip]}>
        <View style={[styles.execStrip, hubStyles?.execStrip]}>
          <View style={[styles.execCell, hubStyles?.execCell]}>
            <Text style={[styles.execLabel, hubStyles?.execLabel]}>Operational Code</Text>
            <Text style={[styles.execValue, hubStyles?.execValue]}>{operationalCode}</Text>
          </View>
          <View style={[styles.execCell, hubStyles?.execCell]}>
            <Text style={[styles.execLabel, hubStyles?.execLabel]}>Trip Status</Text>
            <Text style={[styles.execValue, hubStyles?.execValue]}>
              {String(trip.status ?? "—").replaceAll("_", " ")}
            </Text>
          </View>
          <View style={[styles.execCell, hubStyles?.execCell]}>
            <Text style={[styles.execLabel, hubStyles?.execLabel]}>Posting</Text>
            <Text style={[styles.execValue, hubStyles?.execValue]}>
              {reconciliationChip.label}
            </Text>
          </View>
          <View style={[styles.execCell, hubStyles?.execCell]}>
            <Text style={[styles.execLabel, hubStyles?.execLabel]}>Approval</Text>
            <Text style={[styles.execValue, hubStyles?.execValue]}>
              {totalPendingApprovals > 0 ? `${totalPendingApprovals} Pending` : "Cleared"}
            </Text>
          </View>
          <View style={[styles.execCell, hubStyles?.execCell]}>
            <Text style={[styles.execLabel, hubStyles?.execLabel]}>Reimbursement</Text>
            <Text style={[styles.execValue, hubStyles?.execValue]}>
              {pendingReimbursements.length > 0 ? `${pendingReimbursements.length} Pending` : "Settled"}
            </Text>
          </View>
          <View style={[styles.execCell, hubStyles?.execCell]}>
            <Text style={[styles.execLabel, hubStyles?.execLabel]}>Sync</Text>
            <Text style={[styles.execValue, hubStyles?.execValue]}>{syncStateLabel}</Text>
          </View>
        </View>
        <View style={styles.healthTop}>
          <Text style={styles.healthLabel}>Operational Health</Text>
          <Text
            style={[
              styles.healthValue,
              health.state === "healthy"
                ? styles.healthOk
                : health.state === "attention"
                  ? styles.healthWarn
                  : styles.healthRisk,
            ]}
          >
            {health.state.replaceAll("_", " ")}
          </Text>
        </View>
        <Text style={styles.healthMessage}>{health.message}</Text>
        <View style={styles.healthChipRow}>
          {healthChips.map((chip) => (
            <View key={chip.label} style={[styles.healthChip, getHealthChipStyle(chip.state)]}>
              <Text style={styles.healthChipText}>{chip.label}</Text>
            </View>
          ))}
        </View>
        <View style={styles.statusChipRow}>
          <View style={[styles.statusChip, getStatusChipStyle(reconciliationChip.state)]}>
            <Text style={styles.statusChipText}>{reconciliationChip.label}</Text>
          </View>
          {observability.data?.postingFailures ? (
            <View style={[styles.statusChip, getStatusChipStyle("warning")]}>
              <Text style={styles.statusChipText}>
                Posting Failures {observability.data.postingFailures}
              </Text>
            </View>
          ) : null}
          {observability.data?.syncQueueFailures ? (
            <View style={[styles.statusChip, getStatusChipStyle("warning")]}>
              <Text style={styles.statusChipText}>
                Queue Failures {observability.data.syncQueueFailures}
              </Text>
            </View>
          ) : null}
          {operationalHealth.data?.queue.approvalBacklog ? (
            <View style={[styles.statusChip, getStatusChipStyle("pending")]}>
              <Text style={styles.statusChipText}>
                Approval Backlog {operationalHealth.data.queue.approvalBacklog}
              </Text>
            </View>
          ) : null}
          {operationalHealth.data?.queue.reimbursementBacklog ? (
            <View style={[styles.statusChip, getStatusChipStyle("warning")]}>
              <Text style={styles.statusChipText}>
                Reimbursement Backlog {operationalHealth.data.queue.reimbursementBacklog}
              </Text>
            </View>
          ) : null}
          {operationalHealth.data?.operatorAttentionRequired ? (
            <View style={[styles.statusChip, getStatusChipStyle("blocked")]}>
              <Text style={styles.statusChipText}>Operator Attention</Text>
            </View>
          ) : null}
          <View style={[styles.statusChip, getStatusChipStyle(syncStateLabel === "Live" ? "good" : "pending")]}>
            <Text style={styles.statusChipText}>{syncStateLabel}</Text>
          </View>
          {operationalHealth.data?.sync.pendingCount ? (
            <View style={[styles.statusChip, getStatusChipStyle("pending")]}>
              <Text style={styles.statusChipText}>
                Replay Queue {operationalHealth.data.sync.pendingCount}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      {showDetails ? (
        <>
          <View style={styles.sectionsRow}>
            <Text style={styles.metricMeta}>Sections: {enabledSections.join(" • ")}</Text>
            <Text style={styles.metricMeta}>
              Owner: {capabilities.operationalOwner.replaceAll("_", " ")} · Mode:{" "}
              {capabilities.accountingMode.replaceAll("_", " ")}
            </Text>
            {!capabilities.canTrackVehicleEconomics ? (
              <Text style={styles.metricMeta}>
                Operations tracked without owned asset accounting.
              </Text>
            ) : null}
          </View>

          {summaryQuery.isLoading ? (
            <Text style={styles.loading}>Loading operations…</Text>
          ) : summaryQuery.data ? (
            <View style={[styles.compactGrid, hubStyles?.compactGrid]}>
              <View style={[styles.compactCell, hubStyles?.compactCell]}>
                <Text style={[styles.compactLabel, hubStyles?.compactLabel]}>Distance</Text>
                <Text style={[styles.compactValue, hubStyles?.compactValue]}>
                  {km(summaryQuery.data.mileage.distanceKm ?? snapshot.odometerDistanceKm)}
                </Text>
              </View>
              <View style={[styles.compactCell, hubStyles?.compactCell]}>
                <Text style={[styles.compactLabel, hubStyles?.compactLabel]}>Fuel</Text>
                <Text style={[styles.compactValue, hubStyles?.compactValue]}>
                  {capabilities.canTrackFuel
                    ? inr(summaryQuery.data.mileage.totalFuelSpendInr)
                    : "Notes only"}
                </Text>
              </View>
              <View style={[styles.compactCell, hubStyles?.compactCell]}>
                <Text style={[styles.compactLabel, hubStyles?.compactLabel]}>Toll</Text>
                <Text style={[styles.compactValue, hubStyles?.compactValue]}>
                  {inr(summaryQuery.data.mileage.totalTollSpendInr)}
                </Text>
              </View>
              <View style={[styles.compactCell, hubStyles?.compactCell]}>
                <Text style={[styles.compactLabel, hubStyles?.compactLabel]}>Cost/KM</Text>
                <Text style={[styles.compactValue, hubStyles?.compactValue]}>
                  {capabilities.canTrackVehicleEconomics
                    ? metrics?.fuelCostPerKmLabel ?? "—"
                    : "N/A"}
                </Text>
              </View>
              <View style={[styles.compactCell, hubStyles?.compactCell]}>
                <Text style={[styles.compactLabel, hubStyles?.compactLabel]}>KM/L</Text>
                <Text style={[styles.compactValue, hubStyles?.compactValue]}>
                  {capabilities.canTrackMileage ? metrics?.efficiencyLabel ?? "—" : "N/A"}
                </Text>
              </View>
              <View style={[styles.compactCell, hubStyles?.compactCell]}>
                <Text style={[styles.compactLabel, hubStyles?.compactLabel]}>Trust</Text>
                <Text style={[styles.compactValue, hubStyles?.compactValue]}>
                  {updatedIdentity.data?.trustLevel?.toUpperCase() ?? "LOW"}
                </Text>
              </View>
            </View>
          ) : (
            <Text style={styles.loading}>No operations data yet.</Text>
          )}
          {summaryQuery.data ? (
            <View style={styles.metricsTable}>
              <Text style={styles.sectionTitle}>Operational Metrics</Text>
              <Text style={styles.metricMeta}>
                Total Ops {inr(summaryQuery.data.mileage.tripOperatingCostInr)} ·
                Maintenance {inr(summaryQuery.data.mileage.totalMaintenanceSpendInr)} ·
                Operating Ratio{" "}
                {summaryQuery.data.mileage.operatingRatio != null
                  ? `${summaryQuery.data.mileage.operatingRatio.toFixed(1)}%`
                  : "—"}
              </Text>
            </View>
          ) : null}

          <View style={styles.ledgerStateRow}>
            <Text style={styles.sectionTitle}>Vehicle Ledger</Text>
            {ledgerState === "accounting_active" && vehicleLedger.data ? (
              <Text style={styles.metricMeta}>
                {inr(vehicleLedger.data.approvedSpendInr)} total · Fuel{" "}
                {inr(vehicleLedger.data.approvedFuelSpendInr)} · Toll{" "}
                {inr(vehicleLedger.data.approvedTollSpendInr)} · Cost/KM{" "}
                {vehicleLedger.data.approvedCostPerKm != null
                  ? `₹${vehicleLedger.data.approvedCostPerKm.toFixed(2)}`
                  : "—"}
              </Text>
            ) : (
              <Text style={styles.metricMeta}>{ledgerMessage}</Text>
            )}
          </View>

          <View style={[styles.expenseControlCard, hubStyles?.expenseControlCard]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.sectionTitle, hubStyles?.sectionTitle]}>
                Expense Control Layer
              </Text>
              <Text style={styles.metricMeta}>
                {totalPendingApprovals} approval pending · {pendingReimbursements.length} settlement pending
              </Text>
              <Text style={styles.metricMeta}>
                Approval, posting and settlement actions are centralized in Expense Control.
              </Text>
            </View>
            <Pressable
              style={[styles.expenseControlBtn, hubStyles?.expenseControlBtn]}
              onPress={onOpenExpenses}
            >
              <Text style={[styles.expenseControlBtnText, hubStyles?.expenseControlBtnText]}>
                Open Expenses
              </Text>
            </Pressable>
          </View>

          <View style={[styles.timelineWrap, hubStyles?.timelineWrap]}>
            <Text style={[styles.sectionTitle, hubStyles?.sectionTitle]}>
              Operational Timeline
            </Text>
            {latestTimelineEvent ? (
              <View style={styles.latestEventWrap}>
                <Text style={styles.latestEventLabel}>Latest Event</Text>
                <Text style={styles.latestEventText} numberOfLines={1}>
                  {String(latestTimelineEvent.event_type).replaceAll("_", " ")} ·{" "}
                  {String(
                    timelineIdentityByUserId[String(latestTimelineEvent.actor_user_id ?? "")] ??
                      "System",
                  )}
                </Text>
              </View>
            ) : null}
            {timelineRows.length === 0 ? (
              <Text style={styles.metricMeta}>No operations events yet.</Text>
            ) : (
              timelineClusters.map((cluster) => (
                <View key={cluster.day} style={styles.timelineCluster}>
                  <Text style={styles.timelineClusterLabel}>{cluster.day}</Text>
                  {cluster.items.map((item) => (
                    <View key={item.id} style={styles.timelineRow}>
                      <View
                        style={[
                          styles.timelineSeverityMarker,
                          eventSeverity(item.event_type) === "critical"
                            ? styles.timelineSeverityCritical
                            : eventSeverity(item.event_type) === "warning"
                              ? styles.timelineSeverityWarning
                              : styles.timelineSeverityNeutral,
                        ]}
                      />
                      <Text style={styles.timelineSummary} numberOfLines={1}>
                        {String(item.event_type).replaceAll("_", " ")} ·{" "}
                        {String(
                          timelineIdentityByUserId[String(item.actor_user_id ?? "")] ?? "System",
                        )}{" "}
                        ·{" "}
                        {String((item.payload as { amountInr?: number | null })?.amountInr ?? "").trim()
                          ? inr(Number((item.payload as { amountInr?: number }).amountInr ?? 0))
                          : "Event"}
                      </Text>
                      <Text style={styles.timelineTime}>
                        {new Date(item.created_at).toLocaleString("en-IN", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </Text>
                    </View>
                  ))}
                </View>
              ))
            )}
          </View>

          <OperationalBottomActionBar reserveSafeArea={false} style={styles.actionBar}>
            <View style={[styles.actions, hubStyles?.actions]}>
              {capabilities.canTrackFuel ? (
                <Pressable
                  style={[styles.actionBtn, hubStyles?.actionBtnPrimary]}
                  onPress={onAddFuel}
                >
                  <Text style={[styles.actionText, hubStyles?.actionTextPrimary]}>Fuel</Text>
                </Pressable>
              ) : null}
              <Pressable
                style={[styles.actionBtn, hubStyles?.actionBtn]}
                onPress={onAddToll}
              >
                <Text style={[styles.actionText, hubStyles?.actionText]}>Toll</Text>
              </Pressable>
              <Pressable
                style={[styles.actionBtn, hubStyles?.actionBtn]}
                onPress={onOpenExpenses}
              >
                <Text style={[styles.actionText, hubStyles?.actionText]}>Expenses</Text>
              </Pressable>
              <Pressable
                style={[styles.actionBtn, hubStyles?.actionBtn]}
                onPress={onEditStart}
              >
                <Text style={[styles.actionText, hubStyles?.actionText]}>Start KM</Text>
              </Pressable>
              <Pressable
                style={[styles.actionBtn, hubStyles?.actionBtn]}
                onPress={onEditEnd}
              >
                <Text style={[styles.actionText, hubStyles?.actionText]}>End KM</Text>
              </Pressable>
              <Pressable
                style={[styles.actionBtn, hubStyles?.actionBtnDark]}
                onPress={() =>
                  void runReconciliation.mutateAsync({
                    tripId: trip.id,
                    actorUserId: profile?.uid ?? null,
                  })
                }
              >
                <Text style={[styles.actionText, hubStyles?.actionTextOnDark]}>
                  Reconcile
                </Text>
              </Pressable>
              <View style={styles.actionStatusPill}>
                <Text style={styles.actionStatusText}>
                  Driver {driverRef} · Vehicle {vehicleRef}
                </Text>
              </View>
            </View>
          </OperationalBottomActionBar>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.border,
    borderRadius: 16,
    padding: 14,
    gap: 12,
  },
  header: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  headerLeft: { flex: 1 },
  headerRight: { alignItems: "flex-end", gap: 4 },
  title: { color: Theme.text, fontSize: 15, fontWeight: "700" },
  sub: { color: Theme.textSecondary, fontSize: 12, marginTop: 2 },
  toggle: { color: Theme.textSecondary, fontSize: 11, fontWeight: "700" },
  healthStrip: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.border,
    backgroundColor: Theme.whiteMuted,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 6,
  },
  healthTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  healthLabel: { color: Theme.textSecondary, fontSize: 11, fontWeight: "700" },
  execStrip: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.border,
    paddingBottom: 6,
  },
  execCell: {
    width: "31%",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 5,
    backgroundColor: Theme.surface,
  },
  execLabel: { color: Theme.textSecondary, fontSize: 9, fontWeight: "700" },
  execValue: { color: Theme.text, fontSize: 11, fontWeight: "700", marginTop: 1 },
  healthValue: { fontSize: 11, fontWeight: "700" },
  healthMessage: { color: Theme.textSecondary, fontSize: 11 },
  healthChipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  healthChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Theme.border,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: Theme.surface,
  },
  chip_active: { backgroundColor: Theme.whiteMuted, borderColor: Theme.success },
  chip_pending: { backgroundColor: Theme.whiteMuted, borderColor: Theme.warning },
  chip_unavailable: { backgroundColor: Theme.whiteMuted, borderColor: Theme.border },
  chip_aggregation_mode: { backgroundColor: Theme.whiteMuted, borderColor: Theme.primary },
  healthChipText: { color: Theme.text, fontSize: 10, fontWeight: "700" },
  statusChipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  statusChip: {
    borderWidth: 1,
    borderColor: Theme.border,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  statusChipText: { color: Theme.text, fontSize: 10, fontWeight: "700" },
  statusChipGood: { backgroundColor: Theme.whiteMuted, borderColor: Theme.success },
  statusChipPending: { backgroundColor: Theme.whiteMuted, borderColor: Theme.warning },
  statusChipWarning: { backgroundColor: Theme.whiteMuted, borderColor: Theme.warning },
  statusChipBlocked: { backgroundColor: Theme.whiteMuted, borderColor: Theme.negative },
  healthOk: { color: Theme.positive },
  healthWarn: { color: Theme.warning },
  healthRisk: { color: Theme.negative },
  compactGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    borderWidth: 1,
    borderColor: Theme.border,
    borderRadius: 10,
    overflow: "hidden",
  },
  compactCell: {
    width: "50%",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
  },
  compactLabel: { color: Theme.textSecondary, fontSize: 10, fontWeight: "700" },
  compactValue: { color: Theme.text, fontSize: 12, fontWeight: "700", marginTop: 1 },
  ledgerStateRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
    paddingVertical: 8,
    gap: 2,
  },
  metricMeta: { color: Theme.textSecondary, fontSize: 11 },
  loading: { color: Theme.textSecondary, fontSize: 12 },
  sectionTitle: { color: Theme.textSecondary, fontSize: 11, fontWeight: "700" },
  metricsTable: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 2,
  },
  expenseControlCard: {
    marginTop: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
    borderRadius: 10,
    backgroundColor: Theme.whiteMuted,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 6,
  },
  expenseControlBtn: {
    borderWidth: 1,
    borderColor: Theme.primary,
    backgroundColor: Theme.primary,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 7,
    paddingHorizontal: 10,
  },
  expenseControlBtnText: {
    color: Theme.surface,
    fontSize: 11,
    fontWeight: "700",
  },
  sectionsRow: { gap: 2 },
  timelineWrap: { gap: 0, borderTopWidth: StyleSheet.hairlineWidth, borderColor: Theme.border },
  latestEventWrap: {
    marginTop: 6,
    marginBottom: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: Theme.whiteMuted,
  },
  latestEventLabel: { color: Theme.textSecondary, fontSize: 10, fontWeight: "700" },
  latestEventText: { color: Theme.text, fontSize: 11, fontWeight: "700", marginTop: 2 },
  timelineCluster: { marginTop: 2 },
  timelineClusterLabel: {
    color: Theme.textSecondary,
    fontSize: 10,
    fontWeight: "700",
    marginTop: 4,
    marginBottom: 2,
  },
  timelineRow: {
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  timelineSeverityMarker: {
    width: 6,
    height: 6,
    borderRadius: 99,
    marginTop: 2,
  },
  timelineSeverityNeutral: { backgroundColor: Theme.textSecondary },
  timelineSeverityWarning: { backgroundColor: Theme.warning },
  timelineSeverityCritical: { backgroundColor: Theme.negative },
  timelineSummary: { color: Theme.text, fontSize: 11, fontWeight: "600", flex: 1 },
  timelineTime: { color: Theme.textSecondary, fontSize: 10 },
  timelineMeta: { color: Theme.textSecondary, fontSize: 11 },
  queueWrap: { marginTop: 8, gap: 6 },
  queueItemCompact: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  queueActions: { flexDirection: "row", gap: 8 },
  queueBtn: {
    borderWidth: 1,
    borderColor: Theme.border,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: Theme.whiteMuted,
  },
  queueBtnText: { color: Theme.text, fontSize: 10, fontWeight: "700" },
  actionBar: { marginTop: 8, borderTopWidth: 0, paddingHorizontal: 0, paddingBottom: 0 },
  actions: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  actionBtn: {
    flex: 1,
    minWidth: 70,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    paddingHorizontal: 8,
    backgroundColor: Theme.whiteMuted,
  },
  actionText: { color: Theme.text, fontSize: 11, fontWeight: "700" },
  actionStatusPill: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: Theme.surface,
    minWidth: "100%",
  },
  actionStatusText: { color: Theme.textSecondary, fontSize: 10, fontWeight: "700" },
});

const pulseStyles = StyleSheet.create({
  card: {
    borderRadius: 22,
    borderColor: "#e8ecf4",
    backgroundColor: "#fff",
    padding: 12,
    gap: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  headerLeft: { flex: 1, minWidth: 0 },
  title: {
    fontSize: 11,
    fontWeight: "800",
    color: "#0f172a",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  sub: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textMuted,
    lineHeight: 14,
  },
  healthStrip: {
    borderRadius: 14,
    borderColor: "#eef2f7",
    backgroundColor: "#f8fafc",
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  execStrip: {
    borderBottomColor: "#eef2f7",
    gap: 8,
  },
  execCell: {
    width: "48%",
    borderRadius: 10,
    borderColor: "#eef2f7",
    backgroundColor: "#fff",
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  execLabel: {
    fontSize: 8,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.7,
    color: "#94a3b8",
  },
  execValue: {
    fontSize: 11,
    fontWeight: "700",
    color: "#0f172a",
  },
  compactGrid: {
    borderRadius: 14,
    borderColor: "#eef2f7",
    overflow: "hidden",
  },
  compactCell: {
    backgroundColor: "#fff",
    borderColor: "#eef2f7",
    paddingVertical: 10,
  },
  compactLabel: {
    fontSize: 8,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    color: "#94a3b8",
  },
  compactValue: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0f172a",
  },
  sectionTitle: {
    fontSize: 9,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    color: "#64748b",
  },
  expenseControlCard: {
    borderRadius: 14,
    borderColor: "#eef2f7",
    backgroundColor: "#f8fafc",
    flexDirection: "column",
    alignItems: "stretch",
    gap: 8,
  },
  expenseControlBtn: {
    borderRadius: 10,
    backgroundColor: "#0f172a",
    borderColor: "#0f172a",
    width: "100%",
  },
  expenseControlBtnText: {
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  timelineWrap: {
    borderTopColor: "#eef2f7",
    paddingTop: 8,
  },
  actions: {
    gap: 6,
  },
  actionBtn: {
    borderRadius: 10,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
    minWidth: "30%",
    flexGrow: 1,
  },
  actionBtnPrimary: {
    backgroundColor: "#eef2ff",
    borderColor: "#c7d2fe",
  },
  actionBtnDark: {
    backgroundColor: "#0f172a",
    borderColor: "#0f172a",
  },
  actionText: {
    fontSize: 9,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    color: "#334155",
  },
  actionTextPrimary: {
    color: "#4338ca",
  },
  actionTextOnDark: {
    color: "#fff",
  },
});
