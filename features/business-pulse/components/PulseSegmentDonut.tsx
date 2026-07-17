import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, G } from "react-native-svg";

import { pulseEnterpriseStyles as ent } from "@/features/business-pulse/components/pulseEnterpriseStyles";

export type PulseSegmentSlice = {
  label: string;
  value: number;
  color: string;
};

type Props = {
  slices: PulseSegmentSlice[];
  emptyMessage?: string;
};

export function PulseSegmentDonut({ slices, emptyMessage }: Props) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  if (total <= 0) {
    return emptyMessage ? <Text style={styles.empty}>{emptyMessage}</Text> : null;
  }

  const size = 100;
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <View style={[ent.chartBody, styles.wrap]}>
      <View style={styles.chartCol}>
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <G rotation="-90" origin={`${size / 2}, ${size / 2}`}>
            <Circle
              cx={size / 2}
              cy={size / 2}
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
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  stroke={slice.color}
                  strokeWidth={stroke}
                  fill="none"
                  strokeDasharray={`${dash} ${circumference - dash}`}
                  strokeDashoffset={-offset}
                  strokeLinecap="butt"
                />
              );
              offset += dash;
              return el;
            })}
          </G>
        </Svg>
      </View>
      <View style={styles.legend}>
        {slices.map((slice) => (
          <View key={slice.label} style={styles.legendRow}>
            <View style={[styles.legendDot, { backgroundColor: slice.color }]} />
            <Text style={styles.legendLabel} numberOfLines={1}>
              {slice.label}
            </Text>
            <Text style={styles.legendValue}>
              {Math.round((slice.value / total) * 100)}%
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    width: "100%",
  },
  chartCol: {
    width: 100,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  legend: {
    flex: 1,
    minWidth: 0,
    gap: 7,
    justifyContent: "center",
  },
  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  legendDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    flexShrink: 0,
  },
  legendLabel: {
    flex: 1,
    fontSize: 11,
    fontWeight: "500",
    color: "#181C32",
  },
  legendValue: {
    fontSize: 11,
    fontWeight: "600",
    color: "#A1A5B7",
    minWidth: 32,
    textAlign: "right",
  },
  empty: {
    fontSize: 12,
    color: "#A1A5B7",
    paddingVertical: 22,
    textAlign: "center",
  },
});
