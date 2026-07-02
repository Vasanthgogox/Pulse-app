/**
 * Shared typography + layout for indent detail (GIVE LOAD owner / GET LOAD supplier)
 * and Review Hub modals (Award, Bid). Compact txn-page rhythm, heavier weights.
 */
import { Platform, StyleSheet } from "react-native";

import { FinanceTxnTypography } from "@/constants/FinanceTxnTypography";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";

export const indentReviewHubText = {
  headerId: {
    ...FinanceTxnTypography.partyTitle,
    fontSize: 12,
    fontWeight: "800" as const,
    fontStyle: "normal" as const,
    color: Theme.textOnDark,
    letterSpacing: 0.6,
  },
  headerSubtitle: {
    ...FinanceTxnTypography.fieldLabel,
    fontSize: 8,
    fontWeight: "700" as const,
    letterSpacing: 0.5,
    color: Theme.textOnDarkMuted,
  },
  chipLabel: {
    ...FinanceTxnTypography.chipLabel,
    fontSize: 7,
    fontWeight: "700" as const,
    letterSpacing: 0.35,
  },
  dateLine: {
    ...FinanceTxnTypography.dateLine,
    fontSize: 8,
    fontWeight: "700" as const,
    color: Theme.textMuted,
  },
  fieldLabel: {
    ...FinanceTxnTypography.fieldLabel,
    fontSize: 8,
    fontWeight: "700" as const,
    color: Theme.textMuted,
  },
  specLabel: {
    ...FinanceTxnTypography.fieldLabel,
    fontSize: 7,
    fontWeight: "700" as const,
    color: Theme.textMuted,
  },
  fieldValue: {
    ...FinanceTxnTypography.fieldValue,
    fontSize: 9,
    fontWeight: "700" as const,
    fontStyle: "normal" as const,
    color: Theme.textPrimaryDark,
    lineHeight: 12,
  },
  sectionTitle: {
    ...FinanceTxnTypography.fieldLabel,
    fontSize: 8,
    fontWeight: "700" as const,
    color: Theme.textMutedDemo,
  },
  partyTitle: {
    ...FinanceTxnTypography.partyTitle,
    fontSize: 11,
    fontWeight: "800" as const,
    fontStyle: "normal" as const,
    color: Theme.textPrimaryDark,
  },
  bodyMuted: {
    ...FinanceTxnTypography.routeWhy,
    fontSize: 9,
    fontWeight: "600" as const,
    fontStyle: "normal" as const,
    color: Theme.textMuted,
    lineHeight: 13,
  },
  buttonLabel: {
    ...FinanceTxnTypography.buttonLabel,
    fontSize: 10,
    fontWeight: "800" as const,
    letterSpacing: 0.6,
  },
  freightLabelDark: {
    ...FinanceTxnTypography.fieldLabel,
    fontSize: 8,
    fontWeight: "700" as const,
    letterSpacing: 0.5,
    color: Theme.textOnDarkMuted,
  },
  freightGridLabelDark: {
    ...FinanceTxnTypography.fieldLabel,
    fontSize: 7,
    fontWeight: "700" as const,
    letterSpacing: 0.5,
    color: Theme.textOnDarkMuted,
    marginBottom: 3,
  },
  freightGridValueDark: {
    ...FinanceTxnTypography.fieldValue,
    fontSize: 10,
    fontWeight: "800" as const,
    fontStyle: "normal" as const,
    color: Theme.textOnDark,
    lineHeight: 13,
  },
  /** White hub card / inset panels — never use onDark tokens on light surfaces. */
  freightGridLabelLight: {
    ...FinanceTxnTypography.fieldLabel,
    fontSize: 8,
    fontWeight: "700" as const,
    letterSpacing: 0.5,
    color: Theme.textRouteCard,
    marginBottom: 4,
  },
  freightGridValueLight: {
    ...FinanceTxnTypography.fieldValue,
    fontSize: 11,
    fontWeight: "800" as const,
    fontStyle: "normal" as const,
    color: Theme.textPrimaryDark,
    lineHeight: 15,
  },
  freightCurrency: {
    fontSize: 14,
    fontWeight: "800" as const,
    color: Theme.textOnDark,
    opacity: 0.85,
  },
  freightAmount: {
    fontSize: 18,
    fontWeight: "900" as const,
    color: Theme.textOnDark,
    letterSpacing: -0.35,
    fontVariant: ["tabular-nums"] as const,
  },
  heroKicker: {
    ...FinanceTxnTypography.fieldLabel,
    fontSize: 8,
    fontWeight: "700" as const,
    letterSpacing: 0.5,
    color: Theme.textOnDarkMuted,
    marginBottom: 6,
  },
  heroRoute: {
    fontSize: 12,
    fontWeight: "800" as const,
    fontStyle: "italic" as const,
    color: Theme.textOnDark,
    textTransform: "uppercase" as const,
    lineHeight: 16,
    letterSpacing: -0.2,
  },
  heroStatLabel: {
    ...FinanceTxnTypography.fieldLabel,
    fontSize: 7,
    fontWeight: "700" as const,
    color: Theme.textOnDarkMuted,
    marginBottom: 3,
  },
  heroStatValue: {
    fontSize: 10,
    fontWeight: "800" as const,
    color: Theme.textOnDark,
    fontVariant: ["tabular-nums"] as const,
  },
  modalSubtitle: {
    ...FinanceTxnTypography.fieldLabel,
    fontSize: 8,
    fontWeight: "700" as const,
    letterSpacing: 0.5,
    color: Theme.textSecondary,
    textAlign: "center" as const,
    marginTop: 4,
  },
  quoteRowName: {
    fontSize: 10,
    fontWeight: "700" as const,
    color: Theme.textBody,
  },
  quoteRowAmount: {
    fontSize: 10,
    fontWeight: "800" as const,
    color: Theme.textBody,
    fontVariant: ["tabular-nums"] as const,
  },
  quoteRowStatus: {
    ...FinanceTxnTypography.chipLabel,
    fontSize: 8,
    fontWeight: "700" as const,
    color: Theme.textMutedDemo,
  },
};

