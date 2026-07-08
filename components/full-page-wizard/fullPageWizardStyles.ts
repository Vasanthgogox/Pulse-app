import { StyleSheet } from "react-native";
import Theme from "@/constants/Theme";

/** Purple accent — matches attribution wizard & Theme.primary. */
export const WIZARD_ACCENT = Theme.primary;
export const WIZARD_ACCENT_SOFT = "rgba(79, 70, 229, 0.08)";
export const WIZARD_ACCENT_BORDER = "rgba(99, 102, 241, 0.35)";
export const WIZARD_ACCENT_MUTED = "rgba(238, 242, 255, 0.9)";
/** Avatar size for wizard context rows + 2-col selection tiles (attribution parity). */
export const WIZARD_PARTY_AVATAR_SIZE = 30;
/** Party selection grids on compact / mobile layouts. */
export const WIZARD_PARTY_GRID_COLUMNS = 2;
/** Desktop party picker — four tiles per row (create trip / attribution parity). */
export const WIZARD_PARTY_GRID_COLUMNS_DESKTOP = 4;

/** Shared light full-page wizard chrome (attribution / create trip / load / allocation). */
export const fullPageWizardStyles = StyleSheet.create({
  root: {
    flex: 1,
    width: "100%",
    alignItems: "center",
    backgroundColor: Theme.screenBackground,
  },
  pageRoot: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: 16,
    gap: 12,
    width: "100%",
    maxWidth: 860,
    alignSelf: "center",
  },
  /** Inside desktop insight frame — main column fills rail layout. */
  pageRootInFrame: {
    maxWidth: "100%",
    alignSelf: "stretch",
  },
  /** Enterprise desktop — denser chrome, scrollable multi-section form. */
  pageRootDesktopForm: {
    gap: 10,
    paddingHorizontal: 0,
  },
  pageRootKeypad: {
    gap: 8,
  },
  pageHeaderBlock: {
    gap: 4,
    flexShrink: 0,
  },
  pageHeaderBlockKeypad: {
    gap: 2,
  },
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 28,
  },
  headerBackBtn: {
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  headerBackBtnText: {
    color: Theme.textPrimaryDark,
    fontSize: 12,
    fontWeight: "700",
  },
  headerStepText: {
    color: Theme.textMuted,
    fontSize: 11,
    fontWeight: "700",
  },
  title: {
    color: Theme.textPrimaryDark,
    fontSize: 22,
    fontWeight: "800",
  },
  titleKeypad: {
    fontSize: 20,
    lineHeight: 26,
  },
  subtitle: {
    color: Theme.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  subtitleKeypad: {
    fontSize: 12,
    lineHeight: 17,
  },
  wizardStepRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  wizardStepItem: {
    flex: 1,
    alignItems: "center",
    gap: 4,
    minWidth: 0,
  },
  wizardStepCircle: {
    width: 24,
    height: 24,
    backgroundColor: Theme.cardWhite,
    alignItems: "center",
    justifyContent: "center",
  },
  wizardStepCircleActive: {
    backgroundColor: Theme.buttonPrimary,
  },
  wizardStepCircleDone: {
    backgroundColor: Theme.buttonPrimary,
  },
  wizardStepCircleText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textMuted,
  },
  wizardStepCircleTextActive: {
    color: Theme.buttonPrimaryText,
  },
  wizardStepText: {
    fontSize: 10,
    color: Theme.textMuted,
    fontWeight: "600",
    textAlign: "center",
  },
  wizardStepTextActive: {
    color: Theme.textPrimaryDark,
    fontWeight: "700",
  },
  bodyScroll: {
    flex: 1,
    minHeight: 0,
  },
  bodyScrollContent: {
    gap: 12,
    paddingBottom: 8,
  },
  bodyFill: {
    flex: 1,
    minHeight: 0,
    gap: 12,
  },
  bodyWide: {
    width: "100%",
    maxWidth: 860,
    alignSelf: "center",
  },
  /** Flat step content — no nested card chrome inside the wizard shell. */
  wizardStepContentFlat: {
    width: "100%",
    gap: 12,
    paddingBottom: 4,
  },
  partyRow: {
    flexDirection: "row",
    gap: 10,
    width: "100%",
    alignSelf: "stretch",
  },
  partyRowStack: {
    flexDirection: "column",
  },
  partyCard: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: Theme.cardWhite,
    padding: 10,
  },
  /** Full-width selectable party tile inside 2-col wizard grids. */
  partyCardSelectable: {
    width: "100%",
    alignSelf: "stretch",
  },
  partyCardSelected: {
    backgroundColor: WIZARD_ACCENT_SOFT,
  },
  partyTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  partyLabel: {
    color: Theme.textMuted,
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    fontWeight: "500",
  },
  partyName: {
    color: Theme.textPrimaryDark,
    fontSize: 12,
    fontWeight: "500",
    lineHeight: 16,
  },
  partySubtitle: {
    color: Theme.textSecondary,
    fontSize: 11,
    lineHeight: 14,
    marginTop: 1,
  },
  block: {
    backgroundColor: Theme.cardWhite,
    padding: 12,
    gap: 8,
  },
  blockTitle: {
    color: Theme.textPrimaryDark,
    fontSize: 13,
    fontWeight: "600",
  },
  blockLine: {
    color: Theme.textPrimaryDark,
    fontSize: 12,
    fontWeight: "500",
  },
  blockMeta: {
    color: Theme.textSecondary,
    fontSize: 12,
  },
  modeRow: {
    flexDirection: "row",
    gap: 8,
  },
  modeChip: {
    flex: 1,
    minWidth: 0,
    backgroundColor: Theme.screenBackground,
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignItems: "center",
  },
  modeChipActive: {
    backgroundColor: WIZARD_ACCENT_SOFT,
  },
  modeChipText: {
    fontSize: 11,
    color: Theme.textSecondary,
    fontWeight: "600",
  },
  modeChipTextActive: {
    color: WIZARD_ACCENT,
  },
  footerBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
    paddingTop: 10,
  },
  footerSummary: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
    textAlign: "center",
    lineHeight: 15,
    marginBottom: 4,
  },
  cancelBtn: {
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minWidth: 88,
    alignItems: "center",
  },
  cancelBtnText: {
    color: Theme.textSecondary,
    fontSize: 12,
    fontWeight: "700",
  },
  submitBtn: {
    flex: 1,
    backgroundColor: Theme.buttonPrimary,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 42,
  },
  submitBtnDisabled: {
    opacity: 0.55,
  },
  submitBtnText: {
    color: Theme.buttonPrimaryText,
    fontSize: 12,
    fontWeight: "800",
  },
  tertiaryBtn: {
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  tertiaryBtnDisabled: {
    opacity: 0.5,
  },
  tertiaryBtnText: {
    color: Theme.textPrimaryDark,
    fontSize: 12,
    fontWeight: "700",
  },
  footerHint: {
    color: Theme.textMuted,
    fontSize: 11,
    lineHeight: 15,
    textAlign: "center",
    marginTop: 6,
  },
  /** Form section card — matches wizard block styling inside step bodies. */
  formSectionCard: {
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 8,
  },
  formSectionTitle: {
    color: Theme.textPrimaryDark,
    fontSize: 14,
    fontWeight: "700",
  },
  formSectionSubtitle: {
    color: Theme.textSecondary,
    fontSize: 12,
    lineHeight: 17,
  },
  formLabel: {
    color: Theme.textMuted,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.35,
    textTransform: "uppercase",
  },
  formInput: {
    backgroundColor: Theme.screenBackground,
    color: Theme.textPrimaryDark,
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  clientListWrap: {
    backgroundColor: Theme.screenBackground,
    overflow: "hidden",
  },
  /** Two-column attribution-style entity picker grid. */
  selectionGridWrap: {
    width: "100%",
    alignSelf: "stretch",
  },
  wizardPickerListShell: {
    width: "100%",
    alignSelf: "stretch",
    backgroundColor: Theme.screenBackground,
    overflow: "hidden",
    padding: 0,
  },
  wizardPickerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    width: "100%",
  },
  wizardPickerTitle: {
    flex: 1,
    minWidth: 0,
    color: Theme.textMuted,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.45,
    textTransform: "uppercase",
  },
  wizardPickerCountBadge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    backgroundColor: WIZARD_ACCENT_SOFT,
    flexShrink: 0,
  },
  wizardPickerCountBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: WIZARD_ACCENT,
  },
  wizardPickerFooterHint: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "500",
    color: Theme.textMuted,
    textAlign: "center",
    marginTop: 2,
  },
  wizardPickerSecondaryBtn: {
    alignSelf: "stretch",
    minHeight: 44,
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  wizardPickerSecondaryBtnText: {
    color: WIZARD_ACCENT,
    fontSize: 12,
    fontWeight: "700",
  },
  selectionGridScrollContent: {
    paddingVertical: 8,
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  selectionGridScrollContentFlat: {
    paddingVertical: 4,
    paddingHorizontal: 0,
    paddingBottom: 4,
  },
  selectionGrid: {
    gap: 10,
    width: "100%",
  },
  selectionGridRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 10,
    width: "100%",
  },
  selectionGridCell: {
    flex: 1,
    minWidth: 0,
    alignSelf: "stretch",
  },
  selectionGridTile: {
    alignItems: "center",
    justifyContent: "flex-start",
    backgroundColor: Theme.cardWhite,
    paddingVertical: 10,
    paddingHorizontal: 6,
    minHeight: 108,
  },
  selectionGridTileSelected: {
    backgroundColor: WIZARD_ACCENT_SOFT,
  },
  selectionGridCheckParty: {
    right: -4,
    bottom: -4,
    width: 16,
    height: 16,
  },
  selectionGridTileDisabled: {
    opacity: 0.55,
  },
  selectionGridAvatarWrap: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  selectionGridCheck: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 18,
    height: 18,
    backgroundColor: WIZARD_ACCENT,
    alignItems: "center",
    justifyContent: "center",
  },
  selectionGridName: {
    marginTop: 8,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
    textAlign: "center",
    width: "100%",
    paddingHorizontal: 2,
  },
  selectionGridNameCompact: {
    marginTop: 6,
    fontSize: 10,
    lineHeight: 13,
  },
  selectionGridNameDisabled: {
    color: Theme.textMuted,
  },
  selectionGridMeta: {
    marginTop: 2,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: "500",
    color: Theme.textSecondary,
    textAlign: "center",
    width: "100%",
    paddingHorizontal: 2,
  },
  selectionGridMetaWarn: {
    color: Theme.warning,
    fontWeight: "700",
  },
  clientLoadingWrap: {
    paddingVertical: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  clientRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  clientRowSelected: {
    backgroundColor: WIZARD_ACCENT_SOFT,
    borderLeftWidth: 2,
    borderLeftColor: WIZARD_ACCENT,
  },
  /** Horizontal shipper / client row — attribution picker style. */
  shipperMarkCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Theme.screenBackground,
    padding: 10,
  },
  shipperWarningCard: {
    backgroundColor: WIZARD_ACCENT_MUTED,
    padding: 10,
    gap: 8,
  },
  shipperWarningText: {
    color: "#4D3636",
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "600",
  },
  addClientBtn: {
    alignSelf: "stretch",
    minHeight: 44,
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  addClientBtnText: {
    color: WIZARD_ACCENT,
    fontSize: 12,
    fontWeight: "600",
  },
  /** Wizard step field label — matches attribution block titles. */
  wizardFieldLabel: {
    color: Theme.textMuted,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.35,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  /** Wizard step text input — 14px black body (not dense 9–10px form). */
  wizardFieldInput: {
    backgroundColor: Theme.screenBackground,
    color: Theme.textPrimaryDark,
    fontSize: 12,
    fontWeight: "400",
    fontStyle: "normal",
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 40,
    marginBottom: 0,
    width: "100%",
    alignSelf: "stretch",
  },
  wizardStepBody: {
    width: "100%",
    gap: 12,
    paddingBottom: 4,
  },
  /** Prior-step summary cards stacked above the active field (attribution-style). */
  wizardPriorSelectionsStack: {
    width: "100%",
    gap: 8,
    marginBottom: 4,
  },
  wizardFieldBlock: {
    width: "100%",
    gap: 6,
  },
  /** Flat list block — no outer card when parent already uses formSectionCard. */
  blockFlat: {
    width: "100%",
    alignSelf: "stretch",
    gap: 10,
  },
  wizardPickerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    backgroundColor: Theme.screenBackground,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 44,
  },
  wizardPickerBtnEmpty: {
    borderStyle: "dashed",
  },
  wizardPickerBtnText: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    lineHeight: 20,
  },
  wizardPickerBtnPlaceholder: {
    color: Theme.textMuted,
    fontWeight: "500",
  },
  wizardDateTouchable: {
    minHeight: 44,
    backgroundColor: Theme.screenBackground,
    paddingHorizontal: 12,
    justifyContent: "center",
  },
  wizardDateText: {
    fontSize: 14,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  wizardDatePlaceholder: {
    fontSize: 14,
    fontWeight: "500",
    color: Theme.textMuted,
  },
  quickDateRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  quickDateChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: Theme.screenBackground,
  },
  quickDateChipActive: {
    backgroundColor: WIZARD_ACCENT_SOFT,
  },
  quickDateChipText: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  quickDateChipTextActive: {
    color: WIZARD_ACCENT,
    fontWeight: "800",
  },
  /** Pay-style centered numeric entry inside wizard shell (attribution / supplier target parity). */
  wizardKeypadRoot: {
    flex: 1,
    minHeight: 0,
    width: "100%",
    justifyContent: "space-between",
  },
  wizardKeypadBody: {
    flex: 1,
    minHeight: 0,
    width: "100%",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    paddingTop: 4,
  },
  wizardKeypadPartyWrap: {
    alignSelf: "stretch",
    width: "100%",
    marginBottom: 2,
  },
  wizardKeypadFieldSwitch: {
    alignSelf: "stretch",
    width: "100%",
    marginBottom: 4,
  },
  wizardKeypadLabelBlock: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    gap: 4,
    width: "100%",
  },
  wizardKeypadTitle: {
    color: Theme.textPrimaryDark,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 19,
    textAlign: "center",
  },
  wizardKeypadHint: {
    color: Theme.textSecondary,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "500",
    textAlign: "center",
    paddingHorizontal: 8,
  },
  wizardKeypadError: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.destructive,
    textAlign: "center",
    paddingHorizontal: 12,
  },
  /** Desktop: amount + keypad side-by-side inside wizard body. */
  wizardKeypadDesktopRow: {
    flex: 1,
    minHeight: 0,
    width: "100%",
    flexDirection: "row",
    alignItems: "stretch",
    gap: 16,
  },
  wizardKeypadAmountPane: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
  },
  wizardKeypadKeysPane: {
    width: 320,
    maxWidth: "42%",
    flexShrink: 0,
    justifyContent: "center",
  },
  wizardKeypadKeysCard: {
    backgroundColor: Theme.surface,
    overflow: "hidden",
    paddingTop: 8,
    paddingBottom: 4,
  },
  /** Full-width desktop wizard with optional marketing side rails. */
  desktopFrameSingle: {
    flex: 1,
    width: "100%",
    alignItems: "center",
  },
  desktopFrameRow: {
    flex: 1,
    width: "100%",
    maxWidth: 1680,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "stretch",
    gap: 16,
    paddingHorizontal: 24,
  },
  desktopFrameMain: {
    flex: 1,
    minWidth: 0,
    alignSelf: "stretch",
  },
  desktopInsightRail: {
    width: 220,
    flexShrink: 0,
    gap: 12,
    paddingTop: 8,
  },
  desktopInsightRailLeft: {
    paddingRight: 4,
  },
  desktopInsightRailRight: {
    paddingLeft: 4,
  },
  desktopInsightRailRightStack: {
    width: 220,
    flexShrink: 0,
    gap: 12,
    paddingTop: 8,
  },
  desktopInsightRailHeading: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: Theme.textMuted,
    marginBottom: 2,
  },
  desktopInsightCard: {
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 6,
    overflow: "hidden",
    position: "relative",
    minHeight: 102,
  },
  desktopInsightCardSingle: {
    minHeight: 128,
    paddingVertical: 14,
    gap: 8,
  },
  desktopInsightWatermark: {
    position: "absolute",
    right: -14,
    bottom: -10,
    opacity: 0.1,
  },
  desktopInsightWatermarkSingle: {
    right: -8,
    bottom: -6,
    opacity: 0.14,
  },
  desktopInsightEyebrow: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.35,
    textTransform: "uppercase",
  },
  desktopInsightTitle: {
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 18,
    color: Theme.textPrimaryDark,
  },
  desktopInsightBody: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "500",
    color: Theme.textSecondary,
  },
  desktopContextPanel: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 6,
  },
  desktopContextEyebrow: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.45,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  desktopContextTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    lineHeight: 18,
  },
  desktopContextLine: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "500",
    color: Theme.textSecondary,
  },
});
