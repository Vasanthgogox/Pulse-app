/**
 * Frosted glass surfaces for the network profile modal (Apple mirror / glass aesthetic).
 */
import Theme from "@/constants/Theme";
import { LinearGradient } from "expo-linear-gradient";
import type { ReactNode } from "react";
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

/** Avoid backdrop-filter inside RN Modal on web — it blurs/dims the whole screen. */
export const PROFILE_GLASS_WEB: ViewStyle = {};

const glassShadow = Platform.select({
  ios: {
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.07,
    shadowRadius: 16,
  },
  android: { elevation: 2 },
  web: {
    boxShadow:
      "0 8px 28px rgba(15, 23, 42, 0.07), 0 0 0 0.5px rgba(255, 255, 255, 0.85) inset",
  },
  default: {},
});

export type NetworkProfileGlassPanelProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Tighter radius + padding for metric chips. */
  compact?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
};

export function NetworkProfileGlassPanel({
  children,
  style,
  compact = false,
  contentStyle,
}: NetworkProfileGlassPanelProps) {
  return (
    <View
      style={[
        styles.shell,
        compact && styles.shellCompact,
        PROFILE_GLASS_WEB,
        glassShadow,
        style,
      ]}
    >
      <LinearGradient
        colors={[Theme.networkGlassSurface, Theme.networkGlassInset]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={[Theme.networkGlassSpecular, "rgba(255,255,255,0)"]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.55 }}
        style={styles.specular}
        pointerEvents="none"
      />
      <View style={styles.edgeHighlight} pointerEvents="none" />
      <View style={[styles.content, compact && styles.contentCompact, contentStyle]}>
        {children}
      </View>
    </View>
  );
}

export type NetworkProfileModalChromeProps = {
  children: ReactNode;
};

/** Ambient mesh + soft orbs behind profile modal content. */
export function NetworkProfileModalChrome({ children }: NetworkProfileModalChromeProps) {
  return (
    <View style={styles.chromeRoot}>
      <LinearGradient
        colors={["#E8EDFF", "#F4F6FB", "#EEF2F8"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.orb, styles.orbIndigo]} pointerEvents="none" />
      <View style={[styles.orb, styles.orbMint]} pointerEvents="none" />
      <View style={[styles.orb, styles.orbRose]} pointerEvents="none" />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  chromeRoot: {
    width: "100%",
    overflow: "hidden",
    backgroundColor: "#F4F6FB",
  },
  orb: {
    position: "absolute",
    borderRadius: 999,
  },
  orbIndigo: {
    width: 180,
    height: 180,
    top: -48,
    right: -40,
    backgroundColor: "rgba(99, 102, 241, 0.14)",
  },
  orbMint: {
    width: 140,
    height: 140,
    bottom: 80,
    left: -50,
    backgroundColor: "rgba(16, 185, 129, 0.1)",
  },
  orbRose: {
    width: 100,
    height: 100,
    top: 120,
    left: "38%",
    backgroundColor: "rgba(244, 63, 94, 0.06)",
  },
  shell: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Theme.networkGlassBorder,
    overflow: "hidden",
    position: "relative",
    backgroundColor: Theme.networkGlassSurface,
  },
  shellCompact: {
    borderRadius: 16,
  },
  specular: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.95,
  },
  edgeHighlight: {
    position: "absolute",
    top: 0,
    left: 12,
    right: 12,
    height: StyleSheet.hairlineWidth,
    backgroundColor: Theme.networkGlassSpecular,
    opacity: 0.95,
  },
  content: {
    paddingVertical: 14,
    paddingHorizontal: 14,
    zIndex: 1,
  },
  contentCompact: {
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
});
