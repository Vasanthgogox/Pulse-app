import Feather from "@expo/vector-icons/Feather";
import { useFocusEffect } from "expo-router";
import { memo, useCallback, useMemo } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";

import Theme from "@/constants/Theme";
import type { TripRow } from "@/features/trips/services/trips.service";
import { useGPSDistanceEstimate } from "@/features/trips/verification/GPSDistanceHook";
import { VerificationStatusChip } from "@/features/trips/verification/VerificationStatusChip";
import { useTripVerification } from "@/features/trips/verification/queries/useTripVerification";
import {
  computeDistanceDiscrepancy,
  computeOdometerDistance,
  deriveVerificationState,
} from "@/features/trips/verification/verification.service";
import { formatKm } from "@/features/trips/verification/selectors/verificationSelectors";
import { queryKeys } from "@/lib/queryKeys";

type Props = {
  trip: TripRow;
  onRecordStart: () => void;
  onRecordEnd: () => void;
};

function odometerReading(km: number | null): string {
  if (km == null || !Number.isFinite(Number(km))) return "—";
  return Number(km).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

export const TripOdometerPreviewCard = memo(function TripOdometerPreviewCard({
  trip,
  onRecordStart,
  onRecordEnd,
}: Props) {
  const qc = useQueryClient();
  const verificationQuery = useTripVerification(trip.id);
  const gpsEstimate = useGPSDistanceEstimate(trip);

  useFocusEffect(
    useCallback(() => {
      void qc.invalidateQueries({ queryKey: queryKeys.trips.verification(trip.id) });
    }, [qc, trip.id]),
  );

  const metrics = useMemo(() => {
    const snap = verificationQuery.data;
    const startKm = snap?.startOdometerKm ?? trip.start_odometer_km ?? null;
    const endKm = snap?.endOdometerKm ?? trip.end_odometer_km ?? null;
    const odometerDistanceKm =
      snap?.odometerDistanceKm ??
      trip.odometer_distance_km ??
      computeOdometerDistance(startKm, endKm);
    const gpsDistanceKm = snap?.gpsDistanceKm ?? trip.gps_distance_km ?? gpsEstimate;
    const distanceDiscrepancyKm =
      snap?.distanceDiscrepancyKm ??
      trip.distance_discrepancy_km ??
      computeDistanceDiscrepancy(odometerDistanceKm, gpsDistanceKm);
    const state = deriveVerificationState({
      start_odometer_km: startKm,
      end_odometer_km: endKm,
      gps_distance_km: gpsDistanceKm,
      distance_discrepancy_km: distanceDiscrepancyKm,
      odometer_verification_state: trip.odometer_verification_state,
    });

    return {
      startKm,
      endKm,
      odometerDistanceKm,
      gpsDistanceKm,
      distanceDiscrepancyKm,
      state,
    };
  }, [gpsEstimate, trip, verificationQuery.data]);

  const hasWarn =
    metrics.distanceDiscrepancyKm != null && metrics.distanceDiscrepancyKm >= 10;
  const hasAnyReading = metrics.startKm != null || metrics.endKm != null;
  const hasComparison =
    metrics.odometerDistanceKm != null ||
    metrics.gpsDistanceKm != null ||
    hasAnyReading;
  const loading = verificationQuery.isLoading && !verificationQuery.data;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.iconWrap}>
            <Feather name="navigation" size={14} color="#4f46e5" />
          </View>
          <View style={styles.headerText}>
            <Text style={styles.title}>Odometer verification</Text>
            <Text style={styles.subtitle}>Start / end readings · GPS comparison</Text>
          </View>
        </View>
        <VerificationStatusChip state={metrics.state} />
      </View>

      <View style={styles.readingsRow}>
        <Pressable
          style={styles.readingCell}
          onPress={onRecordStart}
          accessibilityRole="button"
          accessibilityLabel="Record or edit start odometer"
        >
          <Text style={styles.readingLabel}>Start</Text>
          <Text style={styles.readingValue}>{odometerReading(metrics.startKm)}</Text>
          <Text style={styles.readingUnit}>KM</Text>
        </Pressable>
        <View style={styles.readingSep} />
        <Pressable
          style={styles.readingCell}
          onPress={onRecordEnd}
          accessibilityRole="button"
          accessibilityLabel="Record or edit closing odometer"
        >
          <Text style={styles.readingLabel}>End</Text>
          <Text style={styles.readingValue}>{odometerReading(metrics.endKm)}</Text>
          <Text style={styles.readingUnit}>KM</Text>
        </Pressable>
      </View>

      <View style={[styles.compareCard, hasWarn && styles.compareCardWarn]}>
        {loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={Theme.primary} />
            <Text style={styles.compareHint}>Loading verification…</Text>
          </View>
        ) : (
          <>
            <View style={styles.compareRow}>
              <View style={styles.compareMetric}>
                <Text style={styles.compareLabel}>Odometer distance</Text>
                <Text style={styles.compareValue}>{formatKm(metrics.odometerDistanceKm)}</Text>
              </View>
              <View style={styles.compareDivider} />
              <View style={styles.compareMetric}>
                <Text style={styles.compareLabel}>GPS distance</Text>
                <Text style={styles.compareValue}>{formatKm(metrics.gpsDistanceKm)}</Text>
              </View>
            </View>
            {hasComparison ? (
              <View style={styles.discrepancyRow}>
                <Text style={styles.discrepancyLabel}>Discrepancy</Text>
                <Text style={[styles.discrepancyValue, hasWarn && styles.discrepancyWarn]}>
                  {formatKm(metrics.distanceDiscrepancyKm)}
                </Text>
              </View>
            ) : (
              <Text style={styles.compareHint}>
                Record start and end readings to compare with GPS track distance.
              </Text>
            )}
            {metrics.gpsDistanceKm != null &&
            metrics.odometerDistanceKm == null &&
            !hasAnyReading ? (
              <Text style={styles.compareHint}>
                Route GPS estimate available — add odometer readings to verify actual distance.
              </Text>
            ) : null}
          </>
        )}
      </View>

      <View style={styles.actions}>
        <Pressable style={styles.actionBtn} onPress={onRecordStart} accessibilityRole="button">
          <Text style={styles.actionBtnText}>Start</Text>
        </Pressable>
        <Pressable
          style={[styles.actionBtn, styles.actionBtnPrimary]}
          onPress={onRecordEnd}
          accessibilityRole="button"
        >
          <Text style={[styles.actionBtnText, styles.actionBtnTextPrimary]}>End</Text>
        </Pressable>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    marginBottom: 10,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#eef2f7",
    backgroundColor: "#fff",
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  headerLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    minWidth: 0,
  },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#eef2ff",
  },
  headerText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  title: {
    fontSize: 11,
    fontWeight: "800",
    color: "#0f172a",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  subtitle: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  readingsRow: {
    flexDirection: "row",
    alignItems: "stretch",
    borderWidth: 1,
    borderColor: "#eef2f7",
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#f8fafc",
  },
  readingCell: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: "center",
    gap: 2,
  },
  readingSep: {
    width: 1,
    backgroundColor: "#e2e8f0",
  },
  readingLabel: {
    fontSize: 8,
    fontWeight: "800",
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  readingValue: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0f172a",
    letterSpacing: -0.3,
    fontVariant: ["tabular-nums"],
  },
  readingUnit: {
    fontSize: 9,
    fontWeight: "700",
    color: "#94a3b8",
  },
  compareCard: {
    borderWidth: 1,
    borderColor: "#eef2f7",
    borderRadius: 12,
    backgroundColor: "#fafbfc",
    padding: 10,
    gap: 8,
  },
  compareCardWarn: {
    borderColor: "#fde68a",
    backgroundColor: "#fffbeb",
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 4,
  },
  compareRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  compareMetric: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  compareDivider: {
    width: 1,
    height: 32,
    backgroundColor: "#e2e8f0",
    marginHorizontal: 8,
  },
  compareLabel: {
    fontSize: 8,
    fontWeight: "800",
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  compareValue: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0f172a",
    fontVariant: ["tabular-nums"],
  },
  discrepancyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: "#eef2f7",
  },
  discrepancyLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
  },
  discrepancyValue: {
    fontSize: 11,
    fontWeight: "700",
    color: "#334155",
    fontVariant: ["tabular-nums"],
  },
  discrepancyWarn: {
    color: "#b45309",
  },
  compareHint: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textMuted,
    lineHeight: 14,
  },
  actions: {
    flexDirection: "row",
    gap: 8,
  },
  actionBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: "center",
    backgroundColor: "#f8fafc",
  },
  actionBtnPrimary: {
    backgroundColor: "#0f172a",
    borderColor: "#0f172a",
  },
  actionBtnText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#0f172a",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  actionBtnTextPrimary: {
    color: "#fff",
  },
});
