import Theme from "@/constants/Theme";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

export type DriverTrackingOfflineOverlayProps = {
  /** `map` — centered card over the tracking map; `fullscreen` — modal body. */
  variant?: "map" | "fullscreen";
  showReassign?: boolean;
  onSendLoginReminder?: () => void;
  onReassignDriver?: () => void;
  style?: StyleProp<ViewStyle>;
};

/**
 * Dispatcher alert when the assigned driver is not reachable on the tracking grid.
 */
export function DriverTrackingOfflineOverlay({
  variant = "map",
  showReassign = true,
  onSendLoginReminder,
  onReassignDriver,
  style,
}: DriverTrackingOfflineOverlayProps) {
  const isMap = variant === "map";

  return (
    <View
      style={[
        isMap ? styles.mapRoot : styles.fullscreenRoot,
        style,
      ]}
      pointerEvents="box-none"
    >
      <View style={[styles.card, isMap && styles.cardMap]}>
        <View style={styles.iconWrap}>
          <FontAwesome name="user-times" size={isMap ? 36 : 48} color={Theme.negative} />
        </View>
        <Text style={[styles.title, isMap && styles.titleMap]}>Driver is Offline</Text>
        <Text style={[styles.message, isMap && styles.messageMap]}>
          Assigned driver node is currently disconnected. Please ask the driver to{" "}
          <Text style={styles.messageBold}>login</Text> and{" "}
          <Text style={styles.messageBold}>accept the trip</Text> to activate journey
          tracking.
        </Text>
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.btnPrimary}
            onPress={onSendLoginReminder}
            activeOpacity={0.8}
            disabled={!onSendLoginReminder}
          >
            <FontAwesome name="bell" size={14} color={Theme.primary} />
            <Text style={styles.btnPrimaryText}>Send Login Reminder</Text>
          </TouchableOpacity>
          {showReassign ? (
            <TouchableOpacity
              style={styles.btnSecondary}
              onPress={onReassignDriver}
              activeOpacity={0.8}
              disabled={!onReassignDriver}
            >
              <Text style={styles.btnSecondaryText}>Re-assign Driver</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        {!isMap ? (
          <View style={styles.protocol}>
            <FontAwesome name="lock" size={12} color={Theme.textMuted} />
            <Text style={styles.protocolText}>Encrypted Grid Protocol v4.2</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  mapRoot: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
    backgroundColor: "rgba(248, 250, 252, 0.72)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  fullscreenRoot: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#F9FAFB",
  },
  card: {
    alignItems: "center",
    maxWidth: 400,
    width: "100%",
  },
  cardMap: {
    backgroundColor: Theme.screenBackground,
    borderRadius: 20,
    paddingHorizontal: 22,
    paddingVertical: 24,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 6,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "rgba(232,33,39,0.08)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    marginBottom: 8,
    textAlign: "center",
  },
  titleMap: {
    fontSize: 16,
  },
  message: {
    fontSize: 14,
    color: Theme.textSecondary,
    textAlign: "center",
    lineHeight: 21,
    marginBottom: 20,
  },
  messageMap: {
    fontSize: 13,
    marginBottom: 16,
  },
  messageBold: {
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  actions: {
    width: "100%",
    gap: 10,
  },
  btnPrimary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Theme.primary,
    backgroundColor: "rgba(79,70,229,0.04)",
  },
  btnPrimaryText: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.primary,
  },
  btnSecondary: {
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
  },
  btnSecondaryText: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  protocol: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 24,
  },
  protocolText: {
    fontSize: 10,
    color: Theme.textMuted,
  },
});
