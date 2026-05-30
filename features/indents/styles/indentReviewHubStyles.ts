/**
 * Shared typography + layout for indent detail (GIVE LOAD owner / GET LOAD supplier)
 * and Review Hub modals (Award, Bid). Compact txn-page rhythm, heavier weights.
 */
import { Platform, StyleSheet } from "react-native";

import { FinanceTxnTypography } from "@/constants/FinanceTxnTypography";
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
  summaryCardRadius: 14,
  summaryCardPadding: 12,
  freightCardPadding: 10,
  freightCardRadius: 12,
};

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
});

export const indentReviewHubSpecValue = {
  ...indentReviewHubText.fieldValue,
  ...Platform.select({
    android: { includeFontPadding: false as const },
    default: {},
  }),
};
