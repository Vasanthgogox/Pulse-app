/**
 * Layout constants for responsive design and consistent spacing.
 * Use these instead of magic numbers so the app adapts and stays consistent.
 *
 * Safe area is always applied via useSafeAreaInsets() — never hardcode
 * status bar or home indicator heights here.
 */

export const Layout = {
  /** Horizontal padding for screen content (matches common header padding) */
  screenPaddingHorizontal: 16,
  /** Base vertical spacing between sections */
  sectionSpacing: 24,
  /** Spacing: small (sectionSpacing * 0.25) */
  spacingSmall: 6,
  /** Spacing: medium (sectionSpacing * 0.35) */
  spacingMedium: 8,
  /** Spacing: large (sectionSpacing * 0.55) */
  spacingLarge: 14,
  /** Spacing: extra large (sectionSpacing * 0.75) */
  spacingExtraLarge: 18,
  /** Minimum touch target size (Apple HIG / Android: ~44–48dp) */
  minTouchTargetSize: 44,
  /** Extra hit area around tappable elements (hitSlop) */
  touchTargetHitSlop: 8,
  /** FAB distance from bottom (add to tab bar / safe area offset in component) */
  fabBottomOffset: 24,
  /** FAB horizontal offset from screen right (all screen sizes) */
  fabRightOffset: 20,
  /** Tab bar dock content height (DemoTabBar glassDock); total bar = this + padding from DemoTabBar */
  tabBarDockHeight: 61,
  /** Header content padding below safe area */
  headerPaddingBelowInset: 16,
  /** Driver header compact horizontal padding (dashboard + driver pages) */
  driverHeaderHorizontalPadding: 14,
  /** Driver header compact padding below the safe area inset */
  driverHeaderTopOffset: 8,
  /** Driver header compact bottom padding */
  driverHeaderBottomPadding: 8,
  /** Driver header compact gap between avatar and text */
  driverHeaderGap: 12,
  /** Driver header compact avatar size */
  driverHeaderAvatarSize: 40,
  /** Modal / sheet bottom padding above home indicator (add insets.bottom in component) */
  modalBottomPadding: 24,
  /** Ledger-style bottom sheet: ratio of window height (same for Add Transaction, Add Client, Add Vehicle, Add Driver) */
  ledgerPanelHeightRatio: 0.56,
  /** Ledger-style bottom sheet: max height in px */
  ledgerPanelMaxHeight: 380,
  /** Extra padding at bottom of scroll content on auth/form screens so focused input can scroll above keyboard (physical devices) */
  keyboardAvoidScrollPadding: 280,
  /** Height of custom tab bar (FISCAL | OPS | TRIPS) for consistent layout */
  tabBarHeight: 56,
  /** Bottom corner radius of demo tab bar (matches device curve) */
  tabBarBorderRadiusBottom: 20,
  /** Radius of each tab pill (FISCAL / OPS / TRIPS) */
  tabBarPillBorderRadius: 14,
  /** Min padding below tab bar (add to insets.bottom in component) */
  tabBarBottomPaddingMin: 8,
  /** Max width per tab item so labels don't stretch on tablets */
  tabItemMaxWidth: 120,
  /** Shadow: bar elevation (iOS shadowOffset Y) */
  tabBarShadowOffsetY: -2,
  tabBarShadowOpacity: 0.06,
  tabBarShadowRadius: 10,
  tabBarElevation: 12,
  /** Active OPS icon container */
  tabBarActiveIconBorderRadius: 10,
  tabBarActiveIconPadding: 4,
  tabBarIconSlotMinHeight: 28,
  tabBarActiveIconShadowOffsetY: 2,
  tabBarActiveIconShadowOpacity: 0.2,
  tabBarActiveIconShadowRadius: 4,
  tabBarActiveIconElevation: 6,
  /** FAB size and elevation */
  fabSize: 56,
  fabBorderRadius: 28,
  fabShadowOffsetY: 4,
  fabShadowOpacity: 0.3,
  fabShadowRadius: 12,
  fabElevation: 12,
} as const;

export default Layout;
