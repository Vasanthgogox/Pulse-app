/**
 * Bottom safe area + floating tab bar clearance.
 *
 * Dock chrome numbers come from `PulseBottomTabBar/dockMetrics` (single source of
 * truth with the rendered tab bar). Do not re-hardcode bar heights here.
 */
import Layout from "@/constants/Layout";
import {
  PULSE_BOTTOM_TAB_DOCK,
  pulseTabBarChromeHeight,
} from "@/components/navigation/PulseBottomTabBar/dockMetrics";
import { useEffectiveBottomInset } from "@/lib/safeAreaWeb";
import { Platform, useWindowDimensions } from "react-native";
import { useMemo } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * @deprecated Prefer `PULSE_BOTTOM_TAB_DOCK` from PulseBottomTabBar/dockMetrics.
 * Kept as a thin alias so existing imports keep compiling.
 */
export const TAB_BAR_DOCK_METRICS = {
  shellPaddingTop: PULSE_BOTTOM_TAB_DOCK.shellPaddingTop,
  barMinHeight: pulseTabBarChromeHeight(true) - PULSE_BOTTOM_TAB_DOCK.shellPaddingTop,
  barPaddingTop: PULSE_BOTTOM_TAB_DOCK.barPaddingTop,
  footerPaddingMin: PULSE_BOTTOM_TAB_DOCK.footerPaddingMin,
  contentGap: PULSE_BOTTOM_TAB_DOCK.contentGap,
} as const;

export type TabBarLayoutPlatform = "native" | "web-mobile" | "web-desktop";

export function resolveTabBarLayoutPlatform(opts: {
  isWeb?: boolean;
  isDesktopWeb?: boolean;
}): TabBarLayoutPlatform {
  if (opts.isDesktopWeb) return "web-desktop";
  if (opts.isWeb) return "web-mobile";
  return "native";
}

/**
 * DemoTabBar always passes `isCompactMobile={!isDesktopWeb}` — mobile dock is compact.
 */
function usesCompactMobileDock(platform: TabBarLayoutPlatform): boolean {
  return platform !== "web-desktop";
}

/** Footer padding inside PulseBottomTabBar (home indicator / gesture bar). */
export function tabBarFooterPadding(
  bottomInset: number,
  platform: TabBarLayoutPlatform,
): number {
  if (platform === "web-desktop") return 0;
  if (platform === "web-mobile") {
    return Math.max(bottomInset, PULSE_BOTTOM_TAB_DOCK.footerPaddingMin);
  }
  return Math.max(
    Math.round(bottomInset * 0.35),
    PULSE_BOTTOM_TAB_DOCK.footerPaddingMin,
  );
}

/**
 * Extra pad on the native tab-shell when there is no bottom safe-area
 * (`app/(tabs)/_layout.tsx`).
 */
function tabBarNativeShellPad(
  bottomInset: number,
  platform: TabBarLayoutPlatform,
): number {
  if (platform !== "native") return 0;
  return bottomInset > 0 ? 0 : PULSE_BOTTOM_TAB_DOCK.nativeZeroInsetShellPad;
}

/** Total height of the bottom tab dock including safe area + native shell pad. */
export function tabBarDockHeight(
  bottomInset: number,
  platform: TabBarLayoutPlatform,
): number {
  if (platform === "web-desktop") return 0;
  const compact = usesCompactMobileDock(platform);
  return (
    pulseTabBarChromeHeight(compact) +
    tabBarFooterPadding(bottomInset, platform) +
    tabBarNativeShellPad(bottomInset, platform)
  );
}

/**
 * `paddingBottom` for scroll content on dispatcher tab screens (above floating dock).
 */
export function scrollClearanceAboveTabBar(
  bottomInset: number,
  extra = 0,
  platform: TabBarLayoutPlatform,
): number {
  if (platform === "web-desktop") return extra;
  return (
    tabBarDockHeight(bottomInset, platform) +
    PULSE_BOTTOM_TAB_DOCK.contentGap +
    extra
  );
}

/** `bottom` offset for FABs / floating buttons above the tab dock. */
export function fabBottomAboveTabBar(
  bottomInset: number,
  platform: TabBarLayoutPlatform,
  options?: { extra?: number; stackOffset?: number },
): number {
  const extra = options?.extra ?? 0;
  const stackOffset = options?.stackOffset ?? 0;
  if (platform === "web-desktop") {
    return Layout.fabBottomOffset + bottomInset + extra + stackOffset;
  }
  return (
    scrollClearanceAboveTabBar(bottomInset, Layout.fabBottomOffset, platform) +
    stackOffset +
    extra
  );
}

/**
 * `bottom` for banners / peeks that sit just above the dock (no FAB offset).
 */
export function peekBottomAboveTabBar(
  bottomInset: number,
  platform: TabBarLayoutPlatform,
  extra = 0,
): number {
  if (platform === "web-desktop") {
    return Math.max(bottomInset, 8) + extra;
  }
  return scrollClearanceAboveTabBar(bottomInset, extra, platform);
}

/**
 * @deprecated Replace with `scrollClearanceAboveTabBar(bottom, extra, platform)`.
 * Old: `Layout.demoTabBarScrollBottomInset + insets.bottom + Layout.tabBarBottomPaddingMin`
 */
export function legacyTabBarScrollPadding(
  bottomInset: number,
  platform: TabBarLayoutPlatform,
  extra = 0,
): number {
  return (
    scrollClearanceAboveTabBar(
      bottomInset,
      extra + Layout.tabBarBottomPaddingMin,
      platform,
    ) - PULSE_BOTTOM_TAB_DOCK.contentGap
  );
}

export function useLayoutInsets() {
  const insets = useSafeAreaInsets();
  const bottom = useEffectiveBottomInset();
  const { width } = useWindowDimensions();
  const isWeb = Platform.OS === "web";
  const isDesktopWeb = isWeb && width >= 1024;
  const platform = resolveTabBarLayoutPlatform({
    isWeb,
    isDesktopWeb,
  });

  return useMemo(
    () => ({
      top: insets.top,
      bottom,
      left: insets.left,
      right: insets.right,
      isWeb,
      isDesktopWeb,
      isMobileWeb: isWeb && !isDesktopWeb,
      hasBottomTabBar: !isDesktopWeb,
      platform,
      tabBarDockHeight: () => tabBarDockHeight(bottom, platform),
      tabBarFooterPadding: () => tabBarFooterPadding(bottom, platform),
      scrollBottomPadding: (extra = 0) =>
        scrollClearanceAboveTabBar(bottom, extra, platform),
      fabBottom: (options?: { extra?: number; stackOffset?: number }) =>
        fabBottomAboveTabBar(bottom, platform, options),
      /** Assign-vehicle peek / similar banners above the dock. */
      peekBottom: (extra = 0) => peekBottomAboveTabBar(bottom, platform, extra),
    }),
    [
      insets.top,
      insets.left,
      insets.right,
      bottom,
      isWeb,
      isDesktopWeb,
      platform,
    ],
  );
}
