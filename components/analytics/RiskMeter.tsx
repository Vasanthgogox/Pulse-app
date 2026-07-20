/**
 * RiskMeter — circular 0..100 score ring for party analytics gauges.
 */

import { memo, useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import Svg, { Circle } from "react-native-svg";

import { Theme } from "@/constants/Theme";

import type { ScoreLevel } from "@/features/analytics/types/analytics.types";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const LEVEL_COLORS: Record<ScoreLevel, string> = {
  excellent: Theme.scoreExcellentFg,
  good: Theme.scoreGoodFg,
  warning: Theme.scoreWarningFg,
  critical: Theme.scoreCriticalFg,
  unknown: Theme.textMuted,
};

export interface RiskMeterProps {
  /** 0..100. Values outside are clamped. */
  value: number;
  /** Drives the ring color. */
  level: ScoreLevel;
  /** Total ring size. */
  size?: number;
  /** Ring stroke width. */
  stroke?: number;
  /** Label rendered under the value (e.g. "Payment risk"). */
  label?: string;
  /** Caption rendered under the label (e.g. "avg 14 days delay"). */
  caption?: string;
  /** Override colour — useful when wiring `Theme.chartSeriesN` directly. */
  colorOverride?: string;
  /** Override style. */
  containerStyle?: ViewStyle;
}

export const RiskMeter = memo(function RiskMeter({
  value,
  level,
  size = 140,
  stroke = 12,
  label,
  caption,
  colorOverride,
  containerStyle,
}: RiskMeterProps) {
  const ringAnim = useRef(new Animated.Value(0)).current;
  const clamped = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  const color = colorOverride ?? LEVEL_COLORS[level];
  const [displayValue, setDisplayValue] = useState(0);

  // Padding on each side so strokeLinecap="round" caps never clip at the SVG edge.
  const padding = Math.ceil(stroke / 2);
  const svgSize = size + padding * 2;
  const cx = svgSize / 2;
  const cy = svgSize / 2;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const progressOffset = circumference * (1 - clamped / 100);

  useEffect(() => {
    const counter = new Animated.Value(0);
    const id = counter.addListener(({ value: v }) => {
      setDisplayValue(Math.round(v));
    });
    Animated.timing(counter, {
      toValue: clamped,
      duration: 900,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
    return () => {
      counter.removeListener(id);
    };
  }, [clamped]);

  useEffect(() => {
    ringAnim.setValue(0);
    Animated.timing(ringAnim, {
      toValue: 1,
      duration: 850,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [clamped, ringAnim]);

  const animatedDashOffset = ringAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [circumference, progressOffset],
  });

  return (
    <View style={[styles.container, containerStyle]}>
      {/* ringWrap stays at size×size so callers see consistent layout */}
      <View style={[styles.ringWrap, { width: size, height: size }]}>
        {/* SVG is padded so rounded stroke caps can't clip at the boundary */}
        <Svg
          width={svgSize}
          height={svgSize}
          style={[styles.svgAbsolute, { marginLeft: -padding, marginTop: -padding }]}
        >
          <Circle
            cx={cx}
            cy={cy}
            r={radius}
            stroke={Theme.surface}
            strokeWidth={stroke}
            fill="none"
          />
          <AnimatedCircle
            cx={cx}
            cy={cy}
            r={radius}
            stroke={color}
            strokeWidth={stroke}
            fill="none"
            strokeDasharray={`${circumference}`}
            strokeDashoffset={animatedDashOffset}
            strokeLinecap="round"
            rotation="-90"
            origin={`${cx}, ${cy}`}
          />
        </Svg>
        <View
          style={[styles.centerOverlay, { width: size, height: size }]}
          pointerEvents="none"
        >
          <View style={styles.centerRow}>
            <Text
              style={[
                styles.value,
                { color: Theme.textPrimaryDark, fontSize: Math.round(size * 0.26) },
              ]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {displayValue}
            </Text>
            <Text
              style={[styles.scale, { fontSize: Math.max(10, Math.round(size * 0.08)) }]}
            >
              / 100
            </Text>
          </View>
        </View>
      </View>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      {caption ? (
        <Text style={styles.caption} numberOfLines={2}>
          {caption}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    width: "100%",
  },
  ringWrap: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
  },
  svgAbsolute: {
    position: "absolute",
  },
  centerOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  centerRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "center",
    gap: 2,
    maxWidth: "100%",
    paddingHorizontal: 4,
  },
  value: {
    fontWeight: "900",
    fontStyle: "italic",
    letterSpacing: -1,
    color: Theme.textPrimaryDark,
  },
  scale: {
    fontWeight: "700",
    color: Theme.textMuted,
    marginTop: 0,
  },
  label: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: Theme.textBody,
    textAlign: "center",
  },
  caption: {
    fontSize: 9,
    fontWeight: "600",
    color: Theme.textMuted,
    textAlign: "center",
    maxWidth: 220,
    lineHeight: 13,
  },
});
