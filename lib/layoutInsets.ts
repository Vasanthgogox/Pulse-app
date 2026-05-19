/**
 * Single source of truth for bottom safe area + floating tab bar clearance.
 * Keep `TAB_BAR_DOCK_METRICS` in sync with `components/demo/DemoTabBar.tsx` styles.
 */
import Layout from "@/constants/Layout";
import { useEffectiveBottomInset } from "@/lib/safeAreaWeb";
import { Platform, useWindowDimensions } from "react-native";
import { useMemo } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** DemoTabBar mobile dock (mmtFooterShell + mmtFooterBar). */
export const TAB_BAR_DOCK_METRICS = {
  shellPaddingTop: 10,
  barMinHeight: 58,
  barPaddingTop: 4,
  footerPaddingMin: 10,
  /** Space between scroll content and the top edge of the dock */
  contentGap: 12,
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

/** Footer padding inside DemoTabBar (home indicator / gesture bar). */
export function tabBarFooterPadding(
  bottomInset: number,
  platform: TabBarLayoutPlatform,
): number {
  if (platform === "web-desktop") return 0;
  if (platform === "web-mobile") {
    return Math.max(bottomInset, TAB_BAR_DOCK_METRICS.footerPaddingMin);
  }
  return Math.max(
    Math.round(bottomInset * 0.35),
    TAB_BAR_DOCK_METRICS.footerPaddingMin,
  );
}

/** Total height of the bottom tab dock including safe area padding. */
export function tabBarDockHeight(
  bottomInset: number,
  platform: TabBarLayoutPlatform,
): number {
  if (platform === "web-desktop") return 0;
  const footerPad = tabBarFooterPadding(bottomInset, platform);
  return (
    TAB_BAR_DOCK_METRICS.shellPaddingTop +
    TAB_BAR_DOCK_METRICS.barMinHeight +
    TAB_BAR_DOCK_METRICS.barPaddingTop +
    footerPad
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
    TAB_BAR_DOCK_METRICS.contentGap +
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
    ) - TAB_BAR_DOCK_METRICS.contentGap
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
