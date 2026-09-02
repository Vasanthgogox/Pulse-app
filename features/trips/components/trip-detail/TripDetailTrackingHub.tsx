import Theme from "@/constants/Theme";
import type { LiveTrackingPresentation } from "@/features/trips/utils/liveTrackingPresentation.util";
import {
  formatHubPingOfflineLabel,
  type DriverLastPingDisplay,
} from "@/features/trips/utils/driverLastPingDisplay.util";
import { Feather } from "@expo/vector-icons";
import {
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

type Props = {
  onOpenLiveTracking: () => void;
  /** Null only during the brief initial load -- the row below is skipped until it's ready. */
  presentation: LiveTrackingPresentation | null;
  driverLastPing: DriverLastPingDisplay;
  recordedAt?: string | null;
  broadcastActive?: boolean;
};

/** In-transit trip tab: live map CTA, expected arrival, and last driver ping. */
export function TripDetailTrackingHub({
  onOpenLiveTracking,
  presentation,
  driverLastPing,
  recordedAt,
  broadcastActive = false,
}: Props) {
  const locationText =
    driverLastPing.locationLabel?.trim() ||
    driverLastPing.cityLabel?.trim() ||
    "—";
  const offlineLabel = formatHubPingOfflineLabel(recordedAt);
  const showPing = driverLastPing.hasPing;

  return (
    <View style={styles.shell}>
      <TouchableOpacity
        style={styles.liveRow}
        onPress={onOpenLiveTracking}
        activeOpacity={0.86}
        accessibilityRole="button"
        accessibilityLabel="Open live tracking map"
      >
        <View style={styles.liveAccent} />
        <View style={styles.liveIconWrap}>
          <Feather name="navigation" size={10} color={Theme.pulseIndigo} />
        </View>
        <View style={styles.liveCopy}>
          <Text style={styles.liveTitle}>Live Tracking</Text>
          <Text style={styles.liveSubtitle} numberOfLines={1}>
            {broadcastActive
              ? "Live route · position · pings"
              : "Map · last ping · movement"}
          </Text>
        </View>
        {broadcastActive ? (
          <View style={styles.livePill}>
            <View style={styles.liveDot} />
            <Text style={styles.livePillText}>LIVE</Text>
          </View>
        ) : null}
        <Feather name="chevron-right" size={12} color={Theme.textMuted} />
      </TouchableOpacity>

      {presentation && presentation.showEta ? (
        <View style={styles.etaBand}>
          <View style={styles.etaRow}>
            <Text style={styles.etaHeadline} numberOfLines={1}>
              {presentation.statusTitle}
            </Text>
            {presentation.distanceRemainingLabel ? (
              <Text style={styles.etaDistance} numberOfLines={1}>
                {presentation.distanceRemainingLabel}
              </Text>
            ) : null}
          </View>
          <View style={styles.etaArrivalRow}>
            <Text style={styles.etaArrivalLabel}>Expected arrival</Text>
            <Text
              style={[
                styles.etaArrivalValue,
                presentation.eta.isUnavailable && styles.etaArrivalValueMuted,
              ]}
              numberOfLines={1}
            >
              {presentation.eta.label}
            </Text>
          </View>
        </View>
      ) : null}

      {showPing ? (
        <View style={styles.pingBlock}>
          <View style={styles.pingHeader}>
            <View style={styles.pingChip}>
              <Feather name="map-pin" size={8} color={Theme.pulseIndigo} />
              <Text style={styles.pingChipText}>Last ping</Text>
            </View>
            {offlineLabel ? (
              <Text style={styles.offlineTag} numberOfLines={1}>
                {offlineLabel}
              </Text>
            ) : broadcastActive ? (
              <Text style={styles.onlineTag} numberOfLines={1}>
                On route
              </Text>
            ) : null}
          </View>
          <Text style={styles.pingLocation} numberOfLines={2}>
            {locationText}
          </Text>
          {driverLastPing.recordedAtLabel ? (
            <View style={styles.pingTimeRow}>
              <Feather name="clock" size={8} color={Theme.textMuted} />
              <Text style={styles.pingTime}>
                {driverLastPing.recordedAtLabel}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    overflow: "hidden",
    marginBottom: 6,
    ...Platform.select({
      ios: {
        shadowColor: "#0f172a",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
      },
      android: { elevation: 1 },
      default: { boxShadow: "0 1px 6px rgba(15,23,42,0.06)" } as object,
    }),
  },
  liveRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 34,
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 6,
    backgroundColor: "#EEF2FF",
  },
  liveAccent: {
    position: "absolute",
    left: 0,
    top: 6,
    bottom: 6,
    width: 2,
    borderTopRightRadius: 2,
    borderBottomRightRadius: 2,
    backgroundColor: Theme.buttonPrimary,
  },
  liveIconWrap: {
    width: 22,
    height: 22,
    borderRadius: 7,
    backgroundColor: Theme.cardWhite,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.pulseIndigoRing,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 4,
  },
  liveCopy: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  liveTitle: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.1,
    lineHeight: 14,
  },
  liveSubtitle: {
    fontSize: 8,
    fontWeight: "500",
    color: Theme.textMuted,
    lineHeight: 10,
    marginTop: 1,
  },
  livePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: "rgba(16, 185, 129, 0.12)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(16, 185, 129, 0.28)",
    flexShrink: 0,
  },
  liveDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Theme.positive,
  },
  livePillText: {
    fontSize: 7,
    fontWeight: "800",
    letterSpacing: 0.4,
    color: Theme.positive,
  },
  etaBand: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
    backgroundColor: Theme.surface,
  },
  etaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  etaHeadline: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.4,
    color: Theme.pulseIndigo,
  },
  etaDistance: {
    fontSize: 9,
    fontWeight: "600",
    color: Theme.textSecondary,
  },
  etaArrivalRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 4,
  },
  etaArrivalLabel: {
    fontSize: 9,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  etaArrivalValue: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  etaArrivalValueMuted: {
    color: Theme.textMuted,
    fontWeight: "600",
  },
  pingBlock: {
    paddingHorizontal: 8,
    paddingTop: 5,
    paddingBottom: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
    gap: 3,
  },
  pingHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 16,
  },
  pingChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 5,
    backgroundColor: Theme.pulseIndigoWash,
    flexShrink: 0,
  },
  pingChipText: {
    fontSize: 7,
    fontWeight: "700",
    letterSpacing: 0.35,
    textTransform: "uppercase",
    color: Theme.pulseIndigo,
    lineHeight: 9,
  },
  offlineTag: {
    flex: 1,
    fontSize: 8,
    fontWeight: "600",
    color: "#64748b",
    lineHeight: 10,
    textAlign: "right",
  },
  onlineTag: {
    flex: 1,
    fontSize: 8,
    fontWeight: "600",
    color: Theme.positive,
    lineHeight: 10,
    textAlign: "right",
  },
  pingLocation: {
    fontSize: 9,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    lineHeight: 12,
  },
  pingTimeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  pingTime: {
    flex: 1,
    fontSize: 8,
    fontWeight: "500",
    color: Theme.textSecondary,
    lineHeight: 10,
  },
});
