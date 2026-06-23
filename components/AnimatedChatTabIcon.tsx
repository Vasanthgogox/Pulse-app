/**
 * Footer Chat tab — layered SVG bubble with float + typing-dot motion (3D-style, no Lottie).
 */
import Theme from "@/constants/Theme";
import { MotiView } from "moti";
import { useEffect } from "react";
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
  Defs,
  Ellipse,
  LinearGradient,
  Path,
  Stop,
} from "react-native-svg";

const VIEW = 32;

export type AnimatedChatTabIconProps = {
  active?: boolean;
  size?: number;
};

function ChatBubbleSvg({
  size,
  active,
}: {
  size: number;
  active: boolean;
}) {
  /* Active chat tab sits on pastel blue chip — ink bubble reads on light fill. */
  const accent = active ? Theme.brandBlueInk : Theme.pulseIndigo;
  const accentDeep = active ? Theme.loadAddButtonBorder : Theme.actionAccentBorder;
  const highlight = active ? Theme.brandBlueSoft : "#B9E2F5";
  const face = active ? "#FFFFFF" : Theme.brandBlueSoft;

  return (
    <Svg
      width={size}
      height={size}
      viewBox={`0 0 ${VIEW} ${VIEW}`}
      preserveAspectRatio="xMidYMid meet"
    >
      <Defs>
        <LinearGradient id="chatTabShadow" x1="0%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0%" stopColor={accentDeep} stopOpacity="0" />
          <Stop offset="100%" stopColor={accentDeep} stopOpacity="0.35" />
        </LinearGradient>
        <LinearGradient id="chatTabBody" x1="12%" y1="8%" x2="88%" y2="92%">
          <Stop offset="0%" stopColor={highlight} />
          <Stop offset="45%" stopColor={accent} />
          <Stop offset="100%" stopColor={accentDeep} />
        </LinearGradient>
        <LinearGradient id="chatTabFace" x1="0%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0%" stopColor="#ffffff" />
          <Stop offset="100%" stopColor={face} />
        </LinearGradient>
      </Defs>

      <Ellipse cx={16} cy={27} rx={9} ry={2.2} fill="url(#chatTabShadow)" />

      <Path
        d="M7 8.5h18a4.5 4.5 0 0 1 4.5 4.5v7.5a4.5 4.5 0 0 1-4.5 4.5H13.2L8.2 26.5 9.8 20.5H7a4.5 4.5 0 0 1-4.5-4.5V13a4.5 4.5 0 0 1 4.5-4.5z"
        fill="url(#chatTabBody)"
      />

      <Path
        d="M9.2 11.2h13.6a2.8 2.8 0 0 1 2.8 2.8v5.4a2.8 2.8 0 0 1-2.8 2.8H14.1l-3.4 4.2 1.1-4.2H9.2a2.8 2.8 0 0 1-2.8-2.8v-5.4a2.8 2.8 0 0 1 2.8-2.8z"
        fill="url(#chatTabFace)"
      />

      <Ellipse cx={12.5} cy={12.8} rx={2.8} ry={1.4} fill="#ffffff" opacity={0.55} />
    </Svg>
  );
}

function TypingDot({
  delayMs,
  color,
  size,
}: {
  delayMs: number;
  color: string;
  size: number;
}) {
  return (
    <MotiView
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
      }}
      from={{ translateY: 0, opacity: 0.3, scale: 0.8 }}
      animate={{ translateY: -2, opacity: 1, scale: 1 }}
      transition={{
        type: "timing",
        duration: 500,
        loop: true,
        delay: delayMs,
      }}
    />
  );
}

export function AnimatedChatTabIcon({
  active = false,
  size = 22,
}: AnimatedChatTabIconProps) {
  const tilt = useSharedValue(0);

  useEffect(() => {
    tilt.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.sin) }),
        withTiming(-1, { duration: 2200, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      true,
    );
  }, [tilt]);

  const tiltStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 120 },
      { rotateY: `${tilt.value * 6}deg` },
      { rotateX: `${tilt.value * -4}deg` },
    ],
  }));

  const dotColor = active ? Theme.primary : "#64748b";
  const dotSize = Math.max(2.5, size * 0.14);

  return (
    <View style={[styles.wrap, { width: size + 4, height: size + 4 }]}>
      {active ? (
        <MotiView
          style={[
            styles.glow,
            {
              width: size + 8,
              height: size + 8,
              borderRadius: (size + 8) / 2,
            },
          ]}
          from={{ opacity: 0.2, scale: 0.9 }}
          animate={{ opacity: 0.5, scale: 1.06 }}
          transition={{
            type: "timing",
            duration: 1400,
            loop: true,
          }}
        />
      ) : null}

      <MotiView
        from={{ translateY: 0 }}
        animate={{ translateY: -1.5 }}
        transition={{
          type: "timing",
          duration: 1800,
          loop: true,
        }}
      >
        <Animated.View style={tiltStyle}>
          <ChatBubbleSvg size={size} active={active} />
        </Animated.View>
      </MotiView>

      <View
        style={[
          styles.dotsOverlay,
          {
            width: size,
            height: size,
            top: size * 0.48,
          },
        ]}
        pointerEvents="none"
      >
        <View style={styles.dotsRow}>
          <TypingDot delayMs={0} color={dotColor} size={dotSize} />
          <TypingDot delayMs={160} color={dotColor} size={dotSize} />
          <TypingDot delayMs={320} color={dotColor} size={dotSize} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  glow: {
    position: "absolute",
    backgroundColor: Theme.pulseIndigoWash,
  },
  dotsOverlay: {
    position: "absolute",
    left: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  dotsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
});
