import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from "react-native-svg";

import Theme from "@/constants/Theme";
import { pulseEnterpriseStyles as ent } from "@/features/business-pulse/components/pulseEnterpriseStyles";

function monthLabel(month: string): string {
  const [, mm] = month.split("-");
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const idx = Number(mm) - 1;
  return names[idx] ?? month;
}

function formatAxisValue(value: number): string {
  if (value >= 100000) return `₹${Math.round(value / 1000)}K`;
  if (value >= 1000) return `₹${Math.round(value / 1000)}K`;
  return `₹${Math.round(value)}`;
}

function smoothPath(coords: Array<{ x: number; y: number }>): string {
  if (coords.length === 0) return "";
  if (coords.length === 1) return `M${coords[0]!.x},${coords[0]!.y}`;
  let d = `M${coords[0]!.x},${coords[0]!.y}`;
  for (let i = 0; i < coords.length - 1; i++) {
    const p0 = coords[i]!;
    const p1 = coords[i + 1]!;
    const cx = (p0.x + p1.x) / 2;
    d += ` C${cx},${p0.y} ${cx},${p1.y} ${p1.x},${p1.y}`;
  }
  return d;
}

type Point = { month: string; value: number };

type Props = {
  points: Point[];
  selectedMonth: string | null;
  onSelectMonth: (month: string | null) => void;
  emptyLabel?: string;
};

export function PulseIntelligenceChart({
  points,
  selectedMonth,
  onSelectMonth,
  emptyLabel = "No data in current filter scope.",
}: Props) {
  if (points.length === 0) {
    return <Text style={styles.empty}>{emptyLabel}</Text>;
  }

  const max = Math.max(...points.map((item) => item.value), 1);
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((pct) => ({
    pct,
    label: formatAxisValue(max * (1 - pct)),
  }));

  const coords = points.map((item, i) => {
    const x = points.length <= 1 ? 50 : 4 + (i / (points.length - 1)) * 92;
    const y = 8 + (1 - item.value / max) * 78;
    return { x, y, item };
  });

  const linePath = smoothPath(coords);
  const areaPath =
    coords.length > 0
      ? `${linePath} L${coords[coords.length - 1]!.x},92 L${coords[0]!.x},92 Z`
      : "";

  const selected = coords.find((c) => c.item.month === selectedMonth);

  return (
    <View style={[ent.chartBody, styles.wrap]}>
      <View style={styles.chartRow}>
        <View style={styles.yAxis}>
          {yTicks.map((tick) => (
            <Text key={tick.pct} style={styles.yTick}>
              {tick.label}
            </Text>
          ))}
        </View>
        <View style={styles.chartCol}>
          <Svg width="100%" height={152} viewBox="0 0 100 100" preserveAspectRatio="none">
            <Defs>
              <LinearGradient id="pulseAreaGrad2" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0%" stopColor={Theme.primary} stopOpacity={0.08} />
                <Stop offset="100%" stopColor={Theme.primary} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            {/* Horizontal grid lines */}
            {[25, 50, 75].map((y) => (
              <Path
                key={y}
                d={`M4,${y} L96,${y}`}
                stroke="#eff2f5"
                strokeWidth={0.6}
              />
            ))}
            {/* Subtle area fill */}
            {areaPath ? <Path d={areaPath} fill="url(#pulseAreaGrad2)" /> : null}
            {/* Main line */}
            {linePath ? (
              <Path
                d={linePath}
                fill="none"
                stroke={Theme.primary}
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}
            {/* Invisible hit targets for month selection */}
            {coords.map(({ x, item }) => (
              <Rect
                key={`hit-${item.month}`}
                x={x - 4}
                y={0}
                width={8}
                height={96}
                fill="transparent"
              />
            ))}
            {/* Active dots */}
            {coords.map(({ x, y, item }) => {
              const active = selectedMonth === item.month;
              return active ? (
                <Circle
                  key={item.month}
                  cx={x}
                  cy={y}
                  r={3}
                  fill={Theme.primary}
                  stroke="#ffffff"
                  strokeWidth={1.5}
                />
              ) : null;
            })}
            {/* Selected month: vertical line + dot */}
            {selected ? (
              <>
                <Path
                  d={`M${selected.x},6 L${selected.x},94`}
                  stroke={Theme.primary}
                  strokeWidth={0.7}
                  strokeDasharray="2,2"
                  opacity={0.4}
                />
                <Circle cx={selected.x} cy={selected.y} r={4} fill={Theme.primary} opacity={0.12} />
                <Circle cx={selected.x} cy={selected.y} r={2.8} fill={Theme.primary} stroke="#fff" strokeWidth={1.5} />
              </>
            ) : null}
          </Svg>
          <View style={styles.xAxis}>
            {points.map((item) => {
              const active = selectedMonth === item.month;
              return (
                <Pressable
                  key={item.month}
                  onPress={() => onSelectMonth(active ? null : item.month)}
                  style={styles.xAxisCell}
                  accessibilityRole="button"
                >
                  <Text style={[styles.xAxisText, active && styles.xAxisTextActive]}>
                    {monthLabel(item.month)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
      {selected ? (
        <View style={styles.tooltip}>
          <Text style={styles.tooltipTitle}>{monthLabel(selected.item.month)} revenue</Text>
          <Text style={styles.tooltipValue}>{formatAxisValue(selected.item.value)}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 10,
    width: "100%",
  },
  chartRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 6,
    width: "100%",
    minHeight: 140,
  },
  yAxis: {
    width: 42,
    justifyContent: "space-between",
    paddingVertical: 6,
    flexShrink: 0,
  },
  yTick: {
    fontSize: 10,
    fontWeight: "500",
    color: "#A1A5B7",
    textAlign: "right",
  },
  chartCol: {
    flex: 1,
    minWidth: 0,
  },
  xAxis: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 8,
    paddingHorizontal: 2,
  },
  xAxisCell: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 4,
  },
  xAxisText: {
    fontSize: 10,
    fontWeight: "500",
    color: "#A1A5B7",
  },
  xAxisTextActive: {
    color: Theme.primary,
    fontWeight: "700",
  },
  tooltip: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "#eff2f5",
    borderRadius: 6,
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 1,
  },
  tooltipTitle: {
    fontSize: 10,
    fontWeight: "600",
    color: "#A1A5B7",
  },
  tooltipValue: {
    fontSize: 12,
    fontWeight: "700",
    color: "#181C32",
  },
  empty: {
    fontSize: 12,
    color: "#A1A5B7",
    paddingVertical: 24,
    textAlign: "center",
  },
});
