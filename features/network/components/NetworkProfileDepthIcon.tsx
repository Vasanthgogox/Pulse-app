/**
 * Frosted glass icon chips for network profile modal (mirror / Apple glass).
 */
import Theme from "@/constants/Theme";
import { PROFILE_GLASS_WEB } from "@/features/network/components/NetworkProfileGlassShell";
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
  tintTop: string;
  tintBottom: string;
  iconColor: string;
  borderColor: string;
  Icon: LucideIcon;
  fill?: string;
};

const VARIANTS: Record<NetworkProfileDepthIconVariant, VariantConfig> = {
  role: {
    tintTop: "rgba(99, 102, 241, 0.22)",
    tintBottom: "rgba(99, 102, 241, 0.08)",
    iconColor: Theme.networkGlassSupplyAccent,
    borderColor: "rgba(99, 102, 241, 0.28)",
    Icon: Building2,
  },
  connection: {
    tintTop: "rgba(16, 185, 129, 0.2)",
    tintBottom: "rgba(16, 185, 129, 0.07)",
    iconColor: Theme.networkGlassDemandAccent,
    borderColor: "rgba(16, 185, 129, 0.26)",
    Icon: Link2,
  },
  phone: {
    tintTop: "rgba(59, 130, 246, 0.2)",
    tintBottom: "rgba(59, 130, 246, 0.08)",
    iconColor: "#2563EB",
    borderColor: "rgba(59, 130, 246, 0.26)",
    Icon: Phone,
  },
  rating: {
    tintTop: "rgba(245, 158, 11, 0.24)",
    tintBottom: "rgba(245, 158, 11, 0.08)",
    iconColor: Theme.driverGold,
    borderColor: "rgba(245, 158, 11, 0.3)",
    Icon: Star,
    fill: Theme.driverGold,
  },
  trips: {
    tintTop: "rgba(99, 102, 241, 0.2)",
    tintBottom: "rgba(67, 56, 202, 0.08)",
    iconColor: "#4F46E5",
    borderColor: "rgba(99, 102, 241, 0.26)",
    Icon: Truck,
  },
  presence: {
    tintTop: "rgba(16, 185, 129, 0.22)",
    tintBottom: "rgba(21, 128, 61, 0.08)",
    iconColor: Theme.positive,
    borderColor: "rgba(21, 128, 61, 0.24)",
    Icon: Signal,
  },
  mutuals: {
    tintTop: "rgba(139, 92, 246, 0.22)",
    tintBottom: "rgba(109, 40, 217, 0.08)",
    iconColor: "#7C3AED",
    borderColor: "rgba(139, 92, 246, 0.26)",
    Icon: Users,
  },
};

const chipShadow = Platform.select({
  ios: {
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  android: { elevation: 2 },
  web: {
    boxShadow:
      "0 3px 10px rgba(15, 23, 42, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.9)",
  },
  default: {},
});

export type NetworkProfileDepthIconProps = {
  variant: NetworkProfileDepthIconVariant;
  size?: "sm" | "md";
};

export function NetworkProfileDepthIcon({ variant, size = "md" }: NetworkProfileDepthIconProps) {
  const dim = size === "md" ? 38 : 32;
  const iconSize = size === "md" ? 17 : 14;
  const { tintTop, tintBottom, iconColor, borderColor, Icon, fill } = VARIANTS[variant];
  const radius = Math.round(dim * 0.3);

  return (
    <View
      style={[
        styles.shell,
        PROFILE_GLASS_WEB,
        { width: dim, height: dim, borderRadius: radius, borderColor },
        chipShadow,
      ]}
    >
      <LinearGradient
        colors={[tintTop, tintBottom]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={["rgba(255,255,255,0.55)", "rgba(255,255,255,0)"]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.7 }}
        style={styles.specular}
        pointerEvents="none"
      />
      <Icon
        size={iconSize}
        color={iconColor}
        fill={fill}
        strokeWidth={2.15}
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
    borderWidth: 1,
    backgroundColor: Theme.networkGlassSurface,
  },
  specular: {
    ...StyleSheet.absoluteFillObject,
  },
  icon: {
    zIndex: 2,
  },
});
