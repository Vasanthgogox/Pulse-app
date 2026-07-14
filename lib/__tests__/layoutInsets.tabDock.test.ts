import {
  PULSE_BOTTOM_TAB_DOCK,
  pulseTabBarBodyHeight,
  pulseTabBarChromeHeight,
  pulseTabBarSlotHeight,
} from "@/components/navigation/PulseBottomTabBar/dockMetrics";
import {
  peekBottomAboveTabBar,
  tabBarDockHeight,
  tabBarFooterPadding,
} from "@/lib/layoutInsets";

describe("PULSE_BOTTOM_TAB_DOCK metrics", () => {
  it("derives compact body height from slot geometry (no magic drift)", () => {
    // DemoTabBar uses compact on all mobile widths.
    expect(pulseTabBarSlotHeight(true)).toBe(
      PULSE_BOTTOM_TAB_DOCK.slotPaddingTop +
        PULSE_BOTTOM_TAB_DOCK.iconHeight +
        PULSE_BOTTOM_TAB_DOCK.labelMarginTop +
        PULSE_BOTTOM_TAB_DOCK.labelLineHeightCompact +
        PULSE_BOTTOM_TAB_DOCK.underlineMarginTop +
        PULSE_BOTTOM_TAB_DOCK.underlineHeight +
        PULSE_BOTTOM_TAB_DOCK.slotPaddingBottom,
    );
    expect(pulseTabBarBodyHeight(true)).toBe(
      PULSE_BOTTOM_TAB_DOCK.barPaddingTop + pulseTabBarSlotHeight(true),
    );
    expect(pulseTabBarChromeHeight(true)).toBe(
      PULSE_BOTTOM_TAB_DOCK.shellPaddingTop + pulseTabBarBodyHeight(true),
    );
  });

  it("includes footer pad + native zero-inset shell pad in dock height", () => {
    const inset0 = tabBarDockHeight(0, "native");
    expect(inset0).toBe(
      pulseTabBarChromeHeight(true) +
        tabBarFooterPadding(0, "native") +
        PULSE_BOTTOM_TAB_DOCK.nativeZeroInsetShellPad,
    );

    const inset34 = tabBarDockHeight(34, "native");
    expect(inset34).toBe(
      pulseTabBarChromeHeight(true) + tabBarFooterPadding(34, "native"),
    );
  });

  it("peek clearance sits contentGap above the live dock", () => {
    const bottomInset = 24;
    expect(peekBottomAboveTabBar(bottomInset, "web-mobile")).toBe(
      tabBarDockHeight(bottomInset, "web-mobile") +
        PULSE_BOTTOM_TAB_DOCK.contentGap,
    );
  });
});
