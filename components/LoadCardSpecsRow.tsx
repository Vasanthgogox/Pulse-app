import Theme from "@/constants/Theme";
import { Platform, StyleSheet, Text, View } from "react-native";

/** Matches `LoadCardRouteRow` mid column (line + chevron). */
const ROUTE_MID_WIDTH = 24;

export type LoadCardSpecsRowProps = {
  vehicle: string;
  weight: string;
  loadType: string;
};

/**
 * Vehicle | Load | Weight under the route row — same flex bands as origin | → | destination.
 */
export function LoadCardSpecsRow({
  vehicle,
  weight,
  loadType,
}: LoadCardSpecsRowProps) {
  return (
    <View style={styles.grid}>
      <View style={styles.row}>
        <View style={styles.colLeft}>
          <Text style={styles.label}>Vehicle</Text>
          <Text style={[styles.value, styles.valueLeft]} numberOfLines={2}>
            {vehicle}
          </Text>
        </View>
        <View style={styles.colMid}>
          <Text style={[styles.label, styles.labelCenter]}>Load</Text>
          <Text style={[styles.value, styles.valueCenter]} numberOfLines={2}>
            {loadType}
          </Text>
        </View>
        <View style={styles.colRight}>
          <Text style={[styles.label, styles.labelRight]}>Weight</Text>
          <Text style={[styles.value, styles.valueRight]} numberOfLines={2}>
            {weight}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    gap: 0,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 4,
  },
  colLeft: {
    flex: 1,
    minWidth: 0,
    alignItems: "flex-start",
    paddingRight: 4,
  },
  colMid: {
    width: ROUTE_MID_WIDTH,
    flexShrink: 0,
    alignItems: "center",
    paddingTop: 0,
  },
  colRight: {
    flex: 1,
    minWidth: 0,
    alignItems: "flex-end",
    paddingLeft: 4,
  },
  label: {
    fontSize: 8,
    fontWeight: "600",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  labelCenter: {
    textAlign: "center",
    alignSelf: "stretch",
  },
  labelRight: {
    textAlign: "right",
    alignSelf: "stretch",
  },
  value: {
    fontSize: 8,
    fontWeight: "500",
    color: Theme.textSecondary,
    lineHeight: 12,
    ...Platform.select({
      android: { includeFontPadding: false as const },
      default: {},
    }),
  },
  valueLeft: {
    textAlign: "left",
    alignSelf: "stretch",
  },
  valueCenter: {
    textAlign: "center",
    alignSelf: "stretch",
  },
  valueRight: {
    textAlign: "right",
    alignSelf: "stretch",
  },
});
