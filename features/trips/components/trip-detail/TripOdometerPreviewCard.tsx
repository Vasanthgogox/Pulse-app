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
      <View style={[styles.header, compact && styles.headerCompact]}>
        <View style={styles.headerLeft}>
          <View style={[styles.iconWrap, compact && styles.iconWrapCompact]}>
            <Feather
              name="navigation"
              size={compact ? 10 : 12}
              color={Theme.primary}
            />
          </View>
          <Text style={[styles.title, compact && styles.titleCompact]}>
            Odometer
          </Text>
        </View>
        <VerificationStatusChip state={metrics.state} compact={compact} />
      </View>

      <View style={compact ? styles.compactBody : undefined}>
      <View style={[styles.readingsRow, compact && styles.readingsRowCompact]}>
        <Pressable
          style={({ pressed }) => [
            styles.readingCell,
            compact && styles.readingCellCompact,
            pressed && styles.readingCellPressed,
          ]}
          onPress={onRecordStart}
          accessibilityRole="button"
          accessibilityLabel="Record start odometer"
        >
          <Text style={[styles.readingLabel, compact && styles.readingLabelCompact]}>
            Start
          </Text>
          <Text style={[styles.readingValue, compact && styles.readingValueCompact]}>
            {odometerReading(metrics.startKm)}
          </Text>
          {compact && metrics.startKm == null ? (
            <Text style={styles.tapHint}>Tap to set</Text>
          ) : null}
        </Pressable>
        <View style={styles.readingSep} />
        {compact ? (
          <View style={styles.readingMid}>
            <Feather name="chevrons-right" size={10} color={Theme.textMuted} />
          </View>
        ) : null}
        {compact ? <View style={styles.readingSep} /> : null}
        <Pressable
          style={({ pressed }) => [
            styles.readingCell,
            compact && styles.readingCellCompact,
            pressed && styles.readingCellPressed,
          ]}
          onPress={onRecordEnd}
          accessibilityRole="button"
          accessibilityLabel="Record end odometer"
        >
          <Text style={[styles.readingLabel, compact && styles.readingLabelCompact]}>
            End
          </Text>
          <Text style={[styles.readingValue, compact && styles.readingValueCompact]}>
            {odometerReading(metrics.endKm)}
          </Text>
          {compact && metrics.endKm == null ? (
            <Text style={styles.tapHint}>Tap to set</Text>
          ) : null}
        </Pressable>
      </View>

      <View style={styles.footer}>
        {loading ? (
          <ActivityIndicator size="small" color={Theme.primary} />
        ) : (
          <View style={[styles.footerIcon, hasWarn && styles.footerIconWarn]}>
            <Feather
              name={hasWarn ? "alert-circle" : "activity"}
              size={10}
              color={hasWarn ? Theme.warning : Theme.primary}
            />
          </View>
        )}
        <Text
          style={[styles.meta, compact && styles.metaCompact, hasWarn && styles.metaWarn]}
          numberOfLines={1}
        >
          {loading
            ? "Syncing readings…"
            : hasWarn
              ? `${distanceLine} · Δ ${formatKm(metrics.distanceDiscrepancyKm)}`
              : distanceLine}
        </Text>
      </View>
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
    marginBottom: 8,
    borderColor: "#e6edf5",
    borderRadius: 14,
    padding: 0,
    gap: 0,
    overflow: "hidden",
  },
  headerCompact: {
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 6,
    backgroundColor: Theme.pulseIndigoWash,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e6edf5",
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
  titleCompact: {
    fontSize: 9,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    color: "#64748b",
  },
  iconWrapCompact: {
    width: 22,
    height: 22,
    borderRadius: 6,
  },
  readingsRow: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: Theme.surface,
  },
  readingsRowCompact: {
    marginHorizontal: 8,
    marginTop: 8,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: "#e6edf5",
    borderRadius: 10,
  },
  compactBody: {
    paddingHorizontal: 0,
    paddingBottom: 8,
    gap: 6,
  },
  readingMid: {
    width: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surface,
  },
  readingCellPressed: {
    backgroundColor: Theme.pulseIndigoWash,
  },
  tapHint: {
    fontSize: 7,
    fontWeight: "600",
    color: Theme.primary,
    marginTop: 1,
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
  readingCellCompact: {
    minHeight: 32,
    paddingVertical: 5,
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
  readingLabelCompact: {
    fontSize: 7,
    fontWeight: "800",
    letterSpacing: 0.6,
    lineHeight: 9,
  },
  readingValue: {
    fontSize: 15,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    fontVariant: ["tabular-nums"],
  },
  readingValueCompact: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: -0.15,
    lineHeight: 13,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingTop: 2,
    paddingHorizontal: 10,
    paddingBottom: 2,
  },
  footerIcon: {
    width: 18,
    height: 18,
    borderRadius: 6,
    backgroundColor: "#eef2ff",
    alignItems: "center",
    justifyContent: "center",
  },
  footerIconWarn: {
    backgroundColor: "#fffbeb",
  },
  meta: {
    flex: 1,
    fontSize: 11,
    fontWeight: "400",
    color: Theme.textSecondary,
    lineHeight: 15,
  },
  metaCompact: {
    fontSize: 8,
    fontWeight: "500",
    lineHeight: 11,
  },
  metaWarn: {
    color: Theme.warning,
    fontWeight: "500",
  },
});
