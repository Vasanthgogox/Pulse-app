import Theme from "@/constants/Theme";
import { Platform, StyleSheet, Text, View } from "react-native";

/** Matches `LoadCardRouteRow` mid column (line + chevron). */
const ROUTE_MID_WIDTH = 24;

export type LoadCardSpecsRowProps = {
  vehicle: string;
  weight: string;
  loadType: string;
  /** `route` aligns with LoadCardRouteRow chevron gap; `equal` uses three balanced columns. */
  layout?: "route" | "equal";
  /** `md` for sheets / detail panels with slightly larger type. */
  density?: "sm" | "md";
};

/**
 * Vehicle | Load | Weight under the route row — same flex bands as origin | → | destination.
 */
export function LoadCardSpecsRow({
  vehicle,
  weight,
  loadType,
  layout = "route",
  density = "sm",
}: LoadCardSpecsRowProps) {
  const md = density === "md";
  const equal = layout === "equal";
  const labelStyle = [styles.label, md && styles.labelMd];
  const valueStyle = [styles.value, md && styles.valueMd];

  return (
    <View style={styles.grid}>
      <View style={[styles.row, equal && styles.rowEqual]}>
        <View style={[styles.colLeft, equal && styles.colEqual]}>
          <Text style={labelStyle}>Vehicle</Text>
          <Text
            style={[...valueStyle, styles.valueLeft]}
            numberOfLines={equal ? 3 : 2}
          >
            {vehicle}
          </Text>
        </View>
        {equal ? (
          <View style={[styles.colEqual, styles.colEqualCenter]}>
            <Text style={[...labelStyle, styles.labelCenter]}>Load</Text>
            <Text
              style={[...valueStyle, styles.valueCenter]}
              numberOfLines={3}
            >
              {loadType}
            </Text>
          </View>
        ) : (
          <View style={styles.colMid}>
            <Text style={[...labelStyle, styles.labelCenter]}>Load</Text>
            <Text style={[...valueStyle, styles.valueCenter]} numberOfLines={2}>
              {loadType}
            </Text>
          </View>
        )}
        <View style={[styles.colRight, equal && styles.colEqual, equal && styles.colEqualEnd]}>
          <Text style={[...labelStyle, styles.labelRight]}>Weight</Text>
          <Text
            style={[...valueStyle, styles.valueRight]}
            numberOfLines={equal ? 2 : 2}
          >
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
  rowEqual: {
    gap: 10,
  },
  colEqual: {
    flex: 1,
    minWidth: 0,
    alignItems: "flex-start",
  },
  colEqualCenter: {
    alignItems: "center",
  },
  colEqualEnd: {
    alignItems: "flex-end",
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
  labelMd: {
    fontSize: 10,
    letterSpacing: 0.6,
    marginBottom: 5,
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
  valueMd: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    lineHeight: 16,
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