export const indentReviewHubLayout = {
  summaryCardRadius: 12,
  summaryCardPadding: 10,
  /** List / hub ticket cards (Load Center, trips hub). */
  hubCardPaddingComfort: 12,
  hubCardPaddingDense: 10,
  freightCardPadding: 8,
  freightCardRadius: 10,
  sectionGap: 8,
  insetGap: 6,
};

/** Shared elevation for white hub / ticket cards (detail, load center, bids). */
export const indentHubCardShadow = Platform.select({
  ios: {
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
  },
  android: { elevation: 2 },
  web: { boxShadow: "0 2px 12px rgba(15, 23, 42, 0.08)" },
  default: {},
});

/** Dark hero + meta row (Award / Bid modals). */
export const indentReviewHubStyles = StyleSheet.create({
  reviewHubHero: {
    borderRadius: indentReviewHubLayout.summaryCardRadius,
    backgroundColor: Theme.textPrimaryDark,
    padding: indentReviewHubLayout.summaryCardPadding,
    marginBottom: 12,
    overflow: "hidden",
    minWidth: 0,
    alignSelf: "stretch",
  },
  reviewHubHeroGlow: {
    position: "absolute",
    top: -36,
    right: -36,
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  reviewHubHeroKicker: indentReviewHubText.heroKicker,
  reviewHubHeroRoute: indentReviewHubText.heroRoute,
  reviewHubHeroMeta: {
    flexDirection: "row",
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderOnDark,
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
    minWidth: 0,
  },
  reviewHubHeroMetaCol: {
    flex: 1,
    minWidth: 0,
  },
  reviewHubHeroMetaColEnd: {
    flexShrink: 1,
    minWidth: 0,
    maxWidth: "58%",
    alignItems: "flex-end",
  },
  reviewHubHeroStatValueEnd: {
    textAlign: "right",
    alignSelf: "stretch",
  },
  reviewHubHeroStatLabel: indentReviewHubText.heroStatLabel,
  reviewHubHeroStatValue: indentReviewHubText.heroStatValue,
  bidHubHero: {
    borderRadius: indentReviewHubLayout.summaryCardRadius,
    backgroundColor: Theme.textPrimaryDark,
    padding: indentReviewHubLayout.summaryCardPadding,
    marginBottom: 12,
    overflow: "hidden",
    minWidth: 0,
    alignSelf: "stretch",
  },
  bidHubHeroGlow: {
    position: "absolute",
    top: -36,
    right: -36,
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  bidHubHeroKicker: indentReviewHubText.heroKicker,
  bidHubHeroRoute: indentReviewHubText.heroRoute,
  bidHubHeroChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 4,
  },
  bidHubChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderColor: Theme.borderOnDark,
  },
  bidHubChipText: {
    ...indentReviewHubText.chipLabel,
    color: Theme.textOnDarkMuted,
  },
  reviewHubModalSubtitle: indentReviewHubText.modalSubtitle,
  summaryCard: {
    position: "relative" as const,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: indentReviewHubLayout.summaryCardRadius,
    padding: indentReviewHubLayout.summaryCardPadding,
    marginBottom: 10,
    overflow: "hidden",
  },
  summaryRoute: {
    marginBottom: 6,
  },
  freightCard: {
    borderRadius: indentReviewHubLayout.freightCardRadius,
    padding: indentReviewHubLayout.freightCardPadding,
    marginBottom: 10,
    overflow: "hidden",
  },
  /** Load Center list + Review Hub scroll sections */
  hubTicketCard: {
    backgroundColor: Theme.cardWhite,
    borderRadius: indentReviewHubLayout.summaryCardRadius,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
  },
  hubTicketBody: {
    paddingHorizontal: indentReviewHubLayout.hubCardPaddingComfort,
    paddingTop: indentReviewHubLayout.hubCardPaddingComfort,
    paddingBottom: indentReviewHubLayout.hubCardPaddingComfort,
  },
  hubTicketBodyDense: {
    paddingHorizontal: indentReviewHubLayout.hubCardPaddingDense,
    paddingTop: indentReviewHubLayout.hubCardPaddingDense,
    paddingBottom: indentReviewHubLayout.hubCardPaddingDense,
  },
  hubSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: indentReviewHubLayout.sectionGap,
    minWidth: 0,
  },
  hubEmptyCard: {
    backgroundColor: Theme.screenBackground,
    borderRadius: indentReviewHubLayout.summaryCardRadius,
    paddingVertical: indentReviewHubLayout.hubCardPaddingComfort,
    paddingHorizontal: indentReviewHubLayout.hubCardPaddingComfort,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    alignSelf: "stretch",
    gap: indentReviewHubLayout.sectionGap,
  },
  hubEmptyRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    width: "100%",
  },
  hubEmptyCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  hubPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    backgroundColor: Theme.surfaceGray,
  },
  hubPillText: {
    ...indentReviewHubText.chipLabel,
    color: Theme.textPrimaryDark,
  },
  hubStatePill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: Theme.positiveMuted,
    borderWidth: 1,
    borderColor: Theme.positiveMutedDarkBorder,
  },
  hubStatePillText: {
    ...indentReviewHubText.chipLabel,
    color: Theme.positive,
  },
});

