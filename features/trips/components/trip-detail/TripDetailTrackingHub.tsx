import Theme from "@/constants/Theme";
import type { ManifestDeliveryPlan } from "@/features/trips/utils/manifestDeliveryPlan.util";
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

const ETA_BADGE = 32;

type Props = {
  onOpenLiveTracking: () => void;
  deliveryPlan: ManifestDeliveryPlan;
  driverLastPing: DriverLastPingDisplay;
  recordedAt?: string | null;
  broadcastActive?: boolean;
};

function EtaBadge({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit: string;
}) {
  return (
    <View style={styles.etaCol}>
      <Text style={styles.etaSlotLabel} numberOfLines={1}>
        {label}
      </Text>
      <View style={styles.etaBadge}>
        <Text style={styles.etaBadgeValue} numberOfLines={1}>
          {value}
        </Text>
        <Text style={styles.etaBadgeUnit} numberOfLines={1}>
          {unit}
        </Text>
      </View>
    </View>
  );
}

/** In-transit trip tab: live map CTA, ETA badges, and last driver ping. */
export function TripDetailTrackingHub({
  onOpenLiveTracking,
  deliveryPlan,
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
            Route · position · pings
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

      <View style={styles.etaBand}>
        <View style={styles.etaRow}>
          <EtaBadge
            label="Driver ETA"
            value={deliveryPlan.etaBadgeValue}
            unit={deliveryPlan.etaBadgeUnit}
          />
          <EtaBadge
            label="Est. delivery"
            value={deliveryPlan.deliveryDateBadgeValue}
            unit={deliveryPlan.deliveryDateBadgeUnit}
          />
          <View style={styles.etaPlanCol}>
            <Text style={styles.etaPlanSummary} numberOfLines={2}>
              {deliveryPlan.planSummaryLine}
            </Text>
            <Text style={styles.etaPlanDetail} numberOfLines={2}>
              {deliveryPlan.planDetailLine}
            </Text>
          </View>
        </View>
      </View>

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
              <Text style={styles.pingTime} numberOfLines={1}>
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
    backgroundColor: Theme.pulseIndigo,
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
    gap: 8,
  },
  etaCol: {
    width: ETA_BADGE,
    alignItems: "center",
    gap: 3,
    flexShrink: 0,
  },
  etaSlotLabel: {
    width: ETA_BADGE,
    fontSize: 6.5,
    fontWeight: "700",
    letterSpacing: 0.3,
    textTransform: "uppercase",
    color: Theme.textMuted,
    textAlign: "center",
    lineHeight: 8,
  },
  etaBadge: {
    width: ETA_BADGE,
    height: ETA_BADGE,
    borderRadius: 8,
    backgroundColor: Theme.pulseIndigo,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 2,
  },
  etaBadgeValue: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textOnPrimary,
    lineHeight: 12,
  },
  etaBadgeUnit: {
    fontSize: 6.5,
    fontWeight: "600",
    color: "rgba(255,255,255,0.92)",
    lineHeight: 8,
    marginTop: 0,
  },
  etaPlanCol: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
    gap: 2,
    minHeight: ETA_BADGE + 11,
  },
  etaPlanSummary: {
    fontSize: 9,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    lineHeight: 12,
  },
  etaPlanDetail: {
    fontSize: 8,
    fontWeight: "500",
    color: Theme.textSecondary,
    lineHeight: 11,
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
