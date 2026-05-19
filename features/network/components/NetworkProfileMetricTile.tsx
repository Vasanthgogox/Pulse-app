/**
 * Profile modal metric cell — 3D icon + label + value (tile or compact row).
 */
import Theme from "@/constants/Theme";
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
      <View style={[styles.rowTile, style]}>
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
    );
  }

  return (
    <View style={[styles.tile, style]}>
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
  );
}

const styles = StyleSheet.create({
  tile: {
    minWidth: 0,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: "center",
    gap: 6,
  },
  tileIconRow: {
    marginBottom: 2,
  },
  tileLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 0.8,
    textAlign: "center",
    textTransform: "uppercase",
    lineHeight: 12,
  },
  tileValue: {
    fontSize: 15,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    textAlign: "center",
    letterSpacing: -0.2,
  },
  rowTile: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  rowTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  rowLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  rowValue: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: 0.2,
  },
  valueLive: {
    color: Theme.positive,
    fontStyle: "italic",
  },
});
