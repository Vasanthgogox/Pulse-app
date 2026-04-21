/**
 * Liquid-fill pill: fill level driven by percentage with animated "wave" surface.
 * Text flips dark/white at ~45% fill for readability (no mix-blend-mode).
 */
import Theme from "@/constants/Theme";
import React, { useEffect } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

/** Match reference: wave top at surface, 300px waves, 4% back offset */
const PILL_HEIGHT = 68;
const PILL_WIDTH = 110;
const WAVE_SIZE = 300;
const FILL_DURATION_MS = 1000;
const BACK_WAVE_OFFSET_PERCENT = 0.04; // wave-back sits 4% above wave-front (reference: - 4%)
const WAVE_CENTER_X = PILL_WIDTH / 2;
/** One full rotation (360°) — three layers at different speeds for 3D depth */
const WAVE_SPIN_FRONT_MS = 8000;
const WAVE_SPIN_MIDDLE_MS = 9500;
const WAVE_SPIN_BACK_MS = 11000;
/** Flip text to white when fill is above this (0–100) for readability over colored liquid */
const TEXT_COLOR_FLIP_THRESHOLD = 45;

function getLiquidPalette(clampedPercentage: number): {
  back: string;
  middle: string;
  front: string;
  glow: string;
} {
  // Theme-aligned: avoid neon HSL generation; use semantic tokens.
  // Thresholds are intentionally simple and stable for consistent UI.
  if (clampedPercentage < 40) {
    return {
      back: Theme.liquidBadBack,
      middle: Theme.liquidBadMiddle,
      front: Theme.liquidBadFront,
      glow: Theme.liquidBadFront,
    };
  }
  if (clampedPercentage < 70) {
    return {
      back: Theme.liquidWarnBack,
      middle: Theme.liquidWarnMiddle,
      front: Theme.liquidWarnFront,
      glow: Theme.liquidWarnFront,
    };
  }
  return {
    back: Theme.liquidGoodBack,
    middle: Theme.liquidGoodMiddle,
    front: Theme.liquidGoodFront,
    glow: Theme.liquidGoodFront,
  };
}

export type LiquidFillPillProps = {
  /** 0–100; fill level (clamped). Use displayValue for text when different (e.g. negative margin). */
  percentage: number;
  /** Label above the value (e.g. "COLLECTION", "MARGIN") */
  label: string;
  /** Optional prefix for value (e.g. "+" for positive margin) */
  valuePrefix?: string;
  /** Optional suffix (default "%") */
  valueSuffix?: string;
  /** When set, shown as the value text; fill still uses clamped percentage */
  displayValue?: number;
};

