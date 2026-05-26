/**
 * RiskMeter — semi-circular gauge for 0..100 scores.
 * ============================================================================
 *
 * Used by `<PaymentBehaviorPanel>` (client analytics) and any other
 * surface that needs to show a single risk / score reading at-a-glance.
 *
 * Built on `react-native-svg`, animated via `useNativeDriver: false`
 * (svg path animation requires the JS thread). Animation pattern mirrors
 * the existing `UtilizationRing` in
 * `features/vehicles/components/analytics/AnalyticsChart.tsx`.
 */

import { memo, useEffect, useMemo, useRef } from "react";
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import Svg, { Circle, G } from "react-native-svg";

import { Theme } from "@/constants/Theme";

import type { ScoreLevel } from "@/features/analytics";

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
  /** Drives the arc color. */
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
  const anim = useRef(new Animated.Value(0)).current;
  const clamped = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  const color = colorOverride ?? LEVEL_COLORS[level];

  // Three-quarter ring (270°) — feels more "gauge-like" than a full circle.
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  // We hide one quadrant via a dash pattern: 3/4 visible, 1/4 hidden.
  const visibleArc = circumference * 0.75;
  const hiddenArc = circumference * 0.25;

  useEffect(() => {
    anim.setValue(0);
    Animated.timing(anim, {
      toValue: clamped / 100,
      duration: 850,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [clamped, anim]);

  const animatedDashOffset = useMemo(
    () =>
      anim.interpolate({
        inputRange: [0, 1],
        outputRange: [visibleArc, 0],
      }),
    [anim, visibleArc],
  );

  return (
    <View style={[styles.container, containerStyle]}>
      <View style={{ width: size, height: size * 0.78 }}>
        <Svg width={size} height={size}>
          <G rotation={135} origin={`${size / 2}, ${size / 2}`}>
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={Theme.surface}
              strokeWidth={stroke}
              fill="none"
              strokeDasharray={`${visibleArc} ${hiddenArc}`}
              strokeLinecap="round"
            />
            <AnimatedCircle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={color}
              strokeWidth={stroke}
              fill="none"
              strokeDasharray={`${visibleArc} ${hiddenArc}`}
              strokeDashoffset={animatedDashOffset}
              strokeLinecap="round"
            />
          </G>
        </Svg>
        <View
          style={[
            styles.centerOverlay,
            { width: size, height: size * 0.78 },
          ]}
          pointerEvents="none"
        >
          <Text
            style={[styles.value, { color }]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {Math.round(clamped)}
          </Text>
          <Text style={styles.scale}>/ 100</Text>
        </View>
      </View>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      {caption ? <Text style={styles.caption}>{caption}</Text> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    gap: 4,
    paddingVertical: 8,
  },
  centerOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  value: {
    fontSize: 36,
    fontWeight: "900",
    fontStyle: "italic",
    letterSpacing: -1,
  },
  scale: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textMuted,
    marginTop: -2,
  },
  label: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: Theme.textBody,
    marginTop: 2,
  },
  caption: {
    fontSize: 11,
    color: Theme.textMuted,
    textAlign: "center",
    maxWidth: 200,
  },
});
