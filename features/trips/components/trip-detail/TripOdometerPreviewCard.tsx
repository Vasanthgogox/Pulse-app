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
  /** Tighter card when nested under trip detail tabs. */
  compact?: boolean;
};

function odometerReading(km: number | null): string {
  if (km == null || !Number.isFinite(Number(km))) return "—";
  return Number(km).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

export const TripOdometerPreviewCard = memo(function TripOdometerPreviewCard({
  trip,
  onRecordStart,
  onRecordEnd,
  compact = false,
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
  const loading = verificationQuery.isLoading && !verificationQuery.data;
  const distanceLine =
    metrics.odometerDistanceKm != null
      ? `${formatKm(metrics.odometerDistanceKm)} trip`
      : metrics.gpsDistanceKm != null
        ? `${formatKm(metrics.gpsDistanceKm)} GPS`
        : "Record start & end";

  return (
    <View style={[styles.card, compact && styles.cardCompact]}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.iconWrap}>
            <Feather name="navigation" size={12} color={Theme.primary} />
          </View>
          <Text style={styles.title}>Odometer</Text>
        </View>
        <VerificationStatusChip state={metrics.state} />
      </View>

      <View style={styles.readingsRow}>
        <Pressable
          style={styles.readingCell}
          onPress={onRecordStart}
          accessibilityRole="button"
          accessibilityLabel="Record start odometer"
        >
          <Text style={styles.readingLabel}>Start</Text>
          <Text style={styles.readingValue}>{odometerReading(metrics.startKm)}</Text>
        </Pressable>
        <View style={styles.readingSep} />
        <Pressable
          style={styles.readingCell}
          onPress={onRecordEnd}
          accessibilityRole="button"
          accessibilityLabel="Record end odometer"
        >
          <Text style={styles.readingLabel}>End</Text>
          <Text style={styles.readingValue}>{odometerReading(metrics.endKm)}</Text>
        </Pressable>
      </View>

      <View style={styles.footer}>
        {loading ? (
          <ActivityIndicator size="small" color={Theme.primary} />
        ) : (
          <Feather
            name={hasWarn ? "alert-circle" : "activity"}
            size={12}
            color={hasWarn ? Theme.warning : Theme.textMuted}
          />
        )}
        <Text style={[styles.meta, hasWarn && styles.metaWarn]} numberOfLines={1}>
          {loading
            ? "Syncing readings…"
            : hasWarn
              ? `${distanceLine} · Δ ${formatKm(metrics.distanceDiscrepancyKm)}`
              : distanceLine}
        </Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    padding: 10,
    gap: 8,
  },
  cardCompact: {
    marginBottom: 0,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  iconWrap: {
    width: 24,
    height: 24,
    borderRadius: 7,
    backgroundColor: "#eef2ff",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  readingsRow: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: Theme.surface,
  },
  readingCell: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 6,
    alignItems: "center",
    gap: 2,
    minHeight: 40,
    justifyContent: "center",
  },
  readingSep: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: Theme.borderMedium,
  },
  readingLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  readingValue: {
    fontSize: 15,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    fontVariant: ["tabular-nums"],
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingTop: 2,
  },
  meta: {
    flex: 1,
    fontSize: 11,
    fontWeight: "400",
    color: Theme.textSecondary,
    lineHeight: 15,
  },
  metaWarn: {
    color: Theme.warning,
    fontWeight: "500",
  },
});
