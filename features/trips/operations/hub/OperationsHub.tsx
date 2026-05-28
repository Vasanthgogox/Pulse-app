import { Pressable, StyleSheet, Text, View } from "react-native";
import { useMemo, useState } from "react";
import Theme from "@/constants/Theme";
import { useAuth } from "@/contexts/AuthContext";
import { useResolvedIdentities, useResolvedIdentity } from "@/features/identity";
import {
  useOperationalHealthSnapshot,
  useOperationalObservability,
} from "@/features/operations/observability";
import type { TripRow } from "@/features/trips/services/trips.service";
import {
  getActorOperationalPermissions,
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
  deriveReimbursementChipLabel,
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

function paymentOwnerLabel(owner: string | null | undefined): string {
  const v = String(owner ?? "").toLowerCase();
  if (v === "driver") return "Paid by Driver";
  if (v === "organization") return "Paid by Organization";
  if (v === "supplier") return "Paid by Supplier";
  return "Pending Settlement";
}

function getStatusChipStyle(state: StatusChipState) {
  if (state === "good") return styles.statusChipGood;
  if (state === "pending") return styles.statusChipPending;
  if (state === "warning") return styles.statusChipWarning;
  return styles.statusChipBlocked;
}

export function OperationsHub({
  trip,
  onEditStart,
  onEditEnd,
  onAddFuel,
  onAddToll,
}: {
  trip: TripRow;
  onEditStart?: () => void;
  onEditEnd?: () => void;
  onAddFuel?: () => void;
  onAddToll?: () => void;
}) {
  const { profile } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const reviewFuel = useReviewTripFuelEntry();
  const reviewToll = useReviewTripTollEntry();
  const setFuelReimbursement = useSetTripFuelReimbursementState();
  const setTollReimbursement = useSetTripTollReimbursementState();
  const snapshot = toVerificationSnapshot(trip);
  const capabilities = getTripOperationalCapabilities(trip);
  const actorPermissions = getActorOperationalPermissions(profile?.role ?? null);
  const enabledSections = selectOperationsHubSections(trip);
  const summaryQuery = useTripOperationsSummary(trip.id, { enabled: expanded });
  const timelineQuery = useTripOperationalTimeline(trip.id, { enabled: expanded });
  const postingEnabled =
    String(process.env.EXPO_PUBLIC_ENABLE_VEHICLE_LEDGER_POSTING ?? "false").toLowerCase() ===
    "true";
  const vehicleLedger = useVehicleOperationsLedger({
    organizationId: trip.organization_id,
    vehicleId: trip.vehicle_id ?? null,
    enabled: expanded && capabilities.canTrackVehicleEconomics && !!trip.vehicle_id,
  });
  const updatedIdentity = useResolvedIdentity({
    userId: snapshot.odometerUpdatedBy,
    orgId: trip.organization_id,
    verificationState: snapshot.state,
  });
  const health = deriveOperationalHealth(trip);
  const observability = useOperationalObservability({
    tripId: expanded ? trip.id : null,
    enabled: expanded,
  });
  const operationalHealth = useOperationalHealthSnapshot({
    organizationId: expanded ? trip.organization_id : null,
    enabled: expanded,
  });
  const reconciliation = usePostingReconciliationState(expanded ? trip.id : null, expanded);
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

  const handleApproveFuel = async (fuelEntryId: string) => {
    await reviewFuel.mutateAsync({
      tripId: trip.id,
      fuelEntryId,
      approvalState: "approved",
      reviewerUserId: profile?.uid ?? null,
    });
  };

  const handleRejectFuel = async (fuelEntryId: string) => {
    await reviewFuel.mutateAsync({
      tripId: trip.id,
      fuelEntryId,
      approvalState: "rejected",
      reviewerUserId: profile?.uid ?? null,
    });
  };

  const handleApproveToll = async (tollEntryId: string) => {
    await reviewToll.mutateAsync({
      tripId: trip.id,
      tollEntryId,
      approvalState: "approved",
      reviewerUserId: profile?.uid ?? null,
    });
  };

  const handleRejectToll = async (tollEntryId: string) => {
    await reviewToll.mutateAsync({
      tripId: trip.id,
      tollEntryId,
      approvalState: "rejected",
      reviewerUserId: profile?.uid ?? null,
    });
  };

  const handleSetFuelReimbursement = async (
    fuelEntryId: string,
    nextState: "reimbursement_pending" | "reimbursed" | "rejected",
  ) => {
    await setFuelReimbursement.mutateAsync({
      tripId: trip.id,
      fuelEntryId,
      nextState,
      actorUserId: profile?.uid ?? null,
    });
  };

  const handleSetTollReimbursement = async (
    tollEntryId: string,
    nextState: "reimbursement_pending" | "reimbursed" | "rejected",
  ) => {
    await setTollReimbursement.mutateAsync({
      tripId: trip.id,
      tollEntryId,
      nextState,
      actorUserId: profile?.uid ?? null,
    });
  };

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
    <View style={styles.card}>
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

      <View style={styles.healthStrip}>
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
        </View>
      </View>

      {expanded ? (
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
            <View style={styles.compactGrid}>
              <View style={styles.compactCell}>
                <Text style={styles.compactLabel}>Distance</Text>
                <Text style={styles.compactValue}>
                  {km(summaryQuery.data.mileage.distanceKm ?? snapshot.odometerDistanceKm)}
                </Text>
              </View>
              <View style={styles.compactCell}>
                <Text style={styles.compactLabel}>Fuel</Text>
                <Text style={styles.compactValue}>
                  {capabilities.canTrackFuel
                    ? inr(summaryQuery.data.mileage.totalFuelSpendInr)
                    : "Notes only"}
                </Text>
              </View>
              <View style={styles.compactCell}>
                <Text style={styles.compactLabel}>Toll</Text>
                <Text style={styles.compactValue}>{inr(summaryQuery.data.mileage.totalTollSpendInr)}</Text>
              </View>
              <View style={styles.compactCell}>
                <Text style={styles.compactLabel}>Cost/KM</Text>
                <Text style={styles.compactValue}>
                  {capabilities.canTrackVehicleEconomics
                    ? metrics?.fuelCostPerKmLabel ?? "—"
                    : "N/A"}
                </Text>
              </View>
              <View style={styles.compactCell}>
                <Text style={styles.compactLabel}>KM/L</Text>
                <Text style={styles.compactValue}>
                  {capabilities.canTrackMileage ? metrics?.efficiencyLabel ?? "—" : "N/A"}
                </Text>
              </View>
              <View style={styles.compactCell}>
                <Text style={styles.compactLabel}>Trust</Text>
                <Text style={styles.compactValue}>
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

          {actorPermissions.canApproveOperationalEvents && totalPendingApprovals > 0 ? (
            <View style={styles.queueWrap}>
              <Text style={styles.sectionTitle}>Approval Queue ({totalPendingApprovals})</Text>
              {pendingFuelApprovals.slice(0, 3).map((entry) => (
                <View key={entry.id} style={styles.queueItemCompact}>
                  <Text style={styles.timelineMeta} numberOfLines={1}>
                    Fuel {inr(Number(entry.amount_inr ?? 0))} · {paymentOwnerLabel(entry.payment_owner)}
                  </Text>
                  <View style={styles.queueActions}>
                    <Pressable style={styles.queueBtn} onPress={() => void handleApproveFuel(entry.id)}>
                      <Text style={styles.queueBtnText}>Approve</Text>
                    </Pressable>
                    <Pressable style={styles.queueBtn} onPress={() => void handleRejectFuel(entry.id)}>
                      <Text style={styles.queueBtnText}>Reject</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
              {pendingTollApprovals.slice(0, 3).map((entry) => (
                <View key={entry.id} style={styles.queueItemCompact}>
                  <Text style={styles.timelineMeta} numberOfLines={1}>
                    Toll {inr(Number(entry.amount_inr ?? 0))} · {paymentOwnerLabel(entry.payment_owner)}
                  </Text>
                  <View style={styles.queueActions}>
                    <Pressable style={styles.queueBtn} onPress={() => void handleApproveToll(entry.id)}>
                      <Text style={styles.queueBtnText}>Approve</Text>
                    </Pressable>
                    <Pressable style={styles.queueBtn} onPress={() => void handleRejectToll(entry.id)}>
                      <Text style={styles.queueBtnText}>Reject</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          ) : null}

          {pendingReimbursements.length > 0 ? (
            <View style={styles.queueWrap}>
              <Text style={styles.sectionTitle}>
                Pending Reimbursements ({pendingReimbursements.length})
              </Text>
              {pendingReimbursements.slice(0, 4).map((entry) => (
                <View key={`${entry.kind}-${entry.id}`} style={styles.queueItemCompact}>
                  <Text style={styles.timelineMeta} numberOfLines={1}>
                    {entry.kind.toUpperCase()} {inr(entry.amount_inr)} ·{" "}
                    {deriveReimbursementChipLabel(entry.reimbursement_state ?? "reported")}
                  </Text>
                  <View style={styles.queueActions}>
                    {entry.kind === "fuel" ? (
                      <>
                        <Pressable
                          style={styles.queueBtn}
                          onPress={() => void handleSetFuelReimbursement(entry.id, "reimbursement_pending")}
                        >
                          <Text style={styles.queueBtnText}>Queue</Text>
                        </Pressable>
                        <Pressable
                          style={styles.queueBtn}
                          onPress={() => void handleSetFuelReimbursement(entry.id, "reimbursed")}
                        >
                          <Text style={styles.queueBtnText}>Reimbursed</Text>
                        </Pressable>
                      </>
                    ) : (
                      <>
                        <Pressable
                          style={styles.queueBtn}
                          onPress={() => void handleSetTollReimbursement(entry.id, "reimbursement_pending")}
                        >
                          <Text style={styles.queueBtnText}>Queue</Text>
                        </Pressable>
                        <Pressable
                          style={styles.queueBtn}
                          onPress={() => void handleSetTollReimbursement(entry.id, "reimbursed")}
                        >
                          <Text style={styles.queueBtnText}>Reimbursed</Text>
                        </Pressable>
                      </>
                    )}
                  </View>
                </View>
              ))}
            </View>
          ) : null}

          <View style={styles.timelineWrap}>
            <Text style={styles.sectionTitle}>Operational Timeline</Text>
            {(timelineQuery.data?.length ?? 0) === 0 ? (
              <Text style={styles.metricMeta}>No operations events yet.</Text>
            ) : (
              (timelineQuery.data ?? []).slice(0, 16).map((item) => (
                <View key={item.id} style={styles.timelineRow}>
                  <Text style={styles.timelineSummary} numberOfLines={1}>
                    {String(item.event_type).replaceAll("_", " ")} ·{" "}
                    {String(
                      timelineIdentityByUserId[String(item.actor_user_id ?? "")] ?? "System",
                    )}{" "}
                    · {String((item.payload as { amountInr?: number | null })?.amountInr ?? "").trim()
                      ? inr(Number((item.payload as { amountInr?: number }).amountInr ?? 0))
                      : "Event"}
                  </Text>
                  <Text style={styles.timelineTime}>
                    {new Date(item.created_at).toLocaleString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Text>
                </View>
              ))
            )}
          </View>

          <OperationalBottomActionBar reserveSafeArea={false} style={styles.actionBar}>
            <View style={styles.actions}>
              {capabilities.canTrackFuel ? (
                <Pressable style={styles.actionBtn} onPress={onAddFuel}>
                  <Text style={styles.actionText}>Fuel</Text>
                </Pressable>
              ) : null}
              <Pressable style={styles.actionBtn} onPress={onAddToll}>
                <Text style={styles.actionText}>Toll</Text>
              </Pressable>
              <Pressable style={styles.actionBtn} onPress={onEditStart}>
                <Text style={styles.actionText}>Start KM</Text>
              </Pressable>
              <Pressable style={styles.actionBtn} onPress={onEditEnd}>
                <Text style={styles.actionText}>End KM</Text>
              </Pressable>
              <Pressable
                style={styles.actionBtn}
                onPress={() =>
                  void runReconciliation.mutateAsync({
                    tripId: trip.id,
                    actorUserId: profile?.uid ?? null,
                  })
                }
              >
                <Text style={styles.actionText}>Reconcile</Text>
              </Pressable>
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
  chip_active: { backgroundColor: "#e8f8ef", borderColor: "#a7f3d0" },
  chip_pending: { backgroundColor: "#fff7ed", borderColor: "#fdba74" },
  chip_unavailable: { backgroundColor: "#f1f5f9", borderColor: "#cbd5e1" },
  chip_aggregation_mode: { backgroundColor: "#eef2ff", borderColor: "#c7d2fe" },
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
  sectionsRow: { gap: 2 },
  timelineWrap: { gap: 0, borderTopWidth: StyleSheet.hairlineWidth, borderColor: Theme.border },
  timelineRow: {
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
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
});
