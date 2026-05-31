import type { PartyEntityAccent } from "@/lib/partyEntityAccent";
import { useEffect, type ReactNode } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

export type PartyEntityAvatarGlowProps = {
  accent: PartyEntityAccent;
  /** Inner avatar diameter (image). */
  size: number;
  children: ReactNode;
  style?: ViewStyle;
};

/**
 * Role-colored ring + soft pulsing glow (connections grid / party tiles).
 */
export function PartyEntityAvatarGlow({
  accent,
  size,
  children,
  style,
}: PartyEntityAvatarGlowProps) {
  const ringSize = size + 3;
  const outer = ringSize + 7;
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
  }, [pulse]);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pulse.value, [0, 1], [0.38, 0.82]),
    transform: [
      {
        scale: interpolate(pulse.value, [0, 1], [1.01, 1.05]),
      },
    ],
  }));

  const haloStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pulse.value, [0, 1], [0.22, 0.48]),
    transform: [
      {
        scale: interpolate(pulse.value, [0, 1], [1, 1.03]),
      },
    ],
  }));

  return (
    <View style={[styles.wrap, { width: outer, height: outer }, style]}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.glowOuter,
          {
            width: ringSize + 6,
            height: ringSize + 6,
            borderRadius: (ringSize + 6) / 2,
            backgroundColor: accent.glow,
          },
          glowStyle,
        ]}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.glowInner,
          {
            width: ringSize + 3,
            height: ringSize + 3,
            borderRadius: (ringSize + 3) / 2,
            backgroundColor: accent.glowCore,
          },
          haloStyle,
        ]}
      />
      <View
        style={[
          styles.ring,
          {
            width: ringSize,
            height: ringSize,
            borderRadius: ringSize / 2,
            borderColor: accent.ring,
          },
        ]}
      >
        <View
          style={[
            styles.avatarClip,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
            },
          ]}
        >
          {children}
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
  glowOuter: {
    position: "absolute",
  },
  glowInner: {
    position: "absolute",
  },
  ring: {
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  avatarClip: {
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
});