export function LiquidFillPill({
  percentage,
  label,
  valuePrefix = "",
  valueSuffix = "%",
  displayValue,
}: LiquidFillPillProps) {
  const clamped = Math.min(100, Math.max(0, percentage));
  const textValue =
    displayValue !== undefined ? Math.round(displayValue) : Math.round(clamped);
  const rotation1 = useSharedValue(0);
  const rotation2 = useSharedValue(0);
  const rotation3 = useSharedValue(0);
  const initialTop = PILL_HEIGHT * (1 - clamped / 100);
  const waveFrontTop = useSharedValue(initialTop);
  const waveMiddleTop = useSharedValue(
    initialTop - PILL_HEIGHT * (BACK_WAVE_OFFSET_PERCENT * 0.5),
  );
  const waveBackTop = useSharedValue(
    initialTop - PILL_HEIGHT * BACK_WAVE_OFFSET_PERCENT,
  );

  useEffect(() => {
    const nextFrontTop = PILL_HEIGHT * (1 - clamped / 100);
    waveFrontTop.value = withTiming(nextFrontTop, {
      duration: FILL_DURATION_MS,
      easing: Easing.bezier(0.4, 0, 0.2, 1),
    });
    waveMiddleTop.value = withTiming(
      nextFrontTop - PILL_HEIGHT * (BACK_WAVE_OFFSET_PERCENT * 0.5),
      {
        duration: FILL_DURATION_MS,
        easing: Easing.bezier(0.4, 0, 0.2, 1),
      },
    );
    waveBackTop.value = withTiming(
      nextFrontTop - PILL_HEIGHT * BACK_WAVE_OFFSET_PERCENT,
      {
        duration: FILL_DURATION_MS,
        easing: Easing.bezier(0.4, 0, 0.2, 1),
      },
    );
  }, [clamped, waveFrontTop, waveMiddleTop, waveBackTop]);

  useEffect(() => {
    rotation1.value = withRepeat(
      withTiming(360, { duration: WAVE_SPIN_FRONT_MS, easing: Easing.linear }),
      -1,
    );
    rotation2.value = withRepeat(
      withTiming(360, { duration: WAVE_SPIN_MIDDLE_MS, easing: Easing.linear }),
      -1,
    );
    rotation3.value = withRepeat(
      withTiming(360, { duration: WAVE_SPIN_BACK_MS, easing: Easing.linear }),
      -1,
    );
  }, [rotation1, rotation2, rotation3]);

  const waveBackStyle = useAnimatedStyle(() => ({
    top: waveBackTop.value,
    transform: [
      { translateX: -WAVE_SIZE / 2 },
      { rotate: `${rotation3.value}deg` },
    ],
  }));

  const waveMiddleStyle = useAnimatedStyle(() => ({
    top: waveMiddleTop.value,
    transform: [
      { translateX: -WAVE_SIZE / 2 },
      { rotate: `${rotation2.value}deg` },
    ],
  }));

  const waveFrontStyle = useAnimatedStyle(() => ({
    top: waveFrontTop.value,
    transform: [
      { translateX: -WAVE_SIZE / 2 },
      { rotate: `${rotation1.value}deg` },
    ],
  }));

  const palette = getLiquidPalette(clamped);
  const glowColor = palette.glow;
  const textOnLiquid = clamped > TEXT_COLOR_FLIP_THRESHOLD;
  const textColor = textOnLiquid ? Theme.textOnPrimary : Theme.primaryText;

  return (
    <View
      style={[
        styles.pill,
        {
          shadowColor: glowColor,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.35,
          shadowRadius: 8,
          elevation: 4,
          pointerEvents: 'none',
        },
      ]}
    >
      <Animated.View
        style={[
          styles.wave,
          styles.waveBack,
          { backgroundColor: palette.back },
          waveBackStyle,
        ]}
      />
      <Animated.View
        style={[
          styles.wave,
          styles.waveMiddle,
          { backgroundColor: palette.middle },
          waveMiddleStyle,
        ]}
      />
      <Animated.View
        style={[
          styles.wave,
          styles.waveFront,
          { backgroundColor: palette.front },
          waveFrontStyle,
        ]}
      />
      <View style={styles.textWrap}>
        <Text
          style={[
            styles.label,
            { color: textColor },
            textOnLiquid && styles.valueOnLiquidShadow,
          ]}
          numberOfLines={1}
        >
          {label}
        </Text>
        <Text
          style={[
            styles.value,
            { color: textColor },
            textOnLiquid && styles.valueOnLiquidShadow,
          ]}
          numberOfLines={1}
        >
          {valuePrefix}
          {textValue}
          {valueSuffix}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    width: PILL_WIDTH,
    height: PILL_HEIGHT,
    flexShrink: 0,
    borderRadius: PILL_HEIGHT / 2,
    backgroundColor: Theme.liquidPillBg,
    borderWidth: 1,
    borderColor: Theme.liquidPillBorder,
    overflow: "hidden",
    // Base shadow overridden by dynamic glow (shadowColor/Radius/Opacity) per fill level
  },
  wave: {
    position: "absolute",
    width: WAVE_SIZE,
    height: WAVE_SIZE,
    left: WAVE_CENTER_X,
    borderRadius: WAVE_SIZE * 0.45,
  },
  waveBack: { zIndex: 1 },
  waveMiddle: { borderRadius: WAVE_SIZE * 0.42, zIndex: 2, opacity: 0.92 },
  waveFront: { borderRadius: WAVE_SIZE * 0.4, zIndex: 3 },
  textWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  label: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.primaryText,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 2,
    opacity: 0.9,
  },
  value: {
    fontSize: 20,
    fontWeight: "700",
    color: Theme.primaryText,
  },
  valueOnLiquidShadow: {
    ...Platform.select({
      web: { textShadow: "0px 1px 3px rgba(0,0,0,0.55)" },
      default: {
        textShadowColor: "rgba(0,0,0,0.55)",
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 3,
      },
    }),
  },
});
