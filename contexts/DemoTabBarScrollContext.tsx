/**
 * Scroll-driven visibility for the demo tab bar (hide while scrolling, show after idle).
 * Web uses debounced onScroll; native uses drag / momentum end events.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { Platform } from "react-native";
import Animated, {
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

const HIDE_MS = 200;
const SHOW_MS = 240;
const WEB_IDLE_MS = 380;
const SHOW_DELAY_MS = 320;

type ScrollControls = {
  onScrollBeginDrag: () => void;
  onScrollEnd: () => void;
  onMomentumScrollEnd: () => void;
  resetBarVisible: () => void;
};

const ScrollCtx = createContext<ScrollControls | null>(null);
const ProgressCtx = createContext<{ progress: SharedValue<number> } | null>(
  null,
);

export function DemoTabBarScrollProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const progress = useSharedValue(1);
  const scrollEndTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const clearSchedule = useCallback(() => {
    if (scrollEndTimeoutRef.current) {
      clearTimeout(scrollEndTimeoutRef.current);
      scrollEndTimeoutRef.current = null;
    }
  }, []);

  const onScrollBeginDrag = useCallback(() => {
    clearSchedule();
    progress.value = withTiming(0, { duration: HIDE_MS });
  }, [clearSchedule, progress]);

  const scheduleShow = useCallback(() => {
    clearSchedule();
    scrollEndTimeoutRef.current = setTimeout(() => {
      progress.value = withTiming(1, { duration: SHOW_MS });
      scrollEndTimeoutRef.current = null;
    }, SHOW_DELAY_MS);
  }, [clearSchedule, progress]);

  const onScrollEnd = useCallback(() => {
    scheduleShow();
  }, [scheduleShow]);

  const onMomentumScrollEnd = useCallback(() => {
    scheduleShow();
  }, [scheduleShow]);

  const resetBarVisible = useCallback(() => {
    clearSchedule();
    progress.value = withTiming(1, { duration: SHOW_MS });
  }, [clearSchedule, progress]);

  useEffect(() => () => clearSchedule(), [clearSchedule]);

  const scrollValue = useMemo(
    () => ({
      onScrollBeginDrag,
      onScrollEnd,
      onMomentumScrollEnd,
      resetBarVisible,
    }),
    [
      onScrollBeginDrag,
      onScrollEnd,
      onMomentumScrollEnd,
      resetBarVisible,
    ],
  );

  return (
    <ProgressCtx.Provider value={{ progress }}>
      <ScrollCtx.Provider value={scrollValue}>{children}</ScrollCtx.Provider>
    </ProgressCtx.Provider>
  );
}

export function useDemoTabBarScroll(): ScrollControls {
  const v = useContext(ScrollCtx);
  if (!v) {
    throw new Error("useDemoTabBarScroll requires DemoTabBarScrollProvider");
  }
  return v;
}

export function useDemoTabBarScrollOptional(): ScrollControls | null {
  return useContext(ScrollCtx);
}

const OFF_TRANSLATE = 120;

export function DemoTabBarAutoHideShell({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: object;
}) {
  const ctx = useContext(ProgressCtx);
  if (!ctx) return <>{children}</>;
  const { progress } = ctx;
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: (1 - progress.value) * OFF_TRANSLATE },
    ],
  }));
  return (
    <Animated.View style={[style, animatedStyle]} pointerEvents="box-none">
      {children}
    </Animated.View>
  );
}

/** Merge into primary vertical ScrollViews so the tab bar hides during scroll. */
export function useTabBarAwareScrollProps(): {
  onScrollBeginDrag?: () => void;
  onScrollEndDrag?: () => void;
  onMomentumScrollEnd?: () => void;
  onScroll?: () => void;
  scrollEventThrottle?: number;
} {
  const ctx = useDemoTabBarScrollOptional();
  const webIdleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (webIdleRef.current) clearTimeout(webIdleRef.current);
    },
    [],
  );

  return useMemo(() => {
    if (!ctx) return {};

    if (Platform.OS === "web") {
      return {
        onScroll: () => {
          ctx.onScrollBeginDrag();
          if (webIdleRef.current) clearTimeout(webIdleRef.current);
          webIdleRef.current = setTimeout(() => {
            ctx.onScrollEnd();
            webIdleRef.current = null;
          }, WEB_IDLE_MS);
        },
        scrollEventThrottle: 16,
      };
    }

    return {
      onScrollBeginDrag: ctx.onScrollBeginDrag,
      onScrollEndDrag: ctx.onScrollEnd,
      onMomentumScrollEnd: ctx.onMomentumScrollEnd,
    };
  }, [ctx]);
}
