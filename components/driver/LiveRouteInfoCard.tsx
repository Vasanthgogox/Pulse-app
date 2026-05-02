/**
 * Floating “Live route” panel on the driver map — distance, ETA, arrival.
 */
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect } from "react";
import { Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Reanimated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

export type LiveRouteInfoThemeColors = {
  surface: string;
  border: string;
  text: string;
  textMuted: string;
  emerald: string;
  emeraldMuted: string;
};

type Props = {
  colors: LiveRouteInfoThemeColors;
  /** e.g. pickup / destination */
  toLabel: string;
  distanceDisplay: string | null;
  etaDisplay: string;
  arrivalClock: string | null;
  bottomHint?: string;
  onDismiss: () => void;
};

export function LiveRouteInfoCard({
  colors,
  toLabel,
  distanceDisplay,
  etaDisplay,
  arrivalClock,
  bottomHint,
  onDismiss,
}: Props) {
  const pulse = useSharedValue(0.55);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.42, { duration: 900, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
    return () => cancelAnimation(pulse);
  }, [pulse]);

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: pulse.value,
  }));

  const dist = distanceDisplay ?? "—";

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
        },
      ]}
    >
      <LinearGradient
        colors={[colors.emerald, "#14b8a6"]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.accentBar}
      />

      <View style={styles.inner}>
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <View style={[styles.headerIconWrap, { backgroundColor: colors.emeraldMuted }]}>
              <FontAwesome name="crosshairs" size={13} color={colors.emerald} />
            </View>
            <View style={styles.headerTitles}>
              <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
                Live route
              </Text>
            </View>
          </View>
          <TouchableOpacity
            onPress={onDismiss}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={[styles.closeBtn, { backgroundColor: colors.emeraldMuted }]}
            accessibilityLabel="Dismiss tracking details"
            accessibilityRole="button"
          >
            <FontAwesome name="times" size={14} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        <Text style={[styles.kicker, { color: colors.textMuted }]} numberOfLines={1}>
          {`Remaining to ${toLabel}`}
        </Text>

        <View style={styles.metricRow}>
          <View style={[styles.metricTile, { borderColor: colors.border, backgroundColor: colors.emeraldMuted }]}>
            <View style={styles.metricTileTop}>
              <FontAwesome name="road" size={11} color={colors.emerald} />
              <Text style={[styles.metricLabel, { color: colors.textMuted }]}>Distance</Text>
            </View>
            <Text style={[styles.metricValue, { color: colors.text }]} numberOfLines={1}>
              {dist}
            </Text>
          </View>
          <View style={[styles.metricTile, { borderColor: colors.border, backgroundColor: colors.emeraldMuted }]}>
            <View style={styles.metricTileTop}>
              <FontAwesome name="clock-o" size={11} color={colors.emerald} />
              <Text style={[styles.metricLabel, { color: colors.textMuted }]}>ETA</Text>
            </View>
            <Text style={[styles.metricValue, { color: colors.text }]} numberOfLines={1}>
              {etaDisplay}
            </Text>
          </View>
        </View>

        <View style={[styles.progressTrack, { backgroundColor: colors.emeraldMuted }]}>
          <Reanimated.View style={[styles.progressFillClip, pulseStyle]}>
            <LinearGradient
              colors={[colors.emerald, "#34d399"]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={StyleSheet.absoluteFillObject}
            />
          </Reanimated.View>
        </View>

        {arrivalClock ? (
          <View style={styles.arrivalRow}>
            <FontAwesome name="flag-checkered" size={12} color={colors.emerald} />
            <Text style={[styles.arrivalText, { color: colors.emerald }]} numberOfLines={1}>
              {`~ arrive by ${arrivalClock}`}
            </Text>
          </View>
        ) : null}

        {bottomHint ? (
          <Text style={[styles.hint, { color: colors.textMuted }]}>{bottomHint}</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    ...(Platform.OS === "ios"
      ? {
          shadowColor: "#0f172a",
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 0.14,
          shadowRadius: 22,
        }
      : { elevation: 8 }),
  },
  accentBar: {
    height: 3,
    width: "100%",
  },
  inner: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    gap: 10,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  headerIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitles: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  title: {
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: -0.35,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  kicker: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.05,
    textTransform: "uppercase",
    marginTop: -2,
  },
  metricRow: {
    flexDirection: "row",
    gap: 8,
  },
  metricTile: {
    flex: 1,
    minWidth: 0,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 9,
    gap: 6,
  },
  metricTileTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  metricValue: {
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: -0.4,
  },
  progressTrack: {
    height: 5,
    borderRadius: 999,
    overflow: "hidden",
    opacity: 0.95,
  },
  progressFillClip: {
    height: "100%",
    width: "72%",
    borderRadius: 999,
    overflow: "hidden",
  },
  arrivalRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: -2,
  },
  arrivalText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: -0.1,
  },
  hint: {
    fontSize: 11,
    fontWeight: "600",
    lineHeight: 15,
    marginTop: -4,
  },
});
