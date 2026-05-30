/**
 * Single source of truth for all UI colors in the app.
 * Uber-inspired theme: black, gray, and white color palette.
 *
 * Usage: import Theme from '@/constants/Theme';
 */

export const Theme = {
  // ---- Primary (Pulse indigo for headers and primary actions) ----
  /** Active tab, FAB, primary actions, headers — same as Add Trip / bottom nav. */
  primary: "#4F46E5",
  /** Lighter gradient stop; kept in the same indigo-600 family as `primary`. */
  primaryLight: "#4F46E5",
  /** Dark gray for strong text */
  primaryText: "#1a1a1a",

  /** Analytics hero banner (Pulse desktop reference) */
  analyticsHeroBg: "#2B3171",
  /** Analytics page canvas */
  analyticsCanvas: "#F8F9FB",
  analyticsHeroSubtitle: "#C7D2FE",

  // ---- Backgrounds ----
  screenBackground: "#ffffff",
  /** Cards, search bar (slate-50) */
  surface: "#f8fafc",
  /** Card border, tab bar border (slate-100) */
  surfaceBorder: "#f1f5f9",
  /** Legacy alias used by operational cards. */
  whiteMuted: "#f8fafc",
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
  /** Small alert/confirm modals: top accent + icon inner fill (neutral, not brand blue) */
  modalNeutralAccent: "#151515",
  /** Soft wash behind modal icon (neutral) */
  modalNeutralIconWash: "rgba(0,0,0,0.08)",
  /** Border on dark backgrounds (e.g. sign-in divider) */
  borderOnDark: "rgba(248,250,252,0.12)",
  /** Dark screens (sign-in, error) */
  darkBackground: "#000000",
  darkSurface: "#1a1a1a",
  darkInputBg: "#333333",

  // ---- Action accent (Pulse purple — matches Add Trip `pulseIndigo`) ----
  /** Canonical Pulse purple: Add Trip, bottom nav cluster, CTA pills. */
  actionAccent: "#4F46E5",
  /** Indigo-700 rim for 1px borders on pills (subtle depth, same hue family). */
  actionAccentBorder: "#4338CA",
  /** Indigo-600 shadow tint under action pills and tab bar. */
  actionAccentShadow: "rgba(79, 70, 229, 0.32)",

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
  /** Trips cards: origin/destination route — slightly darker than textSecondary for readability */
  textRouteCard: "#64748b",
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

  /** Liquid fill pill — theme-aligned semantic gradients (back/middle/front) */
  // Keep these aligned with existing semantic colors (teslaRed / warning / darkGreen).
  // Back/middle/front provide depth without neon tones.
  liquidBadBack: "#7f1d1d",
  liquidBadMiddle: "#b91c1c",
  liquidBadFront: "#E82127",
  liquidWarnBack: "#78350f",
  liquidWarnMiddle: "#B45309",
  liquidWarnFront: "#D97706",
  liquidGoodBack: "#14532d",
  liquidGoodMiddle: "#15803D",
  liquidGoodFront: "#188038",

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
  /** Google Pay–style “received” amount on light lists */
  gpayAmountReceived: "#188038",
  /** GPay list primary title (light) */
  gpayListTitle: "#000000",
  /** GPay list timestamp line (light) */
  gpayListSubtitle: "#5F6368",
  positive: "#15803D",
  /** Legacy alias for semantic success usage. */
  success: "#15803D",
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
  /** Partner column label on dark mirror cells (shared ledger hub). */
  ledgerPartnerLabelOnDark: "#A5B4FC",

  /** Create Trip: dark party / price selection rows on light section shells */
  tripSelectionSurface: "#121212",
  tripSelectionSurfaceActive: "#191919",
  tripSelectionBorder: "rgba(248,250,252,0.14)",
  tripSelectionBorderActive: "rgba(248,250,252,0.45)",
  tripSelectionInsetBg: "rgba(255,255,255,0.09)",
  tripSelectionInsetBorder: "rgba(255,255,255,0.18)",

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
  buttonPrimary: "#4F46E5",
  buttonPrimaryText: "#ffffff",
  buttonSecondaryBackground: "#4b5563", // Temporary comment to force refresh
  buttonSecondary: "#047857",
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
  /** Trips hub: unassigned pill — soft slate wash, black border (Tesla-like, not amber) */
  tripHubUnassignedPillBg: "rgba(15, 23, 42, 0.06)",
  /** Treasury/Fiscal bottom nav active pill background (light indigo) */
  fiscalTabActiveBg: "#e8eaf6",

  /** Pulse loader + mobile tab bar accent (indigo) */
  pulseIndigo: "#4F46E5",
  pulseIndigoRing: "rgba(79, 70, 229, 0.22)",
  pulseIndigoWash: "rgba(79, 70, 229, 0.12)",
  /** Mobile footer active pill + icon ring */
  pulseTabActiveBg: "rgba(79, 70, 229, 0.10)",
  pulseTabActiveBorder: "rgba(79, 70, 229, 0.28)",
  /** Ops cluster — light track (matches tab bar shell); Slack-style sliding thumb. */
  pulseTabClusterTrackTop: "#F5F6FC",
  pulseTabClusterTrackBottom: "#E8EBF5",
  pulseTabClusterTrackBg: "#F0F2FA",
  pulseTabClusterTrackBorder: "rgba(148, 163, 184, 0.32)",
  pulseTabClusterTrackInnerGlow: "rgba(255, 255, 255, 0.7)",
  pulseTabClusterTrackRim: "rgba(255, 255, 255, 0.95)",
  /** Sliding thumb — Pulse indigo (same as Add Trip / reference screenshot). */
  pulseTabClusterThumbSolid: "#4F46E5",
  pulseTabClusterThumbGlassTop: "#5652E8",
  pulseTabClusterThumbGlassBottom: "#4338CA",
  pulseTabClusterThumbSpecular: "rgba(255, 255, 255, 0.22)",
  pulseTabClusterThumbBorder: "rgba(67, 56, 202, 0.5)",
  pulseTabClusterThumbInnerBorder: "rgba(255, 255, 255, 0.18)",
  pulseTabClusterThumbShadow: "rgba(79, 70, 229, 0.28)",
  /** Icon + label on the purple thumb. */
  pulseTabClusterIconOnThumb: "#FFFFFF",
  pulseTabClusterLabelOnThumb: "#FFFFFF",
  /** Icon + label on the light track (inactive). */
  pulseTabClusterIconInactive: "#94A3B8",
  pulseTabClusterLabelInactive: "#94A3B8",

  /** Demo tab bar: bar background, top border, pill and FAB (use Layout for radii/shadows) */
  tabBarBg: "#FAFAFF",
  tabBarBorderTop: "rgba(79, 70, 229, 0.12)",
  tabBarPillActiveBg: "#F4F4F4",
  tabBarActiveIconBorder: "#E82127",

  // ---- Driver app (reference: Qu Neural Link) ----
  /** CTAs / filled pills — emerald-600 (deeper than legacy neon green) */
  driverPrimary: "#059669",
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
  /** Accents, amounts, dots — emerald-700/800 (modern / restrained) */
  driverEmerald: "#047857",
  driverEmeraldDark: "#065f46",
  /** Updated reference: gold for ETA, rank */
  driverGold: "#F59E0B",
  /** Overlay on driver screens */
  driverOverlay: "rgba(0,0,0,0.3)",
  driverOverlayLight: "rgba(0,0,0,0.2)",
  driverOverlayHeavy: "rgba(0,0,0,0.9)",
  /** Muted white surfaces on dark */
  driverWhiteMuted: "rgba(255,255,255,0.05)",
  driverWhiteMutedStrong: "rgba(255,255,255,0.1)",
  /** Emerald tint borders/backgrounds on dark — based on #047857 */
  driverEmeraldBorder: "rgba(4,120,87,0.38)",
  driverEmeraldMuted: "rgba(4,120,87,0.12)",
  driverEmeraldMutedText: "rgba(4,120,87,0.52)",
  driverEmeraldMutedText2: "rgba(4,120,87,0.62)",
  driverEmeraldBorderSoft: "rgba(4,120,87,0.28)",
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

  // ---- Cinematic profile (premium UI) ----
  /** Cinematic header background (slate-950-ish, not pure black) */
  cinematicHeaderBg: "#020617",
  /** Translucent header chip background */
  cinematicHeaderChipBg: "rgba(255,255,255,0.10)",
  /** Translucent header chip background (pressed) */
  cinematicHeaderChipBgPressed: "rgba(255,255,255,0.18)",
  /** Ultra-soft light card border */
  cinematicCardBorder: "rgba(15,23,42,0.08)",
  /** Hairline divider inside premium cards */
  cinematicDivider: "rgba(15,23,42,0.06)",
  /** Soft red glow for cinematic depth */
  cinematicGlowRed: "rgba(232,33,39,0.45)",

  // ---- Trip feedback modal (Pulse-style: driver / supplier / client) ----
  feedbackModalHeaderDriver: "#0F172A",
  feedbackModalHeaderSupplier: "#064E3B",
  feedbackModalHeaderClient: "#4C1D95",
  /** Filled star + avatar badge accent */
  feedbackModalStarActive: "#FBBF24",
  feedbackModalBackdrop: "rgba(0, 0, 0, 0.6)",
  feedbackModalBadgeRing: "#F59E0B",

  // ---- Network UI grading (clean neutrals + semantic accents) ----
  /** Network hub page canvas — muted grey so white cards read clearly. */
  networkPageBackground: "#F1F3F6",
  networkCardBackground: "#FFFFFF",
  networkCardBorder: "#E2E8F0",
  /** Elevated list rows on white hub sections. */
  networkHubListCardBackground: "#FFFFFF",
  networkHubListCardBorder: "#E5E7EB",
  networkHubListCardShadow: "#0F172A",
  networkHubListCardAvatarBg: "#F8FAFC",
  networkHubListCardAvatarBorder: "#E5E7EB",
  networkHubListCardMetricsBg: "#F9FAFB",
  networkHubListCardMetricsBorder: "#E5E7EB",
  networkHubListCardActionBg: "#FFFFFF",
  networkHubListCardRatingStar: "#F59E0B",
  networkHubListCardRatingBg: "#F8FAFC",
  networkHubListCardRatingBorder: "#E2E8F0",
  networkHubListCardRatingText: "#475569",
  networkHubListCardOnlineDot: "#10B981",
  networkHubListCardConnectedBg: "#ECFDF5",
  networkHubListCardConnectedBorder: "#A7F3D0",
  networkHubListCardConnectedText: "#047857",
  networkHubListCardPrimaryTintBg: "#F5F6FF",
  networkHubListCardPrimaryTintBorder: "#C7D2FE",
  networkSectionLabel: "#64748B",
  networkClientTintBg: "rgba(79,70,229,0.10)",
  networkSupplierTintBg: "rgba(21,128,61,0.10)",
  networkDriverTintBg: "rgba(180,83,9,0.12)",
  networkMessageTintBg: "rgba(79,70,229,0.08)",
  networkMessageTintBorder: "rgba(79,70,229,0.20)",
  /** Frosted glass surfaces (Load Marketplace quick cards). */
  networkGlassSurface: "rgba(255,255,255,0.78)",
  networkGlassSurfacePressed: "rgba(255,255,255,0.62)",
  networkGlassBorder: "rgba(255,255,255,0.95)",
  networkGlassBorderOuter: "rgba(15,23,42,0.05)",
  networkGlassInset: "rgba(255,255,255,0.62)",
  networkGlassSpecular: "rgba(255,255,255,0.72)",
  networkGlassSupplyTint: "rgba(99,102,241,0.10)",
  networkGlassSupplyGradient: "rgba(99,102,241,0.16)",
  networkGlassSupplyAccent: "#5B5BD6",
  networkGlassSupplyIconBg: "rgba(99,102,241,0.12)",
  networkGlassDemandTint: "rgba(16,185,129,0.09)",
  networkGlassDemandGradient: "rgba(16,185,129,0.14)",
  networkGlassDemandAccent: "#0D9B6E",
  networkGlassDemandIconBg: "rgba(16,185,129,0.12)",
  networkGlassHeadPill: "rgba(255,255,255,0.55)",
  /** Solid-fill hub role badges — glass gradient + rim (connections list). */
  networkBadgeClientBg: "#E4E8F4",
  networkBadgeClientGradientTop: "#F5F6FC",
  networkBadgeClientText: "#4338CA",
  networkBadgeClientBorder: "rgba(255,255,255,0.85)",
  networkBadgeSupplierBg: "#D8F5E4",
  networkBadgeSupplierGradientTop: "#F0FDF6",
  networkBadgeSupplierText: "#166534",
  networkBadgeSupplierBorder: "rgba(255,255,255,0.88)",
  networkBadgeDriverBg: "#FFE9D0",
  networkBadgeDriverGradientTop: "#FFF8F1",
  networkBadgeDriverText: "#B45309",
  networkBadgeDriverBorder: "rgba(255,255,255,0.88)",
  networkBadgeIntegratedBg: "#1E293B",
  networkBadgeIntegratedGradientTop: "#334155",
  networkBadgeIntegratedText: "#F8FAFC",
  networkBadgeIntegratedBorder: "rgba(255,255,255,0.22)",
  networkBadgeIntegratedHighlight: "rgba(255,255,255,0.38)",
  /** Glass hub action buttons (Connected / Connect / Pending). */
  networkGlassBtnConnectedBg: "#ECFDF5",
  networkGlassBtnConnectedGradientTop: "#FFFFFF",
  networkGlassBtnConnectedBorder: "rgba(255,255,255,0.92)",
  networkGlassBtnConnectedText: "#64748B",
  networkGlassBtnPrimaryBg: "#EEF0FF",
  networkGlassBtnPrimaryGradientTop: "#FAFBFF",
  networkGlassBtnPrimaryBorder: "rgba(255,255,255,0.92)",
  networkGlassBtnNeutralBg: "rgba(255,255,255,0.78)",
  networkGlassBtnNeutralGradientTop: "#FFFFFF",
  networkGlassBtnNeutralBorder: "rgba(255,255,255,0.9)",

  // ---- Finance unified-base parity cards ----
  financeHeroBg: "#1D1D1F",
  financeHeroBorder: "rgba(255,255,255,0.12)",
  financeHeroRangeBg: "rgba(255,255,255,0.08)",
  financeHeroRangeBorder: "rgba(255,255,255,0.22)",
  financeCardBlueFrom: "#1d4ed8",
  financeCardBlueTo: "#312e81",
  financeCardOrangeFrom: "#ea580c",
  financeCardOrangeTo: "#78350f",
  financeCardSlateFrom: "#334155",
  financeCardSlateTo: "#0f172a",
  financeCardGreenFrom: "#059669",
  financeCardGreenTo: "#115e59",
  financeCardCashFrom: "#0e7490",
  financeCardCashTo: "#164e63",

  // ---- Analytics chart series + score levels ----
  /** Canonical 6-slot chart series palette used across the analytics
   *  modules (Driver / Client / Supplier). Picked so the first 4 slots
   *  match the existing inline hex usage in
   *  `features/vehicles/components/analytics/analyticsUtils.ts`
   *  (`EXPENSE_COLOR_MAP`) — meaning we can later replace those literals
   *  with `Theme.chartSeries.series1..4` without changing rendered hues.
   *  When you need more than 6 series, cycle back to series1. */
  chartSeries1: "#4F46E5", // indigo  — primary metric (revenue, headline)
  chartSeries2: "#15803D", // green   — positive (profit, on-time, paid)
  chartSeries3: "#E82127", // red     — negative (expense, outstanding)
  chartSeries4: "#F97316", // orange  — secondary (fuel, advance)
  chartSeries5: "#0EA5E9", // sky     — tertiary (toll, KM)
  chartSeries6: "#94A3B8", // slate   — "other" / neutral baseline

  /** Soft fills for grouped/stacked bars (alpha-blended series above).
   *  Use these as the "area" under a line chart or as the bar fill when
   *  the stroke is `chartSeriesN`. */
  chartFill1: "rgba(79,70,229,0.14)",
  chartFill2: "rgba(21,128,61,0.14)",
  chartFill3: "rgba(232,33,39,0.14)",
  chartFill4: "rgba(249,115,22,0.14)",
  chartFill5: "rgba(14,165,233,0.14)",
  chartFill6: "rgba(148,163,184,0.18)",

  /** Score-level palette — used by `ScoreCard` / `RiskMeter` and any
   *  badge that surfaces a 0–100 score. Same level union as
   *  `complianceScore` (`excellent | good | warning | critical`),
   *  but tuned slightly cooler so analytics surfaces feel distinct
   *  from compliance reds. */
  scoreExcellentBg: "#DCFCE7",
  scoreExcellentFg: "#166534",
  scoreGoodBg: "#DBEAFE",
  scoreGoodFg: "#1D4ED8",
  scoreWarningBg: "#FEF3C7",
  scoreWarningFg: "#B45309",
  scoreCriticalBg: "#FEE2E2",
  scoreCriticalFg: "#B91C1C",

  /** Heatmap cell palette — graduated greens for "healthy" and reds
   *  for "at-risk". Used by `Heatmap` (aging / risk grid). */
  heatmapHealthy: "#15803D",
  heatmapNoticeBg: "#FEF3C7",
  heatmapNoticeFg: "#92400E",
  heatmapWarningBg: "#FFE4B5",
  heatmapWarningFg: "#9A3412",
  heatmapCriticalBg: "#FECACA",
  heatmapCriticalFg: "#991B1B",
  heatmapEmpty: "#F1F5F9",

  /** Rank-badge palette (gold / silver / bronze) — used by leaderboards.
   *  Replaces the duplicated `RANK_BADGE` literal map currently inline
   *  in 4 analytics files. */
  rankGoldBg: "#FEF3C7",
  rankGoldFg: "#B45309",
  rankSilverBg: "#F1F5F9",
  rankSilverFg: "#475569",
  rankBronzeBg: "#FEF2F2",
  rankBronzeFg: "#B45309",
} as const;

export type ThemeColors = typeof Theme;

export default Theme;
