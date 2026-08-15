import { Platform, StyleSheet } from "react-native";

import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";

const padX = Layout.screenPaddingHorizontal;

/** Matches `PartyMobileWizardShell` cardFit — centered desktop/tablet card. */
export const PARTY_WIZARD_DESKTOP_MIN_WIDTH = 720;

export const partyMobileWizardStyles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
  },
  shellColumn: {
    flex: 1,
    minHeight: 0,
  },
  /** Carded desktop/tablet: size to content instead of filling a fixed height. */
  rootFit: {
    flexGrow: 0,
    flexShrink: 1,
    backgroundColor: Theme.screenBackground,
  },
  shellColumnFit: {
    flexGrow: 0,
    flexShrink: 1,
  },
  /**
   * Carded desktop/tablet: the card is height-capped and clips overflow, so the
   * step body must shrink and scroll. Without this, a step that grows (tablet
   * phone step = on-screen keypad + invitee match card) pushes the footer
   * action out of the card and the flow can't be completed. `flexGrow: 0`
   * overrides the ScrollView default so short steps stay content-sized.
   */
  cardScroll: {
    flexGrow: 0,
    flexShrink: 1,
    minHeight: 0,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: padX,
    paddingBottom: 2,
  },
  backBtn: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: Theme.surfaceForm,
    alignItems: "center",
    justifyContent: "center",
  },
  backBtnSpacer: {
    width: 32,
  },
  progressRow: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    gap: 5,
  },
  progressDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: Theme.borderLight,
  },
  progressDotActive: {
    backgroundColor: Theme.positive,
    width: 14,
  },
  hero: {
    paddingHorizontal: padX,
    paddingBottom: 4,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: Theme.positive,
  },
  entityTitle: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1.1,
    color: Theme.positive,
    textTransform: "uppercase",
  },
  subtitle: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 15,
    color: Theme.textMuted,
  },
  errorBar: {
    marginHorizontal: padX,
    marginBottom: 6,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 9,
    backgroundColor: Theme.negativeMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#fecaca",
  },
  errorText: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.negative,
  },
  body: {
    paddingHorizontal: padX,
    paddingTop: 2,
  },
  bodyFields: {
    flex: 1,
  },
  bodyFieldsFit: {
    flexGrow: 0,
    flexShrink: 0,
  },
  bodyKeypad: {
    flex: 1,
    minHeight: 0,
    paddingBottom: 0,
    paddingHorizontal: 0,
  },
  bodyKeypadFit: {
    flexGrow: 0,
    flexShrink: 0,
    paddingBottom: 0,
    paddingHorizontal: 0,
  },
  bodyKeypadHeader: {
    paddingHorizontal: padX,
    paddingBottom: 4,
  },
  bodyKeypadContent: {
    flex: 1,
    minHeight: 0,
    width: "100%",
  },
  bodyKeypadContentFit: {
    width: "100%",
    // Carded desktop/tablet: inset the input + keypad to match the padded header
    // (the full-screen mobile layout intentionally bleeds them to the edges).
    paddingHorizontal: padX,
  },
  bodySource: {
    flexGrow: 0,
    flexShrink: 0,
  },
  stepTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
    lineHeight: 22,
  },
  stepTitleCompact: {
    fontSize: 15,
    lineHeight: 20,
  },
  stepHint: {
    marginTop: 3,
    marginBottom: 10,
    fontSize: 12,
    lineHeight: 16,
    color: Theme.textMuted,
  },
  stepHintKeypad: {
    marginTop: 3,
    marginBottom: 6,
    fontSize: 12,
    lineHeight: 16,
    color: Theme.textMuted,
  },
  sourceCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surfaceForm,
    overflow: "hidden",
  },
  sourceCardDesktop: {
    borderWidth: 0,
    borderRadius: 0,
    backgroundColor: "transparent",
    overflow: "visible",
    marginTop: 4,
  },
  sourceBlock: {
    gap: 0,
  },
  sourceBlockDesktop: {
    alignItems: "flex-start",
    gap: 12,
  },
  importPrimary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Theme.buttonPrimary,
    paddingVertical: 11,
    paddingHorizontal: 14,
    minHeight: Layout.minTouchTargetSize,
  },
  importPrimaryDesktop: {
    alignSelf: "flex-start",
    justifyContent: "flex-start",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
  },
  importPrimaryDim: {
    opacity: 0.65,
  },
  importPrimaryText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.buttonPrimaryText,
    letterSpacing: 0.2,
  },
  importError: {
    fontSize: 11,
    color: Theme.negative,
    fontWeight: "600",
    paddingHorizontal: 12,
    paddingTop: 6,
  },
  importHint: {
    fontSize: 11,
    color: Theme.textMuted,
    lineHeight: 15,
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 4,
  },
  importHintDesktop: {
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
    fontSize: 12,
    lineHeight: 18,
    maxWidth: 420,
  },
  importErrorDesktop: {
    paddingHorizontal: 0,
    paddingTop: 0,
  },
  sourceDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Theme.borderLight,
  },
  sourceDividerDesktop: {
    height: 0,
    marginVertical: 0,
    backgroundColor: "transparent",
  },
  manualLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 10,
    minHeight: Layout.minTouchTargetSize,
  },
  manualLinkDesktop: {
    alignSelf: "flex-start",
    justifyContent: "flex-start",
    paddingHorizontal: 0,
    paddingVertical: 8,
  },
  manualLinkText: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.primary,
  },
  fieldBlock: {
    gap: 6,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.7,
    color: Theme.textMuted,
  },
  optionalPill: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 0.4,
  },
  input: {
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 11,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "web" ? 10 : 11,
    fontSize: 15,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    backgroundColor: Theme.surfaceForm,
    minHeight: Layout.minTouchTargetSize,
    ...Platform.select({
      web: { outlineStyle: "none" } as object,
    }),
  },
  skipLink: {
    alignSelf: "flex-start",
    paddingVertical: 4,
    minHeight: Layout.minTouchTargetSize,
    justifyContent: "center",
  },
  skipLinkText: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  phoneRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 11,
    paddingHorizontal: 10,
    backgroundColor: Theme.surfaceForm,
    minHeight: Layout.minTouchTargetSize,
  },
  phoneCc: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingRight: 8,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: Theme.borderLight,
  },
  phoneCcText: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  phoneInput: {
    flex: 1,
    borderWidth: 0,
    backgroundColor: "transparent",
    paddingHorizontal: 0,
    minHeight: undefined,
  },
  presetPress: {
    justifyContent: "center",
    minHeight: Layout.minTouchTargetSize,
  },
  presetValue: {
    fontSize: 15,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  presetPlaceholder: {
    fontSize: 14,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  chipGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surfaceForm,
    maxWidth: "48%",
  },
  chipActive: {
    borderColor: Theme.primary,
    backgroundColor: "rgba(99,102,241,0.1)",
  },
  chipText: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
    textAlign: "center",
  },
  chipTextActive: {
    color: Theme.primary,
  },
  specHint: {
    fontSize: 10,
    color: Theme.textMuted,
    marginTop: 2,
  },
  footer: {
    alignItems: "flex-end",
    paddingHorizontal: padX,
    paddingTop: 4,
    gap: 4,
  },
  fab: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Theme.textPrimaryDark,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 5,
    elevation: 3,
  },
  fabDisabled: {
    opacity: 0.4,
  },
  footerHint: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginRight: 2,
  },
  reviewOverlay: {
    flex: 1,
    backgroundColor: Theme.overlayBackdrop,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  reviewCard: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 14,
    alignItems: "center",
    gap: 6,
    ...Platform.select({
      web: {
        boxShadow:
          "0 28px 64px -24px rgba(15,23,42,0.22), 0 2px 6px rgba(15,23,42,0.05)",
      } as object,
      default: {
        shadowColor: Theme.shadow,
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.14,
        shadowRadius: 20,
        elevation: 12,
      },
    }),
  },
  reviewAnimationWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.buttonPrimary,
    borderWidth: 1,
    borderColor: Theme.buttonPrimaryBorder,
    marginBottom: 2,
  },
  reviewAnimation: {
    width: 42,
    height: 42,
  },
  reviewCardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    textAlign: "center",
    letterSpacing: -0.2,
    lineHeight: 20,
  },
  reviewCardMessage: {
    fontSize: 12,
    lineHeight: 16,
    color: Theme.textMuted,
    textAlign: "center",
    paddingHorizontal: 4,
    marginBottom: 2,
  },
  reviewSummaryScroll: {
    width: "100%",
    marginTop: 2,
  },
  reviewSummaryScrollContent: {
    paddingBottom: 2,
    gap: 0,
  },
  reviewFooterExtra: {
    width: "100%",
  },
  reviewConfirmBtn: {
    marginTop: 8,
    minWidth: 120,
    width: "100%",
    minHeight: 44,
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 10,
    backgroundColor: Theme.buttonPrimary,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  reviewConfirmBtnDisabled: {
    opacity: 0.45,
  },
  reviewConfirmBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.buttonPrimaryText,
    letterSpacing: 0.2,
  },
  reviewEditLink: {
    minHeight: 40,
    justifyContent: "center",
    paddingVertical: 2,
  },
  reviewEditLinkText: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textMuted,
  },
});