/** Review Hub — summary left, bids / quote scroll pane right (give + get load). */
export const indentReviewHubSplitLayout = StyleSheet.create({
  splitRow: {
    flex: 1,
    flexDirection: "row",
    minHeight: 0,
    backgroundColor: Theme.surface,
  },
  summaryPane: {
    flex: 0.44,
    minWidth: 0,
    maxWidth: 480,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: Theme.borderLight,
    backgroundColor: Theme.surface,
  },
  summaryPaneContent: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 10,
    paddingBottom: 16,
  },
  summaryPaneContentCompact: {
    paddingTop: 6,
  },
  summaryPaneContentStacked: {
    paddingTop: 8,
    paddingBottom: 0,
  },
  bidsPane: {
    flex: 1,
    minWidth: 280,
    minHeight: 0,
    backgroundColor: Theme.screenBackground,
    ...Platform.select({
      web: {
        backgroundImage:
          "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(205,233,247,0.35), transparent)",
      } as object,
      default: {},
    }),
  },
  bidsPaneHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    gap: 8,
    zIndex: 2,
    ...Platform.select({
      web: { boxShadow: "0 1px 0 rgba(15,23,42,0.04)" } as object,
      ios: {
        shadowColor: Theme.shadow,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 2,
      },
      default: {},
    }),
  },
  bidsPaneScroll: {
    flex: 1,
    minHeight: 0,
  },
  bidsPaneScrollContent: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 10,
    flexGrow: 1,
  },
  bidsPaneScrollContentCompact: {
    paddingTop: 8,
  },
});

export const indentReviewHubSpecValue = {
  ...indentReviewHubText.fieldValue,
  ...Platform.select({
    android: { includeFontPadding: false as const },
    default: {},
  }),
};
