import { type Href, useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { Activity, ChevronRight, Gauge, Wallet } from "lucide-react-native";
import { useCallback, useMemo, type ReactNode } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { useDriverThemeColors } from "@/contexts/DriverThemeContext";
import { DriverTripExpenseLogSection } from "@/features/driver/components/DriverTripExpenseLogSection";
import { tripHistoryDetailStyles as td } from "@/features/driver/tripHistory/tripHistoryDetail.styles";
import { useTripOperationsSummary } from "@/features/trips/operations/queries/useTripOperations";
import type { TripRow } from "@/features/trips/services/trips.service";
import { queryKeys } from "@/lib/queryKeys";
import { ROUTES, tripExpenseEntryEditRoute } from "@/lib/routes";
import { useQueryClient } from "@tanstack/react-query";
import { useGPSDistanceEstimate } from "@/features/trips/verification/GPSDistanceHook";
import { VerificationStatusChip } from "@/features/trips/verification/components/VerificationStatusChip";
import { useTripVerification } from "@/features/trips/verification/queries/useTripVerification";
import {
  buildOdometerGpsComparisonHint,
  formatKm,
  toVerificationSnapshot,
} from "@/features/trips/verification/selectors/verificationSelectors";
import { computeDistanceDiscrepancy } from "@/features/trips/verification/verification.service";
import Theme from "@/constants/Theme";

type OperationsSyncState = {
  isSyncing: boolean;
  lastResult?: { failed?: number; processed?: number } | null;
};

type Props = {
  trip: TripRow;
  operationsSync: OperationsSyncState;
  initialSelectedExpenseId?: string | null;
};

function inr(v: number): string {
  return `₹${Math.round(v).toLocaleString("en-IN")}`;
}

function TimelineSectionHeader({
  icon,
  title,
  trailing,
  colors,
}: {
  icon: ReactNode;
  title: string;
  trailing?: ReactNode;
  colors: ReturnType<typeof useDriverThemeColors>;
}) {
  return (
    <View style={td.tdTimelineHeader}>
      <View style={td.tdTimelineHeaderIcon}>{icon}</View>
      <Text style={[td.tdTimelineHeaderTitle, { color: colors.text }]} numberOfLines={1}>
        {title}
      </Text>
      {trailing}
    </View>
  );
}

export function DriverTripOperationsTab({
  trip,
  operationsSync,
  initialSelectedExpenseId,
}: Props) {
  const router = useRouter();
  const colors = useDriverThemeColors();
  const queryClient = useQueryClient();

  const odometerCaptureHref =
    `/trip/${encodeURIComponent(trip.id)}/verification?side=both` as Href;

  const verificationQuery = useTripVerification(trip.id);
  const snapshot = verificationQuery.data ?? toVerificationSnapshot(trip);
  const gpsEstimate = useGPSDistanceEstimate(trip);
  const summaryQuery = useTripOperationsSummary(trip.id);

  useFocusEffect(
    useCallback(() => {
      if (!trip.id) return;
      void queryClient.invalidateQueries({
        queryKey: queryKeys.trips.operationsSummary(trip.id),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.trips.verification(trip.id),
      });
    }, [queryClient, trip.id]),
  );

  const costEvents = summaryQuery.data?.costEvents ?? [];
  const reimbursementDueInr =
    summaryQuery.data?.financialSnapshot?.payableOutstandingInr ?? 0;
  const totalExpensesInr = useMemo(
    () => costEvents.reduce((sum, event) => sum + Math.max(0, event.amount), 0),
    [costEvents],
  );
  const pendingCount = costEvents.filter(
    (e) => e.settlementState !== "settled" && e.approvalState !== "rejected",
  ).length;
  const settledCount = costEvents.filter((e) => e.settlementState === "settled").length;

  const distanceKm =
    summaryQuery.data?.mileage.distanceKm ??
    snapshot.odometerDistanceKm ??
    (trip.distance != null ? Number(trip.distance) : null);

  const syncLabel = operationsSync.isSyncing
    ? "Syncing"
    : operationsSync.lastResult?.failed
      ? `Retry (${operationsSync.lastResult.failed})`
      : "Live";

  const statusMessage =
    pendingCount > 0
      ? `${pendingCount} expense${pendingCount === 1 ? "" : "s"} awaiting fleet review`
      : reimbursementDueInr > 0
        ? `${inr(reimbursementDueInr)} pending reimbursement`
        : costEvents.length > 0
          ? "All expenses settled"
          : "No expenses yet";

  const summaryMetrics = [
    { label: "Distance", value: summaryQuery.isLoading ? "…" : formatKm(distanceKm) },
    { label: "Expenses", value: summaryQuery.isLoading ? "…" : inr(totalExpensesInr) },
    { label: "Due", value: summaryQuery.isLoading ? "…" : inr(reimbursementDueInr) },
    {
      label: "Settled",
      value: summaryQuery.isLoading ? "…" : `${settledCount}/${costEvents.length || 0}`,
    },
  ];

  const odometerMetrics = [
    { label: "Start", value: formatKm(snapshot.startOdometerKm) },
    { label: "End", value: formatKm(snapshot.endOdometerKm) },
    { label: "Trip", value: formatKm(snapshot.odometerDistanceKm) },
  ];

  const gpsDistanceKm = snapshot.gpsDistanceKm ?? gpsEstimate;
  const distanceDiscrepancyKm =
    snapshot.distanceDiscrepancyKm ??
    computeDistanceDiscrepancy(snapshot.odometerDistanceKm, gpsDistanceKm);
  const odometerComparisonHint = buildOdometerGpsComparisonHint({
    startOdometerKm: snapshot.startOdometerKm,
    endOdometerKm: snapshot.endOdometerKm,
    odometerDistanceKm: snapshot.odometerDistanceKm,
    gpsDistanceKm,
    distanceDiscrepancyKm,
  });

  return (
    <View style={styles.wrap}>
      <TimelineSectionHeader
        icon={<Gauge size={13} color="#ffffff" strokeWidth={2.2} />}
        title="Odometer"
        colors={colors}
      />

      <TouchableOpacity
        style={[
          td.tdTimelineCard,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
        onPress={() => router.push(odometerCaptureHref)}
        activeOpacity={0.86}
      >
        <View style={styles.odometerTopRow}>
          <VerificationStatusChip state={snapshot.state} compact />
          <View style={styles.odometerAction}>
            <Text style={[td.tdLogMetaV, { color: colors.emerald, fontWeight: "700" }]}>Update</Text>
            <ChevronRight size={14} color={colors.emerald} strokeWidth={2.4} />
          </View>
        </View>

        <View
          style={[
            td.tdLogDetailsBox,
            styles.metricsBox,
            { backgroundColor: colors.background, borderColor: colors.border },
          ]}
        >
          <View style={td.tdLogInTransitGrid}>
            {odometerMetrics.map((metric) => (
              <View key={metric.label} style={td.tdLogInTransitCol}>
                <Text style={[td.tdLogMetaK, { color: colors.textMuted }]}>{metric.label}</Text>
                <Text style={[td.tdLogMetaV, { color: colors.text }]} numberOfLines={1}>
                  {metric.value}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {odometerComparisonHint ? (
          <Text
            style={[
              styles.odometerCompareHint,
              {
                color: odometerComparisonHint.hasConflict
                  ? Theme.warning
                  : colors.textMuted,
              },
            ]}
            numberOfLines={2}
          >
            {odometerComparisonHint.text}
          </Text>
        ) : (
          <Text style={[td.tdEmptyTimeline, styles.odometerHint, { color: colors.textMuted }]}>
            Tap to enter start and end KM
          </Text>
        )}
      </TouchableOpacity>

      <TimelineSectionHeader
        icon={<Wallet size={13} color="#ffffff" strokeWidth={2.2} />}
        title="Reimbursement summary"
        colors={colors}
        trailing={
          <View style={[styles.syncPill, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
            <View style={[styles.syncDot, { backgroundColor: colors.emerald }]} />
            <Text style={[td.tdLogTime, { color: colors.emerald }]}>{syncLabel}</Text>
          </View>
        }
      />

      <View
        style={[
          td.tdTimelineCard,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <View
          style={[
            td.tdLogDetailsBox,
            styles.metricsBox,
            { backgroundColor: colors.background, borderColor: colors.border },
          ]}
        >
          <View style={styles.metricGrid}>
            {summaryMetrics.map((metric) => (
              <View key={metric.label} style={styles.metricCell}>
                <Text style={[td.tdLogMetaK, { color: colors.textMuted }]}>{metric.label}</Text>
                <Text style={[td.tdLogMetaV, { color: colors.text }]} numberOfLines={1}>
                  {metric.value}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <View style={[styles.statusBanner, { backgroundColor: colors.emeraldDark }]}>
          <Text style={styles.summaryStatus}>{statusMessage}</Text>
          <Text style={styles.summaryHint}>
            Fleet reviews and marks reimbursements after you submit expenses.
          </Text>
        </View>
      </View>

      <TimelineSectionHeader
        icon={<Activity size={13} color="#ffffff" strokeWidth={2.2} />}
        title="Expense log"
        colors={colors}
      />

      <DriverTripExpenseLogSection
        trip={trip}
        events={costEvents}
        loading={summaryQuery.isLoading}
        initialSelectedEventId={initialSelectedExpenseId}
        onAddExpense={() => router.push(ROUTES.tripOtherExpenseEntry(trip.id) as Href)}
        onEditExpense={(event) => {
          const href = tripExpenseEntryEditRoute(trip.id, event.id);
          if (href) router.push(href as Href);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 0,
  },
  syncPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexShrink: 0,
  },
  syncDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  metricsBox: {
    marginBottom: 10,
  },
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: 12,
    columnGap: 16,
  },
  metricCell: {
    width: "46%",
    minWidth: 0,
  },
  statusBanner: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 3,
  },
  summaryStatus: {
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 16,
    color: "#fff",
    letterSpacing: 0.1,
  },
  summaryHint: {
    fontSize: 10,
    fontWeight: "500",
    lineHeight: 14,
    color: "rgba(255,255,255,0.82)",
  },
  odometerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 10,
  },
  odometerAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    flexShrink: 0,
  },
  odometerHint: {
    marginTop: 10,
    paddingVertical: 0,
  },
  odometerCompareHint: {
    marginTop: 8,
    fontSize: 8,
    fontWeight: "600",
    lineHeight: 11,
    letterSpacing: 0.1,
    textAlign: "center",
  },
});
