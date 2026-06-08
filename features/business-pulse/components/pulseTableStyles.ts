import { StyleSheet } from "react-native";

import Theme from "@/constants/Theme";
import {
  PULSE_CARD_BORDER,
  PULSE_METRONIC,
} from "@/features/business-pulse/components/pulseEnterpriseStyles";

/** Shared Metronic data-table tokens — used by ranking, drilldown, and aging tables. */
export const pulseTableStyles = StyleSheet.create({
  shell: {
    width: "100%",
    overflow: "hidden",
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: PULSE_CARD_BORDER,
    flexWrap: "wrap",
  },
  toolbarLeft: {
    flex: 1,
    minWidth: 140,
    maxWidth: 260,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: PULSE_CARD_BORDER,
    backgroundColor: Theme.cardWhite,
  },
  toolbarSearchText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "500",
    color: PULSE_METRONIC.muted,
  },
  toolbarMeta: {
    alignItems: "flex-end",
    gap: 1,
    minWidth: 80,
  },
  toolbarMetaTitle: {
    fontSize: 11,
    fontWeight: "600",
    color: PULSE_METRONIC.text,
  },
  toolbarMetaSub: {
    fontSize: 10,
    fontWeight: "500",
    color: PULSE_METRONIC.muted,
  },
  toolbarActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
  },
  toolbarBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderColor: PULSE_CARD_BORDER,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: Theme.cardWhite,
    minHeight: 30,
  },
  toolbarBtnText: {
    fontSize: 11,
    fontWeight: "600",
    color: PULSE_METRONIC.text,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: "#f9fafb",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: PULSE_CARD_BORDER,
    gap: 10,
    minHeight: 36,
  },
  headerCell: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  headerText: {
    fontSize: 11,
    fontWeight: "600",
    color: PULSE_METRONIC.muted,
  },
  headerTextRight: {
    textAlign: "right",
  },
  dataRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: PULSE_CARD_BORDER,
    backgroundColor: Theme.cardWhite,
    gap: 10,
    minHeight: 44,
  },
  dataRowPressed: {
    backgroundColor: "#f9fafb",
  },
  dataRowSelected: {
    backgroundColor: "#f4f6fa",
  },
  toneWarning: {
    backgroundColor: "#fffdf5",
  },
  toneCritical: {
    backgroundColor: "#fffafa",
  },
  primaryCell: {
    gap: 2,
    minWidth: 0,
  },
  primaryName: {
    fontSize: 12,
    fontWeight: "600",
    color: PULSE_METRONIC.text,
    letterSpacing: -0.05,
  },
  primaryMeta: {
    fontSize: 11,
    fontWeight: "500",
    color: PULSE_METRONIC.muted,
  },
  cellText: {
    fontSize: 12,
    fontWeight: "500",
    color: PULSE_METRONIC.muted,
  },
  cellTextRight: {
    textAlign: "right",
  },
  cellMoney: {
    fontSize: 12,
    fontWeight: "600",
    color: PULSE_METRONIC.text,
    fontVariant: ["tabular-nums"],
  },
  positive: {
    color: "#047857",
  },
  negative: {
    color: Theme.teslaRed,
  },
  rowMenu: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: PULSE_CARD_BORDER,
    backgroundColor: Theme.cardWhite,
    gap: 10,
    flexWrap: "wrap",
  },
  footerMeta: {
    fontSize: 11,
    fontWeight: "500",
    color: PULSE_METRONIC.muted,
  },
  footerNav: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  footerNavBtn: {
    minWidth: 28,
    height: 28,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: PULSE_CARD_BORDER,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
    backgroundColor: Theme.cardWhite,
  },
  footerNavBtnActive: {
    backgroundColor: Theme.primary,
    borderColor: Theme.primary,
  },
  footerNavBtnText: {
    fontSize: 11,
    fontWeight: "600",
    color: PULSE_METRONIC.muted,
  },
  footerNavBtnTextActive: {
    color: Theme.textOnPrimary,
  },
  empty: {
    fontSize: 12,
    fontWeight: "500",
    color: PULSE_METRONIC.muted,
    paddingHorizontal: 14,
    paddingVertical: 22,
    textAlign: "center",
  },
});
