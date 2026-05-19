/**
 * Profile modal metric cell — frosted glass + tinted icon chips.
 */
import Theme from "@/constants/Theme";
import {
  NetworkProfileGlassPanel,
} from "@/features/network/components/NetworkProfileGlassShell";
import {
  NetworkProfileDepthIcon,
  type NetworkProfileDepthIconVariant,
} from "@/features/network/components/NetworkProfileDepthIcon";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

export type NetworkProfileMetricTileProps = {
  variant: NetworkProfileDepthIconVariant;
  label: string;
  value: string;
  layout?: "tile" | "row";
  valueTone?: "default" | "live";
  style?: StyleProp<ViewStyle>;
};

export function NetworkProfileMetricTile({
  variant,
  label,
  value,
  layout = "tile",
  valueTone = "default",
  style,
}: NetworkProfileMetricTileProps) {
  const icon = <NetworkProfileDepthIcon variant={variant} size={layout === "row" ? "sm" : "md"} />;

  if (layout === "row") {
    return (
      <NetworkProfileGlassPanel compact style={[styles.rowTileOuter, style]}>
        <View style={styles.rowTile}>
          {icon}
          <View style={styles.rowTextCol}>
            <Text style={styles.rowLabel} numberOfLines={1}>
              {label}
            </Text>
            <Text
              style={[styles.rowValue, valueTone === "live" && styles.valueLive]}
              numberOfLines={1}
            >
              {value}
            </Text>
          </View>
        </View>
      </NetworkProfileGlassPanel>
    );
  }

  return (
    <NetworkProfileGlassPanel compact style={[styles.tileOuter, style]}>
      <View style={styles.tile}>
        <View style={styles.tileIconRow}>{icon}</View>
        <Text style={styles.tileLabel} numberOfLines={2}>
          {label}
        </Text>
        <Text
          style={[styles.tileValue, valueTone === "live" && styles.valueLive]}
          numberOfLines={1}
        >
          {value}
        </Text>
      </View>
    </NetworkProfileGlassPanel>
  );
}

const styles = StyleSheet.create({
  tileOuter: {
    flex: 1,
    minWidth: 0,
  },
  tile: {
    alignItems: "center",
    gap: 6,
    paddingVertical: 2,
  },
  tileIconRow: {
    marginBottom: 2,
  },
  tileLabel: {
    fontSize: 9,
    fontWeight: "600",
    color: Theme.textMuted,
    letterSpacing: 0.9,
    textAlign: "center",
    textTransform: "uppercase",
    lineHeight: 12,
  },
  tileValue: {
    fontSize: 16,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    textAlign: "center",
    letterSpacing: -0.3,
  },
  rowTileOuter: {
    flex: 1,
    minWidth: 0,
  },
  rowTile: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 2,
  },
  rowTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  rowLabel: {
    fontSize: 9,
    fontWeight: "600",
    color: Theme.textMuted,
    letterSpacing: 0.75,
    textTransform: "uppercase",
  },
  rowValue: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: 0.15,
  },
  valueLive: {
    color: Theme.positive,
    fontWeight: "600",
    fontStyle: "italic",
  },
});
