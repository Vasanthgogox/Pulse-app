/**
 * Single alert signal row — Mission Radar registry card (reference design).
 */
import Theme from "@/constants/Theme";
import { AlertTriangle, Clock } from "lucide-react-native";
import { useEffect } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

export type AlertSignalStatus = "WARNING" | "ACTION" | "INFO";

const STATUS_ICON = {
  WARNING: { icon: "#f59e0b", ring: "rgba(245,158,11,0.55)" },
  ACTION: { icon: "#f43f5e", ring: "rgba(244,63,94,0.55)" },
  INFO: { icon: Theme.primary, ring: "rgba(26,35,126,0.4)" },
} as const;

/** Borderless icon with soft opacity pulse + expanding radar rings (no solid fill). */
function SignalIconAnimated({ status }: { status: AlertSignalStatus }) {
  const colors = STATUS_ICON[status];
  const iconPulse = useSharedValue(0);
  const ring = useSharedValue(0);
  const urgent = status === "ACTION";
  const showRings = status !== "INFO";

  useEffect(() => {
    iconPulse.value = withRepeat(
      withSequence(
        withTiming(0.68, {
          duration: urgent ? 900 : 1200,
          easing: Easing.inOut(Easing.ease),
        }),
        withTiming(1, {
          duration: urgent ? 900 : 1200,
          easing: Easing.inOut(Easing.ease),
        }),
      ),
      -1,
      true,
    );
  }, [iconPulse, urgent]);

  useEffect(() => {
    if (!showRings) return;
    const duration = urgent ? 1500 : 2200;
    ring.value = withRepeat(
      withTiming(1, { duration, easing: Easing.out(Easing.quad) }),
      -1,
      false,
    );
  }, [ring, showRings, urgent]);

  const iconAnim = useAnimatedStyle(() => ({
    opacity: iconPulse.value,
    transform: [
      {
        scale: interpolate(iconPulse.value, [0.68, 1], [0.94, 1]),
      },
    ],
  }));

  const ringAnim = useAnimatedStyle(() => ({
    opacity: interpolate(ring.value, [0, 0.15, 1], [0.5, 0.35, 0]),
    transform: [{ scale: interpolate(ring.value, [0, 1], [0.75, 1.55]) }],
  }));

  const ringAnimDelayed = useAnimatedStyle(() => ({
    opacity: interpolate(ring.value, [0, 0.5, 1], [0, 0.28, 0]),
    transform: [{ scale: interpolate(ring.value, [0, 1], [0.6, 1.35]) }],
  }));

  return (
    <View style={styles.iconSlot} accessibilityElementsHidden>
      {showRings ? (
        <>
          <Animated.View
            style={[
              styles.pulseRing,
              { borderColor: colors.ring },
              ringAnim,
            ]}
            pointerEvents="none"
          />
          <Animated.View
            style={[
              styles.pulseRing,
              { borderColor: colors.ring },
              ringAnimDelayed,
            ]}
            pointerEvents="none"
          />
        </>
      ) : null}
      <Animated.View style={iconAnim}>
        <AlertTriangle size={18} color={colors.icon} />
      </Animated.View>
    </View>
  );
}

export type AlertRegistrySignalCardProps = {
  typeLabel: string;
  title: string;
  detail: string;
  tripId?: string | null;
  timeLabel?: string;
  status?: AlertSignalStatus;
  onPress?: () => void;
  footer?: React.ReactNode;
};

export function AlertRegistrySignalCard({
  typeLabel,
  title,
  detail,
  tripId,
  timeLabel,
  status = "WARNING",
  onPress,
  footer,
}: AlertRegistrySignalCardProps) {
  const isWarning = status === "WARNING";
  const isAction = status === "ACTION";

  const content = (
    <View style={styles.card}>
      <SignalIconAnimated status={status} />

      <View style={styles.body}>
        <View style={styles.topRow}>
          <View style={styles.titleCol}>
            <Text
              style={[
                styles.typeLabel,
                isWarning && styles.typeWarning,
                isAction && styles.typeAction,
              ]}
              numberOfLines={1}
            >
              {typeLabel}
            </Text>
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
          </View>
          {tripId || timeLabel ? (
            <View style={styles.metaCol}>
              {tripId ? (
                <View style={styles.tripBadge}>
                  <Text style={styles.tripBadgeText} numberOfLines={1}>
                    {tripId}
                  </Text>
                </View>
              ) : null}
              {timeLabel ? (
                <View style={styles.timeRow}>
                  <Clock size={8} color={Theme.textMuted} />
                  <Text style={styles.timeText}>{timeLabel}</Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
        <Text style={styles.detail} numberOfLines={3}>
          {detail}
        </Text>
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </View>
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [pressed && styles.cardPressed]}
        accessibilityRole="button"
      >
        {content}
      </Pressable>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    overflow: "hidden",
    ...Platform.select({
      web: {
        boxShadow: "0 4px 14px rgba(15,23,42,0.04)",
      },
      default: {
        shadowColor: "#0f172a",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 8,
        elevation: 1,
      },
    }),
  },
  cardPressed: {
    opacity: 0.92,
  },
  iconSlot: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginTop: 0,
  },
  pulseRing: {
    position: "absolute",
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1.5,
    backgroundColor: "transparent",
  },
  body: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
    gap: 4,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  titleCol: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  typeLabel: {
    fontSize: 7,
    fontWeight: "500",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  typeWarning: {
    color: "#d97706",
  },
  typeAction: {
    color: "#e11d48",
  },
  title: {
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.15,
    lineHeight: 15,
  },
  metaCol: {
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 3,
    flexShrink: 0,
    alignSelf: "center",
  },
  tripBadge: {
    backgroundColor: "#171A20",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    maxWidth: 80,
  },
  tripBadgeText: {
    fontSize: 7,
    fontWeight: "600",
    color: Theme.textOnDark,
    textTransform: "uppercase",
    letterSpacing: 0.25,
  },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  timeText: {
    fontSize: 7,
    fontWeight: "400",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  detail: {
    fontSize: 10,
    fontWeight: "400",
    fontStyle: "italic",
    color: Theme.textRouteCard,
    lineHeight: 14,
    borderLeftWidth: 1.5,
    borderLeftColor: Theme.borderLight,
    paddingLeft: 8,
    marginTop: 1,
  },
  footer: {
    marginTop: 2,
    alignSelf: "stretch",
  },
});
