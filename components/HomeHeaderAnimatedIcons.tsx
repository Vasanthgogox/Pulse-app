/**
 * Home header — colourful layered SVG icons with float / swing motion (3D-style).
 */
import { MotiView } from "moti";
import { useEffect, useId } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import Svg, {
  Circle,
  Defs,
  Ellipse,
  LinearGradient,
  Path,
  Rect,
  Stop,
} from "react-native-svg";

const VIEW = 32;

export type HomeHeaderIconProps = {
  size?: number;
  /** Brighter palette + pulse when there are pending items. */
  active?: boolean;
};

function useFloatTilt(active: boolean) {
  const tilt = useSharedValue(0);
  useEffect(() => {
    tilt.value = withRepeat(
      withSequence(
        withTiming(1, {
          duration: active ? 1400 : 2200,
          easing: Easing.inOut(Easing.sin),
        }),
        withTiming(-1, {
          duration: active ? 1400 : 2200,
          easing: Easing.inOut(Easing.sin),
        }),
      ),
      -1,
      true,
    );
  }, [active, tilt]);
  return useAnimatedStyle(() => ({
    transform: [
      { rotateZ: `${tilt.value * 4}deg` },
      { translateY: tilt.value * -1 },
    ],
  }));
}

function useBellSwing(active: boolean) {
  const swing = useSharedValue(0);
  useEffect(() => {
    swing.value = withRepeat(
      withSequence(
        withTiming(1, { duration: active ? 110 : 260, easing: Easing.out(Easing.quad) }),
        withTiming(-1, { duration: active ? 110 : 260, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: active ? 70 : 180, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    );
  }, [active, swing]);
  return useAnimatedStyle(() => ({
    transform: [
      { rotate: `${swing.value * (active ? 12 : 8)}deg` },
      { translateY: swing.value * -0.5 },
    ],
  }));
}

function InboxSvg({
  size,
  active,
  gid,
}: {
  size: number;
  active: boolean;
  gid: string;
}) {
  const deep = active ? "#3730a3" : "#4f46e5";
  const mid = active ? "#6366f1" : "#818cf8";
  const light = active ? "#c7d2fe" : "#a5b4fc";
  const accent = active ? "#22d3ee" : "#38bdf8";

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${VIEW} ${VIEW}`}>
      <Defs>
        <LinearGradient id={`${gid}-shadow`} x1="0%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0%" stopColor="#4338ca" stopOpacity="0" />
          <Stop offset="100%" stopColor="#4338ca" stopOpacity="0.35" />
        </LinearGradient>
        <LinearGradient id={`${gid}-tray`} x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor={light} />
          <Stop offset="45%" stopColor={mid} />
          <Stop offset="100%" stopColor={deep} />
        </LinearGradient>
        <LinearGradient id={`${gid}-paper`} x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor="#ffffff" />
          <Stop offset="100%" stopColor="#e0e7ff" />
        </LinearGradient>
      </Defs>
      <Ellipse cx={16} cy={27} rx={10} ry={2} fill={`url(#${gid}-shadow)`} />
      <Path
        d="M5 14h22l-2.5 9.5a2 2 0 0 1-1.95 1.5H9.45a2 2 0 0 1-1.95-1.5L5 14z"
        fill={`url(#${gid}-tray)`}
      />
      <Path
        d="M7.5 12.5h17l-1.8 7.2a1.4 1.4 0 0 1-1.36 1.1H10.66a1.4 1.4 0 0 1-1.36-1.1L7.5 12.5z"
        fill={mid}
        opacity={0.9}
      />
      <Rect x={9} y={7} width={14} height={9} rx={1.5} fill={`url(#${gid}-paper)`} />
      <Path
        d="M11 9.5h10M11 12h7"
        stroke={deep}
        strokeWidth={1.1}
        strokeLinecap="round"
        opacity={0.45}
      />
      <Circle cx={20} cy={9} r={1.8} fill={accent} />
      <Ellipse cx={12} cy={8.5} rx={3.5} ry={1.4} fill="#ffffff" opacity={0.65} />
    </Svg>
  );
}

function BellSvg({
  size,
  active,
  gid,
}: {
  size: number;
  active: boolean;
  gid: string;
}) {
  const deep = active ? "#c2410c" : "#d97706";
  const mid = active ? "#f59e0b" : "#fbbf24";
  const light = active ? "#fde68a" : "#fef08a";
  const rim = active ? "#fb923c" : "#fcd34d";

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${VIEW} ${VIEW}`}>
      <Defs>
        <LinearGradient id={`${gid}-shadow`} x1="0%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0%" stopColor="#b45309" stopOpacity="0" />
          <Stop offset="100%" stopColor="#b45309" stopOpacity="0.35" />
        </LinearGradient>
        <LinearGradient id={`${gid}-body`} x1="15%" y1="0%" x2="85%" y2="100%">
          <Stop offset="0%" stopColor={light} />
          <Stop offset="40%" stopColor={mid} />
          <Stop offset="100%" stopColor={deep} />
        </LinearGradient>
      </Defs>
      <Ellipse cx={16} cy={28} rx={8} ry={2} fill={`url(#${gid}-shadow)`} />
      <Path
        d="M16 4.5a7.5 7.5 0 0 1 7.5 7.5v5.2c0 .9.3 1.7.9 2.3l.8.9H7.8l.8-.9c.6-.6.9-1.4.9-2.3V12a7.5 7.5 0 0 1 7.5-7.5z"
        fill={`url(#${gid}-body)`}
      />
      <Path
        d="M16 4.5a7.5 7.5 0 0 1 7.5 7.5v5.2c0 .9.3 1.7.9 2.3l.8.9H7.8l.8-.9c.6-.6.9-1.4.9-2.3V12a7.5 7.5 0 0 1 7.5-7.5z"
        fill="none"
        stroke={rim}
        strokeWidth={0.6}
        opacity={0.55}
      />
      <Rect x={11} y={22.5} width={10} height={2.2} rx={1.1} fill={deep} />
      <Circle cx={16} cy={25.5} r={2.2} fill={deep} />
      <Ellipse cx={13} cy={9} rx={4.5} ry={2.2} fill="#ffffff" opacity={0.55} />
    </Svg>
  );
}

export function AnimatedInboxHeaderIcon({
  size = 20,
  active = false,
}: HomeHeaderIconProps) {
  const gid = useId().replace(/:/g, "");
  const tiltStyle = useFloatTilt(active);

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <MotiView
        from={{ translateY: 0 }}
        animate={{ translateY: -1.5 }}
        transition={{ type: "timing", duration: 2000, loop: true }}
      >
        <Animated.View style={tiltStyle}>
          <InboxSvg size={size} active={active} gid={gid} />
        </Animated.View>
      </MotiView>
    </View>
  );
}

export function AnimatedBellHeaderIcon({
  size = 20,
  active = false,
}: HomeHeaderIconProps) {
  const gid = useId().replace(/:/g, "");
  const swingStyle = useBellSwing(active);

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <Animated.View style={swingStyle}>
        <BellSvg size={size} active={active} gid={gid} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
  },
});
