/**
 * Scroll-driven visibility for the demo tab bar (hide while scrolling, show after idle).
 * Native: hide on drag begin, show after drag/momentum end.
 * Mobile web: direction-based hide (down) / show (up) via ScrollView onScroll — no window scroll listener.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react";
import {
  Platform,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import Animated, {
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

const HIDE_MS = 300;
const SHOW_MS = 300;
const SHOW_DELAY_MS = 0;
const WEB_IDLE_MS = 380;
/** Ignore hide until user has scrolled past top bounce. */
const WEB_HIDE_MIN_OFFSET_Y = 50;
/** Min delta (px) per scroll tick to count as up/down. */
const WEB_SCROLL_DIRECTION_DELTA = 8;

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

let scrollHideVersion = 0;
const scrollHideListeners = new Set<() => void>();
let scrollInProgress = false;
const scrollProgressListeners = new Set<() => void>();

function emitScrollHideStart() {
  scrollHideVersion += 1;
  scrollHideListeners.forEach((listener) => listener());
}

function setScrollInProgress(next: boolean) {
  if (scrollInProgress === next) return;
  scrollInProgress = next;
  scrollProgressListeners.forEach((listener) => listener());
}

function isMobileWebAutoHide(width: number): boolean {
  return Platform.OS === "web" && width < 1024;
}

export function DemoTabBarScrollProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { width } = useWindowDimensions();
  const progress = useSharedValue(1);
  const scrollEndTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const autoHideEnabledRef = useRef(
    Platform.OS !== "web" || isMobileWebAutoHide(width),
  );
  autoHideEnabledRef.current =
    Platform.OS !== "web" || isMobileWebAutoHide(width);

  const clearSchedule = useCallback(() => {
    if (scrollEndTimeoutRef.current) {
      clearTimeout(scrollEndTimeoutRef.current);
      scrollEndTimeoutRef.current = null;
    }
  }, []);

  const onScrollBeginDrag = useCallback(() => {
    if (!autoHideEnabledRef.current) return;
    clearSchedule();
    setScrollInProgress(true);
    emitScrollHideStart();
    progress.value = withTiming(0, { duration: HIDE_MS });
  }, [clearSchedule, progress]);

  const scheduleShow = useCallback(() => {
    if (!autoHideEnabledRef.current) return;
    clearSchedule();
    scrollEndTimeoutRef.current = setTimeout(() => {
      setScrollInProgress(false);
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
    if (!autoHideEnabledRef.current) return;
    clearSchedule();
    setScrollInProgress(false);
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

export function useDemoTabBarVisibilityProgressOptional(): SharedValue<number> | null {
  return useContext(ProgressCtx)?.progress ?? null;
}

export function useDemoTabBarScrollHideVersion(): number {
  return React.useSyncExternalStore(
    (listener) => {
      scrollHideListeners.add(listener);
      return () => scrollHideListeners.delete(listener);
    },
    () => scrollHideVersion,
    () => 0,
  );
}

export function useDemoTabBarScrollInProgress(): boolean {
  return React.useSyncExternalStore(
    (listener) => {
      scrollProgressListeners.add(listener);
      return () => scrollProgressListeners.delete(listener);
    },
    () => scrollInProgress,
    () => false,
  );
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
    transform: [{ translateY: (1 - progress.value) * OFF_TRANSLATE }],
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
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  scrollEventThrottle?: number;
} {
  const ctx = useDemoTabBarScrollOptional();
  const { width } = useWindowDimensions();
  const mobileWebAutoHide = isMobileWebAutoHide(width);
  const lastOffsetYRef = useRef(0);
  const webIdleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (webIdleRef.current) clearTimeout(webIdleRef.current);
    },
    [],
  );

  return useMemo(() => {
    if (!ctx) return {};

    if (Platform.OS !== "web") {
      return {
        onScrollBeginDrag: ctx.onScrollBeginDrag,
        onScrollEndDrag: ctx.onScrollEnd,
        onMomentumScrollEnd: ctx.onMomentumScrollEnd,
      };
    }

    if (!mobileWebAutoHide) return {};

    return {
      onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
        const y = event.nativeEvent.contentOffset.y;
        const dy = y - lastOffsetYRef.current;
        lastOffsetYRef.current = y;

        if (dy > WEB_SCROLL_DIRECTION_DELTA && y > WEB_HIDE_MIN_OFFSET_Y) {
          ctx.onScrollBeginDrag();
        } else if (dy < -WEB_SCROLL_DIRECTION_DELTA) {
          ctx.resetBarVisible();
        }

        if (webIdleRef.current) clearTimeout(webIdleRef.current);
        webIdleRef.current = setTimeout(() => {
          ctx.onScrollEnd();
          webIdleRef.current = null;
        }, WEB_IDLE_MS);
      },
      scrollEventThrottle: 16,
    };
  }, [ctx, mobileWebAutoHide]);
}
