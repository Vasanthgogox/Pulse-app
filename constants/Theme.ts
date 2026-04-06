/**
 * Single source of truth for all UI colors in the app.
 * Uber-inspired theme: black, gray, and white color palette.
 *
 * Usage: import Theme from '@/constants/Theme';
 */

export const Theme = {
  // ---- Primary (dark blue for headers and primary actions) ----
  /** Active tab, FAB, primary actions, headers */
  primary: "#1a237e",
  /** Dark blue variant for date selection section */
  primaryLight: "#283593",
  /** Dark gray for strong text */
  primaryText: "#1a1a1a",

  // ---- Backgrounds ----
  screenBackground: "#ffffff",
  /** Cards, search bar (slate-50) */
  surface: "#f8fafc",
  /** Card border, tab bar border (slate-100) */
  surfaceBorder: "#f1f5f9",
  /** Demo: list/card subtle bg */
  surfaceLight: "#F9F9F9",
  /** Tab pills, input areas (slightly darker than surface) */
  surfaceGray: "#F4F4F4",
  /** Demo: form grouped fields */
  surfaceForm: "#FBFBFB",
  /** Full-screen overlay (e.g. modal backdrop) */
  overlayFull: "rgba(0,0,0,0.95)",
  /** Modal/dropdown dim backdrop */
  overlayBackdrop: "rgba(0,0,0,0.4)",
  /** Border on dark backgrounds (e.g. sign-in divider) */
  borderOnDark: "rgba(248,250,252,0.12)",
  /** Dark screens (sign-in, error) */
  darkBackground: "#000000",
  darkSurface: "#1a1a1a",
  darkInputBg: "#333333",

  /** White card background (legacy alias; prefer surface for new code) */
  cardWhite: "#ffffff",
  /** Input background (light); legacy alias for surface */
  backgroundInput: "#f8fafc",

  // ---- Text (font grading: tight tracking, small labels) ----
  /** Legacy alias for primary text; use textPrimary for new code */
  text: "#1e293b",
  /** Headings, list names (slate-800/900) */
  textPrimary: "#1e293b",
  textPrimaryDark: "#0f172a",
  /** Body, amounts (slate-900) */
  textBody: "#0f172a",
  /** Secondary, time ago (slate-400) */
  textSecondary: "#94a3b8",
  /** Placeholders, chevrons */
  textMuted: "#94a3b8",
  /** Demo: labels, inactive tabs */
  textMutedDemo: "#86868B",
  /** Section labels e.g. "Recent" (slate-300) */
  textSection: "#cbd5e1",
  textOnDark: "#f8fafc",
  /** Muted text on dark backgrounds (e.g. inactive tab in dark tab bar) */
  textOnDarkMuted: "rgba(255,255,255,0.6)",
  textOnPrimary: "#ffffff",
  /** Muted overlay on primary (e.g. icon wrap on selected tab) */
  onPrimaryMuted: "rgba(255,255,255,0.25)",

  // ---- Borders (demo-aligned) ----
  border: "#f1f5f9",
  borderMedium: "#e2e8f0",
  borderFocus: "#cbd5e1",
  /** Demo: header/list borders */
  borderLight: "#F0F0F0",
  /** Demo: inputs, cards */
  borderInput: "#E5E5E7",
  /** Liquid fill pill container (gray-100 / gray-200 to match reference) */
  liquidPillBg: "#f3f4f6",
  liquidPillBorder: "#e5e7eb",
  /** LiquidFillPill wave layers by band (bad / warn / good) — tied to semantic hues, not generated HSL */
  liquidBadBack: "#7f1d1d",
  liquidBadMiddle: "#b91c1c",
  liquidBadFront: "#dc2626",
  liquidWarnBack: "#78350f",
  liquidWarnMiddle: "#b45309",
  liquidWarnFront: "#d97706",
  liquidGoodBack: "#14532d",
  liquidGoodMiddle: "#166534",
  liquidGoodFront: "#15803D",

  // ---- Icons ----
  iconMuted: "#999999",
  iconSlate: "#666666",
  iconPrimary: "#000000",
  iconSecondary: "#666666",

  // ---- Semantic (demo: Tesla red / dark green) ----
  /** Demo accent; positive/credit */
  teslaRed: "#E82127",
  /** Demo: positive/credit */
  darkGreen: "#15803D",
  positive: "#15803D",
  positiveMuted: "#d1fae5",
  /** Warning / expiring soon */
  warning: "#B45309",
  warningMuted: "#FEF3C7",
  negative: "#E82127",
  destructive: "#E82127",
  /** Aggregate (partner) trip pill — distinct from asset/own fleet */
  aggregatePillBg: "rgba(99,102,241,0.12)",
  aggregatePillBorder: "rgba(99,102,241,0.35)",
  aggregatePillText: "#4338ca",

  /** Finance table: integrated party icon (link) — green = synced */
  integratedIcon: "#15803D",
  /** Finance table: non-integrated party icon (unlink) — red = not linked */
  nonIntegratedIcon: "#dc2626",

  /** Shared ledger: full-width Net Trip Due bar (reference navy) */
  ledgerNetBarBg: "#121626",
  /** Net due / variance emphasis (reddish-orange on dark bar) */
  ledgerNetDueAccent: "#F97316",

  // ---- Avatar variants (gray scale) ----
  avatarIndigo: "#f5f5f5",
  avatarIndigoText: "#000000",
  avatarSlate: "#e5e5e5",
  avatarSlateText: "#333333",

  // ---- Buttons ----
  buttonPrimary: "#1a237e",
  buttonPrimaryText: "#ffffff",
  buttonSecondary: "#10b981",
  buttonSecondaryText: "#ffffff",
  buttonMatteBlack: "#151515",
  buttonMatteBlackText: "#ffffff",
  fabBackground: "#151515",
  fabText: "#ffffff",
  buttonDestructive: "#E82127",
  buttonDestructiveText: "#ffffff",

  // ---- Misc ----
  shadow: "#000000",
  shadowSlate: "#e5e5e5",
  link: "#000000",
  placeholder: "#999999",
  separatorLight: "#e5e5e5",
  separatorDark: "rgba(255,255,255,0.1)",
  /** Active tab underline (demo: red) */
  tabUnderline: "#E82127",
  /** Treasury/Fiscal bottom nav active pill background (light indigo) */
  fiscalTabActiveBg: "#e8eaf6",

  /** Demo tab bar: bar background, top border, pill and FAB (use Layout for radii/shadows) */
  tabBarBg: "#ffffff",
  tabBarBorderTop: "#f1f5f9",
  tabBarPillActiveBg: "#F4F4F4",
  tabBarActiveIconBorder: "#E82127",

  // ---- Driver app (reference: Qu Neural Link) ----
  driverPrimary: "#22C55E",
  driverSuccess: "#15803D",
  driverBackground: "#000000",
  driverSurface: "#0A0A0A",
  /** Slightly elevated surface on dark (e.g. chat bubbles) */
  driverSurfaceElevated: "#1A1A1A",
  /** Status bar / strip above content on dark */
  driverStatusBarBg: "#111111",
  driverBorder: "rgba(255,255,255,0.1)",
  /** Subtle borders on dark (dividers, bubble edges) */
  driverBorderSubtle: "rgba(255,255,255,0.05)",
  driverTabBarBg: "transparent",
  driverTabInactive: "#86868B",
  /** Muted text on dark (labels, secondary) */
  driverTextMuted: "#9ca3af",
  /** Placeholder text on dark inputs */
  driverPlaceholder: "#52525b",
  /** Updated reference: emerald accent */
  driverEmerald: "#10B981",
  /** Updated reference: gold for ETA, rank */
  driverGold: "#F59E0B",
  /** Overlay on driver screens */
  driverOverlay: "rgba(0,0,0,0.3)",
  driverOverlayLight: "rgba(0,0,0,0.2)",
  driverOverlayHeavy: "rgba(0,0,0,0.9)",
  /** Muted white surfaces on dark */
  driverWhiteMuted: "rgba(255,255,255,0.05)",
  driverWhiteMutedStrong: "rgba(255,255,255,0.1)",
  /** Emerald tint borders/backgrounds on dark */
  driverEmeraldBorder: "rgba(16,185,129,0.4)",
  driverEmeraldMuted: "rgba(16,185,129,0.1)",
  driverEmeraldMutedText: "rgba(16,185,129,0.5)",
  driverEmeraldMutedText2: "rgba(16,185,129,0.6)",
  driverEmeraldBorderSoft: "rgba(16,185,129,0.3)",
  /** Negative (red) muted background */
  negativeMuted: "rgba(220,38,38,0.15)",
  /** Positive (green) muted on dark */
  positiveMutedDark: "rgba(21,128,61,0.1)",
  positiveMutedDarkBorder: "rgba(21,128,61,0.2)",
  /** Border on dark (slightly stronger than driverBorder) */
  driverBorderLight: "rgba(255,255,255,0.2)",

  // ---- Auth screens (sleek dark sign-in/sign-up) ----
  /** Card and segmented control background */
  authSurface: "#111111",
  /** Input background */
  authInputBg: "#0A0A0A",
  /** Input/card border, selected segment bg */
  authBorder: "#262626",
  /** Muted labels and placeholder-style text */
  authTextMuted: "#8A8A8E",
  /** Primary CTA (red accent) */
  authPrimary: "#E31937",
  /** Primary CTA hover/pressed (darker red) */
  authPrimaryDark: "#B3132B",
} as const;

export type ThemeColors = typeof Theme;

export default Theme;
