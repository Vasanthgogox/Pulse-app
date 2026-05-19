/**
 * Solid-fill pill with Apple-style glass depth (role + integrated badges).
 */
import Theme from "@/constants/Theme";
import type { NetworkPartyRolePill } from "@/features/network/components/NetworkPartyProfileCard";
import { LinearGradient } from "expo-linear-gradient";
import { Platform, StyleSheet, Text, View, type ViewStyle } from "react-native";

const GLASS_WEB: ViewStyle =
  Platform.OS === "web"
    ? ({
        backdropFilter: "blur(12px) saturate(160%)",
        WebkitBackdropFilter: "blur(12px) saturate(160%)",
      } as ViewStyle)
    : {};

const badgeShadow = Platform.select({
  ios: {
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  android: { elevation: 3 },
  web: {
    boxShadow: "0 2px 10px rgba(15, 23, 42, 0.07), 0 0 0 0.5px rgba(255, 255, 255, 0.65) inset",
  },
  default: {},
});

export type NetworkHubGlassBadgeProps = {
  pill: NetworkPartyRolePill;
  size?: "default" | "compact";
};

export function NetworkHubGlassBadge({ pill, size = "default" }: NetworkHubGlassBadgeProps) {
  const compact = size === "compact";
  const borderColor = pill.borderColor ?? Theme.networkGlassBorder;
  const highlightColor = pill.highlightColor ?? Theme.networkGlassSpecular;
  const gradientTop = pill.gradientTop ?? pill.backgroundColor;
  const isDark = pill.label === "INTEGRATED";
  const specularStrong = isDark ? "rgba(255,255,255,0.22)" : Theme.networkGlassSpecular;
  const specularFade = isDark ? "rgba(255,255,255,0)" : "rgba(255,255,255,0)";

  return (
    <View
      style={[
        styles.shell,
        compact && styles.shellCompact,
        { borderColor },
        badgeShadow,
        GLASS_WEB,
      ]}
    >
      <LinearGradient
        colors={[gradientTop, pill.backgroundColor]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={[specularStrong, specularFade]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.72 }}
        style={styles.specular}
        pointerEvents="none"
      />
      <View
        style={[styles.edgeLine, compact && styles.edgeLineCompact, { backgroundColor: highlightColor }]}
        pointerEvents="none"
      />
      <Text
        style={[styles.label, compact && styles.labelCompact, { color: pill.color }]}
        numberOfLines={1}
      >
        {pill.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 22,
    borderWidth: 1,
    overflow: "hidden",
    position: "relative",
    alignSelf: "flex-start",
    minHeight: 18,
    justifyContent: "center",
  },
  shellCompact: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 18,
    minHeight: 16,
  },
  specular: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.9,
  },
  edgeLine: {
    position: "absolute",
    top: 0,
    left: 8,
    right: 8,
    height: StyleSheet.hairlineWidth,
    opacity: 0.95,
  },
  edgeLineCompact: {
    left: 6,
    right: 6,
  },
  label: {
    fontSize: 7,
    fontWeight: "500",
    letterSpacing: 0.85,
    textTransform: "uppercase",
    lineHeight: 10,
    zIndex: 2,
  },
  labelCompact: {
    fontSize: 6,
    letterSpacing: 0.7,
    lineHeight: 9,
  },
});
