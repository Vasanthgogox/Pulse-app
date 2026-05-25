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

  const shellStyle = useAnimatedStyle(() => {
    const p = visibilityProgress.value;
    return {
      opacity: p * (0.88 + idlePulse.value * 0.04),
      transform: [
        {
          translateY: (1 - p) * 18,
        },
        {
          scale:
            (0.9 + p * 0.1) * (0.985 + idlePulse.value * 0.015),
        },
      ],
    };
  });

  const ringStyle = useAnimatedStyle(() => ({
    opacity: 0.14 + idlePulse.value * 0.14,
  }));

  return { shellStyle, ringStyle };
}
