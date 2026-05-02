import { useEffect } from "react";
import {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useDemoTabBarVisibilityProgressOptional } from "@/contexts/DemoTabBarScrollContext";

/**
 * Same motion as the floating chat FAB: scroll/tab-bar visibility fade + scale,
 * plus a subtle idle breathe and matching inner-ring opacity pulse.
 */
export function useGlobalFabAnimation() {
  const fallbackVisibilityProgress = useSharedValue(1);
  const visibilityProgress =
    useDemoTabBarVisibilityProgressOptional() ?? fallbackVisibilityProgress;
  const idlePulse = useSharedValue(0);

  useEffect(() => {
    idlePulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 1500, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    );
  }, [idlePulse]);

  const shellStyle = useAnimatedStyle(() => ({
    opacity: visibilityProgress.value,
    transform: [
      {
        scale:
          (0.92 + visibilityProgress.value * 0.08) *
          (0.985 + idlePulse.value * 0.015),
      },
    ],
  }));

  const ringStyle = useAnimatedStyle(() => ({
    opacity: 0.14 + idlePulse.value * 0.14,
  }));

  return { shellStyle, ringStyle };
}
