import type { SalesSlice } from "@/features/network/utils/connectionSalesAnalytics.util";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, G } from "react-native-svg";

const SIZE = {
  md: { chart: 116, stroke: 11 },
  sm: { chart: 72, stroke: 8 },
};

type Props = {
  slices: SalesSlice[];
  activeLabel?: string | null;
  onSelectLabel?: (label: string | null) => void;
  emptyMessage?: string;
  /** Smaller chart + legend for narrow profile / mobile panels. */
  compact?: boolean;
};

export function NetworkDesktopSalesDonut({
  slices,
  activeLabel = null,
  onSelectLabel,
  emptyMessage = "No contribution data.",
  compact = false,
}: Props) {
  const dims = compact ? SIZE.sm : SIZE.md;
  const chartSize = dims.chart;
  const stroke = dims.stroke;
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  if (total <= 0) {
    return (
      <Text style={[styles.empty, compact && styles.emptySm]}>{emptyMessage}</Text>
    );
  }

  const radius = (chartSize - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = chartSize / 2;
  const viewPad = stroke;
  let offset = 0;

  const legend = (
    <View style={[styles.legend, compact && styles.legendSm]}>
      {slices.map((slice) => {
        const active = activeLabel === slice.label;
        const pct = Math.round((slice.value / total) * 100);
        const row = (
          <View style={styles.legendRow}>
            <View
              style={[
                styles.legendDot,
                compact && styles.legendDotSm,
                { backgroundColor: slice.color },
              ]}
            />
            <Text
              style={[
                styles.legendLabel,
                compact && styles.legendLabelSm,
                active && styles.legendLabelActive,
              ]}
              numberOfLines={2}
            >
              {slice.label}
            </Text>
            {slice.valueLabel ? (
              <Text
                style={[
                  styles.legendAmount,
                  compact && styles.legendAmountSm,
                  active && styles.legendAmountActive,
                ]}
                numberOfLines={1}
              >
                {slice.valueLabel}
              </Text>
            ) : null}
            <Text style={[styles.legendValue, compact && styles.legendValueSm]}>
              {pct}%
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
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            {row}
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      <View style={[styles.chartCol, { width: chartSize, height: chartSize }]}>
        <Svg
          width={chartSize}
          height={chartSize}
          viewBox={`${-viewPad} ${-viewPad} ${chartSize + viewPad * 2} ${chartSize + viewPad * 2}`}
          style={styles.chartSvg}
        >
          <G rotation="-90" origin={`${center}, ${center}`}>
            <Circle
              cx={center}
              cy={center}
              r={radius}
              stroke="#eef1f6"
              strokeWidth={stroke}
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
                  strokeWidth={stroke}
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
    alignSelf: "stretch",
    width: "100%",
    gap: 14,
    minWidth: 0,
  },
  wrapCompact: {
    gap: 8,
  },
  chartCol: {
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  chartSvg: {
    overflow: "visible",
  },
  legendScroll: {
    flex: 1,
    minWidth: 0,
    maxHeight: 160,
  },
  legendScrollContent: {
    flexGrow: 1,
    justifyContent: "center",
  },
  legend: {
    flex: 1,
    minWidth: 0,
    gap: 7,
    justifyContent: "center",
  },
  legendSm: {
    gap: 5,
  },
  legendPress: {
    borderRadius: 6,
    paddingVertical: 3,
    paddingHorizontal: 4,
    marginHorizontal: -4,
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
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  legendDotSm: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  legendLabel: {
    flex: 1,
    fontSize: 11,
    fontWeight: "500",
    color: "#181C32",
    minWidth: 0,
    lineHeight: 14,
  },
  legendLabelSm: {
    fontSize: 9,
    lineHeight: 12,
  },
  legendLabelActive: {
    fontWeight: "700",
    color: "#3E97FF",
  },
  legendAmount: {
    fontSize: 11,
    fontWeight: "700",
    color: "#181C32",
    fontVariant: ["tabular-nums"],
    flexShrink: 0,
    textAlign: "right",
    minWidth: 52,
  },
  legendAmountSm: {
    fontSize: 9,
    minWidth: 44,
  },
  legendAmountActive: {
    color: "#3E97FF",
  },
  legendValue: {
    fontSize: 11,
    fontWeight: "600",
    color: "#A1A5B7",
    minWidth: 34,
    textAlign: "right",
    flexShrink: 0,
  },
  legendValueSm: {
    fontSize: 9,
    minWidth: 28,
  },
  empty: {
    fontSize: 12,
    color: "#A1A5B7",
    paddingVertical: 16,
    textAlign: "center",
    width: "100%",
  },
  emptySm: {
    fontSize: 10,
    paddingVertical: 8,
  },
});
