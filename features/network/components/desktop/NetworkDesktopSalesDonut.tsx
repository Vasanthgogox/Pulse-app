import type { SalesSlice } from "@/features/network/utils/connectionSalesAnalytics.util";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, G } from "react-native-svg";

const CHART_SIZE = 88;
const STROKE = 9;

type Props = {
  slices: SalesSlice[];
  activeLabel?: string | null;
  onSelectLabel?: (label: string | null) => void;
  emptyMessage?: string;
};

export function NetworkDesktopSalesDonut({
  slices,
  activeLabel = null,
  onSelectLabel,
  emptyMessage = "No contribution data.",
}: Props) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  if (total <= 0) {
    return <Text style={styles.empty}>{emptyMessage}</Text>;
  }

  const radius = (CHART_SIZE - STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = CHART_SIZE / 2;
  const viewPad = STROKE;
  let offset = 0;

  const legend = (
    <View style={styles.legend}>
      {slices.map((slice) => {
        const active = activeLabel === slice.label;
        const row = (
          <View style={styles.legendRow}>
            <View
              style={[styles.legendDot, { backgroundColor: slice.color }]}
            />
            <Text
              style={[styles.legendLabel, active && styles.legendLabelActive]}
              numberOfLines={1}
            >
              {slice.label}
            </Text>
            <Text style={styles.legendValue}>
              {Math.round((slice.value / total) * 100)}%
            </Text>
          </View>
        );
        if (!onSelectLabel) return <View key={slice.label}>{row}</View>;
        return (
          <Pressable
            key={slice.label}
            onPress={() => onSelectLabel(active ? null : slice.label)}
            style={({ pressed }) => [
              styles.legendPress,
              active && styles.legendPressActive,
              pressed && { opacity: 0.85 },
            ]}
          >
            {row}
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <View style={styles.wrap}>
      <View style={styles.chartCol}>
        <Svg
          width={CHART_SIZE}
          height={CHART_SIZE}
          viewBox={`${-viewPad} ${-viewPad} ${CHART_SIZE + viewPad * 2} ${CHART_SIZE + viewPad * 2}`}
          style={styles.chartSvg}
        >
          <G rotation="-90" origin={`${center}, ${center}`}>
            <Circle
              cx={center}
              cy={center}
              r={radius}
              stroke="#eef1f6"
              strokeWidth={STROKE}
              fill="none"
            />
            {slices.map((slice) => {
              const pct = slice.value / total;
              const dash = pct * circumference;
              const el = (
                <Circle
                  key={slice.label}
                  cx={center}
                  cy={center}
                  r={radius}
                  stroke={slice.color}
                  strokeWidth={STROKE}
                  fill="none"
                  strokeDasharray={`${dash} ${circumference - dash}`}
                  strokeDashoffset={-offset}
                  strokeLinecap="butt"
                  opacity={
                    activeLabel && activeLabel !== slice.label ? 0.35 : 1
                  }
                />
              );
              offset += dash;
              return el;
            })}
          </G>
        </Svg>
      </View>
      {slices.length > 5 ? (
        <ScrollView
          style={styles.legendScroll}
          contentContainerStyle={styles.legendScrollContent}
          showsVerticalScrollIndicator={false}
        >
          {legend}
        </ScrollView>
      ) : (
        legend
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    width: "100%",
    minWidth: 0,
  },
  chartCol: {
    width: CHART_SIZE,
    height: CHART_SIZE,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
  },
  chartSvg: {
    overflow: "visible",
  },
  legendScroll: {
    flex: 1,
    minWidth: 0,
    maxHeight: 118,
  },
  legendScrollContent: {
    flexGrow: 1,
    justifyContent: "center",
  },
  legend: {
    flex: 1,
    minWidth: 0,
    gap: 5,
    justifyContent: "center",
  },
  legendPress: {
    borderRadius: 6,
    paddingVertical: 2,
    paddingHorizontal: 2,
    marginHorizontal: -2,
  },
  legendPressActive: {
    backgroundColor: "rgba(62, 151, 255, 0.1)",
  },
  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
  },
  legendDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    flexShrink: 0,
  },
  legendLabel: {
    flex: 1,
    fontSize: 10,
    fontWeight: "500",
    color: "#181C32",
    minWidth: 0,
  },
  legendLabelActive: {
    fontWeight: "700",
    color: "#3E97FF",
  },
  legendValue: {
    fontSize: 10,
    fontWeight: "600",
    color: "#A1A5B7",
    minWidth: 28,
    textAlign: "right",
    flexShrink: 0,
  },
  empty: {
    fontSize: 12,
    color: "#A1A5B7",
    paddingVertical: 16,
    textAlign: "center",
    width: "100%",
  },
});
