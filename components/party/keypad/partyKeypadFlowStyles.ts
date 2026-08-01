import { Platform, StyleSheet } from "react-native";

import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";

export const partyKeypadFlowStyles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 0,
    width: "100%",
    justifyContent: "space-between",
  },
  main: {
    flexShrink: 1,
    minHeight: 0,
  },
  formatHint: {
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textMuted,
    marginBottom: 8,
  },
  formatMaskRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 12,
    flexWrap: "wrap",
  },
  formatMaskSeg: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.4,
    color: Theme.textMuted,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
  },
  formatMaskSegDone: {
    borderColor: Theme.positive,
    color: Theme.positive,
    backgroundColor: Theme.positiveMuted,
  },
  mainPadded: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    flexShrink: 1,
    minHeight: 0,
  },
  /** Inside a wizard shell (full-page or carded) — the shell already pads. */
  mainPaddedWizard: {
    flexShrink: 1,
    minHeight: 0,
    paddingHorizontal: 0,
  },
  displayRow: {
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === "web" ? 16 : 18,
    minHeight: 60,
    backgroundColor: Theme.cardWhite,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 4,
      },
      android: { elevation: 1 },
      default: {},
    }),
  },
  displayRowError: {
    borderColor: Theme.destructive,
    borderWidth: 2,
    backgroundColor: "#fef2f2",
  },
  leadingIcon: {
    marginRight: 10,
  },
  /** Text + caret sit together so the caret follows digits (not the row’s right edge). */
  displayValueCluster: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
  },
  displayValue: {
    flexGrow: 0,
    flexShrink: 1,
    fontSize: 22,
    fontWeight: "600",
    letterSpacing: 2,
    color: Theme.textPrimaryDark,
    ...Platform.select({
      ios: { fontVariant: ["tabular-nums"] },
      default: {},
    }),
  },
  displayPlaceholder: {
    color: Theme.textMuted,
    fontWeight: "500",
    letterSpacing: 1.5,
  },
  cursor: {
    width: 2,
    height: 26,
    borderRadius: 1,
    backgroundColor: Theme.positive,
    marginLeft: 2,
    flexShrink: 0,
  },
  keypadDock: {
    flexShrink: 0,
    alignSelf: "stretch",
    width: "100%",
    paddingTop: 14,
    paddingBottom: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
    backgroundColor: Theme.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    marginHorizontal: -Layout.screenPaddingHorizontal,
    paddingHorizontal: Layout.screenPaddingHorizontal,
  },
  /** Wizard shell — no negative bleed; keypad stays above footer. */
  keypadDockWizard: {
    flexShrink: 0,
    alignSelf: "stretch",
    width: "100%",
    paddingTop: 6,
    paddingBottom: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
    backgroundColor: Theme.surface,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    marginHorizontal: 0,
    paddingHorizontal: 0,
    marginTop: "auto",
  },
  /**
   * Edge-to-edge GPay dock (pageRootKeypad uses paddingHorizontal: 0).
   * Keys pad internally; chrome aligns with the screen edges.
   */
  keypadDockWizardBleed: {
    marginHorizontal: 0,
    width: "100%",
    alignSelf: "stretch",
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 10,
    borderTopWidth: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    backgroundColor: Theme.surfaceGray,
  },
  /** Tighter dock so wizard shell footer (Continue) stays visible on phones. */
  keypadDockWizardCompact: {
    paddingTop: 4,
    paddingBottom: 2,
    paddingHorizontal: 8,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    marginTop: 0,
  },
  /** Full-bleed iOS-style dial pad (no side margins, system gray chrome). */
  keypadDockApple: {
    flexShrink: 0,
    alignSelf: "stretch",
    width: "100%",
    marginTop: "auto",
    paddingTop: 0,
    paddingBottom: 0,
    marginHorizontal: 0,
    borderTopWidth: 0,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    backgroundColor: "transparent",
  },
  extras: {
    width: "100%",
    flexShrink: 0,
    gap: 8,
    marginTop: 12,
  },
  actionBarHost: {
    flexShrink: 0,
    width: "100%",
    zIndex: 5,
  },
  hiddenInput: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0,
    left: -9999,
  },
});

export const partyKeypadDisplayMono = Platform.select({
  ios: { fontFamily: "Menlo" as const },
  android: { fontFamily: "monospace" as const },
  web: {
    fontFamily:
      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" as const,
  },
  default: {},
});
