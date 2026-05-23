/**
 * Profile modal metric cell — typography aligned with FinanceTxnTypography.
 */
import { FinanceTxnTypography } from "@/constants/FinanceTxnTypography";
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
  layout?: "tile" | "row" | "stat";
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
  const iconSize = layout === "tile" ? "md" : "sm";
  const icon = <NetworkProfileDepthIcon variant={variant} size={iconSize} bare />;

  if (layout === "row" || layout === "stat") {
    return (
      <NetworkProfileGlassPanel compact style={[styles.rowTileOuter, style]}>
        <View style={styles.rowTile}>
          <View style={styles.iconSlot}>{icon}</View>
          <View style={styles.rowTextCol}>
            <Text style={styles.rowLabel} numberOfLines={1}>
              {label}
            </Text>
            <Text
              style={[styles.rowValue, valueTone === "live" && styles.valueLive]}
              numberOfLines={layout === "stat" ? 2 : 1}
              adjustsFontSizeToFit={layout === "stat"}
              minimumFontScale={0.85}
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
        <View style={styles.iconSlot}>{icon}</View>
        <View style={styles.tileTextCol}>
          <Text style={styles.tileLabel} numberOfLines={2}>
            {label}
          </Text>
          <Text
            style={[styles.tileValue, valueTone === "live" && styles.valueLive]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.85}
          >
            {value}
          </Text>
        </View>
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
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 0,
  },
  iconSlot: {
    flexShrink: 0,
  },
  tileTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  tileLabel: {
    ...FinanceTxnTypography.fieldLabel,
    lineHeight: 11,
  },
  tileValue: {
    ...FinanceTxnTypography.amount,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.15,
    lineHeight: 14,
  },
  rowTileOuter: {
    flex: 1,
    minWidth: 0,
  },
  rowTile: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 0,
  },
  rowTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rowLabel: {
    ...FinanceTxnTypography.fieldLabel,
    lineHeight: 11,
  },
  rowValue: {
    ...FinanceTxnTypography.fieldValue,
    textTransform: "uppercase",
    fontWeight: "500",
    fontStyle: "normal",
    lineHeight: 12,
  },
  valueLive: {
    ...FinanceTxnTypography.fieldValue,
    fontStyle: "italic",
    fontWeight: "500",
  },
});
