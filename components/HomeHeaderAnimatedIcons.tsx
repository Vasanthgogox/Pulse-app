/**
 * Home header — colourful layered SVG icons with float / swing motion (3D-style).
 */
import LottieView from "lottie-react-native";
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
  Stop,
} from "react-native-svg";

const VIEW = 32;
const NOTIFICATION_LOTTIE = require("@/assets/Animated folder/notification.json");
const INVITATIONS_LOTTIE = require("@/assets/Animated folder/email-notification.json");

export type HomeHeaderIconProps = {
  size?: number;
  /** Compensates for extra transparent padding inside a Lottie asset. */
  glyphScale?: number;
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

function HeaderLottieIcon({
  source,
  size = 40,
  glyphScale = 1.08,
  active = false,
}: {
  source: object;
  size?: number;
  glyphScale?: number;
  active?: boolean;
}) {
  const lottieSize = Math.round(size * glyphScale);

  return (
    <View style={[styles.lottieSlot, { width: lottieSize, height: lottieSize }]}>
      <LottieView
        source={source}
        autoPlay
        loop
        speed={active ? 1.2 : 1}
        resizeMode="contain"
        style={{ width: lottieSize, height: lottieSize }}
      />
    </View>
  );
}

export function AnimatedInboxHeaderIcon({
  size = 40,
  glyphScale = 1.28,
  active = false,
}: HomeHeaderIconProps) {
  return (
    <HeaderLottieIcon
      source={INVITATIONS_LOTTIE}
      size={size}
      glyphScale={glyphScale}
      active={active}
    />
  );
}

export function AnimatedBellHeaderIcon({
  size = 40,
  glyphScale = 1.08,
  active = false,
}: HomeHeaderIconProps) {
  return (
    <HeaderLottieIcon
      source={NOTIFICATION_LOTTIE}
      size={size}
      glyphScale={glyphScale}
      active={active}
    />
  );
}

function ChatSvg({
  size,
  active,
  gid,
}: {
  size: number;
  active: boolean;
  gid: string;
}) {
  const deep = active ? "#047857" : "#0f766e";
  const mid = active ? "#10b981" : "#14b8a6";
  const light = active ? "#6ee7b7" : "#5eead4";
  const rim = active ? "#34d399" : "#2dd4bf";

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${VIEW} ${VIEW}`}>
      <Defs>
        <LinearGradient id={`${gid}-shadow`} x1="0%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0%" stopColor="#0f766e" stopOpacity="0" />
          <Stop offset="100%" stopColor="#0f766e" stopOpacity="0.35" />
        </LinearGradient>
        <LinearGradient id={`${gid}-body`} x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor={light} />
          <Stop offset="45%" stopColor={mid} />
          <Stop offset="100%" stopColor={deep} />
        </LinearGradient>
      </Defs>
      <Ellipse cx={16} cy={27.5} rx={9} ry={1.8} fill={`url(#${gid}-shadow)`} />
      <Path
        d="M7.5 8.5h17a3 3 0 0 1 3 3v7.4a3 3 0 0 1-3 3h-8.7l-4.9 3.4a.6.6 0 0 1-.95-.49v-2.91H7.5a3 3 0 0 1-3-3v-7.4a3 3 0 0 1 3-3z"
        fill={`url(#${gid}-body)`}
      />
      <Path
        d="M7.5 8.5h17a3 3 0 0 1 3 3v7.4a3 3 0 0 1-3 3h-8.7l-4.9 3.4a.6.6 0 0 1-.95-.49v-2.91H7.5a3 3 0 0 1-3-3v-7.4a3 3 0 0 1 3-3z"
        fill="none"
        stroke={rim}
        strokeWidth={0.6}
        opacity={0.55}
      />
      <Circle cx={12} cy={15.2} r={1.35} fill="#ffffff" opacity={0.92} />
      <Circle cx={16} cy={15.2} r={1.35} fill="#ffffff" opacity={0.92} />
      <Circle cx={20} cy={15.2} r={1.35} fill="#ffffff" opacity={0.92} />
      <Ellipse cx={11.5} cy={10.8} rx={4.5} ry={1.5} fill="#ffffff" opacity={0.55} />
    </Svg>
  );
}

export function AnimatedChatHeaderIcon({
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
          <ChatSvg size={size} active={active} gid={gid} />
        </Animated.View>
      </MotiView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
  },
  lottieSlot: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
  },
});
