import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Theme from "@/constants/Theme";
import { LONG_HAUL_STANDARD_PINGS } from "@/features/driver/utils/long_haul_heartbeat.util";

export type PingProgressBarProps = {
  /** Filled segments 0 … {@link LONG_HAUL_STANDARD_PINGS} */
  pingCount: number;
  /** `RUNNING_LATE` from store / health view; otherwise on-track styling. */
  trackingStatus?: string | null;
  /** When true, show stretch-mode hint (3h ping cadence). */
  stretchMode?: boolean;
};

const SEGMENTS = LONG_HAUL_STANDARD_PINGS;

export function PingProgressBar({ pingCount, trackingStatus, stretchMode }: PingProgressBarProps) {
  const late = String(trackingStatus ?? "")
    .toUpperCase()
    .includes("RUNNING_LATE");
  const filled = Math.max(0, Math.min(SEGMENTS, Math.floor(pingCount)));

  return (
    <View style={styles.container} accessibilityRole="summary">
      <View style={styles.labelRow}>
        <Text style={styles.labelText}>Long-haul tracking</Text>
        <Text style={[styles.statusText, late && styles.statusTextLate]}>
          {late ? "RUNNING LATE" : "On track"}
        </Text>
      </View>
      {stretchMode ? (
        <Text style={styles.stretchHint}>Stretch mode · ~3h ping cadence</Text>
      ) : null}
      {late ? (
        <Text style={styles.lateBanner} numberOfLines={2}>
          Running late: ETA may adjust with the next checkpoints.
        </Text>
      ) : null}
      <View style={styles.track}>
        {Array.from({ length: SEGMENTS }, (_, i) => {
          const active = i < filled;
          const lateGhost = late && !active;
          return (
            <View
              key={i}
              style={[
                styles.segment,
                active && styles.segmentActive,
                !active && styles.segmentInactive,
                lateGhost && styles.segmentLate,
              ]}
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  /** Align horizontal inset with `ChatScreen` `detailMissionBar` (paddingHorizontal 14). */
  container: {
    marginHorizontal: 14,
    marginTop: 6,
    marginBottom: 0,
    paddingVertical: 10,
    paddingHorizontal: 0,
    borderRadius: 0,
    backgroundColor: "#fdfefe",
    borderBottomWidth: 1,
    borderBottomColor: "#eef2f7",
    borderTopWidth: 0,
    borderLeftWidth: 0,
    borderRightWidth: 0,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  labelText: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.textSecondary ?? "#64748b",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  statusText: {
    fontSize: 12,
    fontWeight: "900",
    color: Theme.textPrimary ?? "#0f172a",
  },
  statusTextLate: {
    color: Theme.destructive,
  },
  stretchHint: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textSecondary,
    marginBottom: 6,
  },
  lateBanner: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.destructive,
    marginBottom: 8,
  },
  track: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 4,
    height: 8,
  },
  segment: {
    flex: 1,
    borderRadius: 3,
    minWidth: 4,
  },
  segmentInactive: {
    backgroundColor: "#e2e8f0",
  },
  segmentActive: {
    backgroundColor: Theme.buttonPrimary ?? Theme.brandBlue,
  },
  segmentLate: {
    backgroundColor: "#fecaca",
  },
});
