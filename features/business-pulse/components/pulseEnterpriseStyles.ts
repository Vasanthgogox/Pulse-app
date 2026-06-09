import { Platform, StyleSheet } from "react-native";

import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";

/** Metronic demo2 profile / get-started tokens for Business Pulse. */
export const PULSE_METRONIC = {
  text: "#181C32",
  muted: "#A1A5B7",
  border: "#EFF2F5",
  canvas: "#F9F9F9",
} as const;

/** Metronic-style dashboard canvas for Business Pulse. */
export const PULSE_PAGE_BG = PULSE_METRONIC.canvas;
export const PULSE_CARD_BG = Theme.cardWhite;
/** @deprecated Desktop intelligence uses full-bleed layout; kept for exports only. */
export const PULSE_CONTENT_MAX_WIDTH = 1440;
export const PULSE_CARD_BORDER = PULSE_METRONIC.border;

export const pulseEnterpriseStyles = StyleSheet.create({
  pageCanvas: {
    flex: 1,
    backgroundColor: PULSE_PAGE_BG,
  },
  contentColumn: {
    width: "100%",
    alignSelf: "stretch",
    paddingHorizontal: Layout.screenPaddingHorizontal,
  },
  contentColumnDesktop: {
    paddingHorizontal: 16,
  },
  /** Consistent chart body alignment inside dashboard cards. */
  chartBody: {
    width: "100%",
    minHeight: 128,
    justifyContent: "center",
  },

  /** Page toolbar — title row + date pill */
  pageToolbar: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 2,
  },
  pageTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: PULSE_METRONIC.text,
    letterSpacing: -0.25,
  },
  pageBreadcrumb: {
    fontSize: 12,
    fontWeight: "500",
    color: PULSE_METRONIC.muted,
    marginTop: 2,
  },
  datePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: PULSE_CARD_BORDER,
    backgroundColor: PULSE_CARD_BG,
  },
  datePillText: {
    fontSize: 11,
    fontWeight: "600",
    color: PULSE_METRONIC.muted,
  },

  /** Filter card */
  filterCard: {
    borderWidth: 1,
    borderColor: PULSE_CARD_BORDER,
    borderRadius: 10,
    backgroundColor: PULSE_CARD_BG,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  filterTabRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 22,
    borderBottomWidth: 1.5,
    borderBottomColor: PULSE_CARD_BORDER,
  },
  filterTab: {
    position: "relative",
    paddingBottom: 10,
    paddingTop: 2,
  },
  filterTabText: {
    fontSize: 13,
    fontWeight: "500",
    color: PULSE_METRONIC.muted,
    letterSpacing: -0.1,
  },
  filterTabTextActive: {
    color: PULSE_METRONIC.text,
    fontWeight: "700",
  },
  filterTabIndicator: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: -1,
    height: 2,
    borderRadius: 1,
    backgroundColor: Theme.primary,
  },

  surfaceCard: {
    borderWidth: 1,
    borderColor: PULSE_CARD_BORDER,
    borderRadius: 10,
    backgroundColor: PULSE_CARD_BG,
    ...Platform.select({
      web: {
        boxShadow: "0 1px 2px rgba(24, 28, 50, 0.04)" as unknown as undefined,
      },
      default: {
        shadowColor: "#181C32",
        shadowOpacity: 0.04,
        shadowRadius: 3,
        shadowOffset: { width: 0, height: 1 },
        elevation: 1,
      },
    }),
  },

  dashboardCard: {
    borderWidth: 1,
    borderColor: PULSE_CARD_BORDER,
    borderRadius: 12,
    backgroundColor: PULSE_CARD_BG,
    overflow: "hidden",
    ...Platform.select({
      web: {
        boxShadow: "0 1px 3px rgba(24, 28, 50, 0.05)" as unknown as undefined,
      },
      default: {
        shadowColor: "#181C32",
        shadowOpacity: 0.05,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 1 },
        elevation: 1,
      },
    }),
  },
  dashboardCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: PULSE_CARD_BORDER,
  },
  dashboardCardTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: PULSE_METRONIC.text,
    letterSpacing: -0.2,
  },
  dashboardCardSubtitle: {
    fontSize: 11,
    fontWeight: "500",
    color: PULSE_METRONIC.muted,
    lineHeight: 15,
    marginTop: 1,
  },
  dashboardCardDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: PULSE_CARD_BORDER,
  },
  dashboardCardFooter: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
  },
  dashboardCardFooterLink: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.primary,
    textDecorationLine: "underline",
    textDecorationStyle: "dotted",
  },

  filterTrack: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: "#f4f5f8",
    borderRadius: 7,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PULSE_CARD_BORDER,
    padding: 2,
  },
  filterChip: {
    borderRadius: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    minHeight: 26,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "transparent",
  },
  filterChipActive: {
    backgroundColor: PULSE_CARD_BG,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PULSE_CARD_BORDER,
    ...Platform.select({
      web: {
        boxShadow: "0 1px 2px rgba(24,28,50,0.06)" as unknown as undefined,
      },
      default: {
        shadowColor: "#181C32",
        shadowOpacity: 0.06,
        shadowRadius: 2,
        shadowOffset: { width: 0, height: 1 },
        elevation: 1,
      },
    }),
  },
  filterChipText: {
    fontSize: 11,
    fontWeight: "500",
    color: PULSE_METRONIC.muted,
  },
  filterChipTextActive: {
    color: PULSE_METRONIC.text,
    fontWeight: "700",
  },
  filterRowLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: PULSE_METRONIC.muted,
    textTransform: "uppercase",
    letterSpacing: 0.45,
    width: 64,
    flexShrink: 0,
  },
  sectionEyebrow: {
    fontSize: 12,
    fontWeight: "600",
    color: PULSE_METRONIC.text,
    marginBottom: 6,
  },

  kpiCard: {
    flex: 1,
    minWidth: 0,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: PULSE_CARD_BORDER,
    backgroundColor: PULSE_CARD_BG,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    overflow: "hidden",
    ...Platform.select({
      web: {
        boxShadow: "0 1px 3px rgba(24, 28, 50, 0.05)" as unknown as undefined,
      },
      default: {
        shadowColor: "#181C32",
        shadowOpacity: 0.05,
        shadowRadius: 3,
        shadowOffset: { width: 0, height: 1 },
        elevation: 1,
      },
    }),
  },
  kpiAccentHealthy: {
    borderTopWidth: 3,
    borderTopColor: Theme.primary,
  },
  kpiAccentWarning: {
    borderTopWidth: 3,
    borderTopColor: "#f59e0b",
  },
  kpiAccentCritical: {
    borderTopWidth: 3,
    borderTopColor: "#ef4444",
  },
  kpiTitle: {
    fontSize: 10,
    fontWeight: "700",
    color: PULSE_METRONIC.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  kpiValue: {
    fontSize: 20,
    fontWeight: "700",
    color: PULSE_METRONIC.text,
    marginTop: 6,
    letterSpacing: -0.4,
    fontVariant: ["tabular-nums"] as unknown as undefined,
  },
  kpiInsight: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "500",
    color: PULSE_METRONIC.muted,
    marginTop: 4,
  },
  widgetCard: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: PULSE_CARD_BORDER,
    backgroundColor: PULSE_CARD_BG,
    padding: 12,
    overflow: "hidden",
  },
  statPill: {
    minWidth: 56,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: PULSE_CARD_BORDER,
    backgroundColor: PULSE_CARD_BG,
    paddingHorizontal: 8,
    paddingVertical: 6,
    alignItems: "center",
  },
  statPillValue: {
    fontSize: 12,
    fontWeight: "700",
    color: PULSE_METRONIC.text,
  },
  statPillLabel: {
    fontSize: 9,
    fontWeight: "600",
    color: PULSE_METRONIC.muted,
    textTransform: "uppercase",
    letterSpacing: 0.3,
    marginTop: 1,
  },

  /** Metronic data table */
  tableToolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: PULSE_CARD_BORDER,
    flexWrap: "wrap",
  },
  tableSearch: {
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
    backgroundColor: PULSE_CARD_BG,
  },
  tableSearchText: {
    fontSize: 12,
    color: PULSE_METRONIC.muted,
    fontWeight: "500",
  },
});
