/**
 * Solid gradient icon tile with specular highlight — depth for network profile modal.
 */
import Theme from "@/constants/Theme";
import { LinearGradient } from "expo-linear-gradient";
import type { LucideIcon } from "lucide-react-native";
import {
  Building2,
  Link2,
  Phone,
  Signal,
  Star,
  Truck,
  Users,
} from "lucide-react-native";
import { Platform, StyleSheet, View } from "react-native";

export type NetworkProfileDepthIconVariant =
  | "role"
  | "connection"
  | "rating"
  | "trips"
  | "presence"
  | "mutuals"
  | "phone";

type VariantConfig = {
  colors: [string, string];
  Icon: LucideIcon;
  iconColor: string;
  fill?: string;
};

const VARIANTS: Record<NetworkProfileDepthIconVariant, VariantConfig> = {
  role: {
    colors: [Theme.primaryLight, Theme.primary],
    Icon: Building2,
    iconColor: Theme.textOnPrimary,
  },
  connection: {
    colors: [Theme.liquidGoodMiddle, Theme.liquidGoodBack],
    Icon: Link2,
    iconColor: Theme.textOnPrimary,
  },
  phone: {
    colors: ["#3B82F6", "#1D4ED8"],
    Icon: Phone,
    iconColor: Theme.textOnPrimary,
  },
  rating: {
    colors: [Theme.liquidWarnFront, Theme.liquidWarnBack],
    Icon: Star,
    iconColor: Theme.textOnPrimary,
    fill: Theme.textOnPrimary,
  },
  trips: {
    colors: ["#6366F1", "#4338CA"],
    Icon: Truck,
    iconColor: Theme.textOnPrimary,
  },
  presence: {
    colors: [Theme.liquidGoodFront, Theme.liquidGoodBack],
    Icon: Signal,
    iconColor: Theme.textOnPrimary,
  },
  mutuals: {
    colors: ["#8B5CF6", "#6D28D9"],
    Icon: Users,
    iconColor: Theme.textOnPrimary,
  },
};

const tileShadow = Platform.select({
  ios: {
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 6,
  },
  android: { elevation: 5 },
  web: {
    boxShadow:
      "0 4px 10px rgba(15, 23, 42, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.35)",
  },
  default: {},
});

export type NetworkProfileDepthIconProps = {
  variant: NetworkProfileDepthIconVariant;
  size?: "sm" | "md";
};

export function NetworkProfileDepthIcon({ variant, size = "md" }: NetworkProfileDepthIconProps) {
  const dim = size === "md" ? 36 : 30;
  const iconSize = size === "md" ? 16 : 13;
  const { colors, Icon, iconColor, fill } = VARIANTS[variant];
  const radius = Math.round(dim * 0.28);

  return (
    <View style={[styles.shell, { width: dim, height: dim, borderRadius: radius }, tileShadow]}>
      <LinearGradient
        colors={colors}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={["rgba(255,255,255,0.38)", "rgba(255,255,255,0)"]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.65 }}
        style={styles.specular}
        pointerEvents="none"
      />
      <View style={[styles.iconInset, { borderRadius: radius - 2 }]} pointerEvents="none" />
      <Icon
        size={iconSize}
        color={iconColor}
        fill={fill}
        strokeWidth={2.25}
        style={styles.icon}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    position: "relative",
  },
  specular: {
    ...StyleSheet.absoluteFillObject,
  },
  iconInset: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0,0,0,0.12)",
    top: 1,
    left: 1,
    right: 1,
    bottom: 2,
  },
  icon: {
    zIndex: 2,
  },
});
