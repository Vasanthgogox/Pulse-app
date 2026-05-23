/**
 * Neutral icons for network profile modal.
 */
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
import { StyleSheet, View } from "react-native";

export type NetworkProfileDepthIconVariant =
  | "role"
  | "connection"
  | "rating"
  | "trips"
  | "presence"
  | "mutuals"
  | "phone";

const ICONS: Record<NetworkProfileDepthIconVariant, LucideIcon> = {
  role: Building2,
  connection: Link2,
  phone: Phone,
  rating: Star,
  trips: Truck,
  presence: Signal,
  mutuals: Users,
};

const ICON_COLOR = "#64748B";

export type NetworkProfileDepthIconProps = {
  variant: NetworkProfileDepthIconVariant;
  size?: "sm" | "md";
  /** Line icon only — no tinted chip box. */
  bare?: boolean;
};

export function NetworkProfileDepthIcon({
  variant,
  size = "md",
  bare = false,
}: NetworkProfileDepthIconProps) {
  const iconSize = size === "md" ? 14 : 12;
  const Icon = ICONS[variant];
  const isRating = variant === "rating";

  if (bare) {
    return (
      <Icon
        size={iconSize}
        color={ICON_COLOR}
        fill={isRating ? "rgba(100, 116, 139, 0.15)" : undefined}
        strokeWidth={2}
      />
    );
  }

  const dim = size === "md" ? 28 : 24;
  const radius = Math.round(dim * 0.28);

  return (
    <View
      style={[
        styles.shell,
        { width: dim, height: dim, borderRadius: radius },
      ]}
    >
      <Icon
        size={iconSize}
        color={ICON_COLOR}
        fill={isRating ? "rgba(100, 116, 139, 0.2)" : undefined}
        strokeWidth={2}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15, 23, 42, 0.05)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(15, 23, 42, 0.1)",
  },
});
