/**
 * Supplier profile hub styles — extends the Metronic network tokens
 * and client profile atoms with supplier-specific layout primitives.
 */
import Theme from "@/constants/Theme";
import { METRONIC } from "@/features/network/components/desktop/networkDesktopHub.styles";
import { Platform, StyleSheet } from "react-native";

export { METRONIC } from "@/features/network/components/desktop/networkDesktopHub.styles";
export { networkDesktopHubStyles as hubStyles } from "@/features/network/components/desktop/networkDesktopHub.styles";
export { clientProfileStyles as spStyles } from "@/features/clients/components/desktop/clientProfileHub.styles";

/** Additional atoms not in the client profile styles — merged into spStyles override. */
export const supplierStyles = StyleSheet.create({
  // Hero stats strip
  heroStatsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 0,
    marginTop: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: METRONIC.border,
    backgroundColor: "rgba(255,255,255,0.85)",
    overflow: "hidden",
  },
  heroStatItem: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  heroStatValue: {
    fontSize: 16,
    fontWeight: "800",
    color: METRONIC.text,
    letterSpacing: -0.3,
  },
  heroStatLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: METRONIC.muted,
    letterSpacing: 0.6,
    marginTop: 2,
    textTransform: "uppercase",
  },
  heroStatDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: "stretch",
    backgroundColor: METRONIC.border,
  },

  // Two-column overview
  overviewGrid: {
    flexDirection: "row",
    gap: 16,
    alignItems: "flex-start",
  },
  overviewLeft: {
    flex: 3,
    minWidth: 0,
    gap: 0,
  },
  overviewRight: {
    flex: 2,
    minWidth: 0,
    gap: 0,
  },

  // KPI cards
  kpiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 0,
  },
  kpiCard: {
    minWidth: 140,
    flexGrow: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: METRONIC.border,
    backgroundColor: Theme.cardWhite,
    padding: 14,
    gap: 4,
    alignItems: "center",
  },
  kpiIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: "#F9FAFB",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  kpiValue: {
    fontSize: 18,
    fontWeight: "800",
    color: METRONIC.text,
    letterSpacing: -0.3,
  },
  kpiLabel: {
    fontSize: 11,
    fontWeight: "500",
    color: METRONIC.subtle,
    textAlign: "center",
  },

  // Data card wrapper
  dataCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: METRONIC.border,
    backgroundColor: Theme.cardWhite,
    padding: 16,
  },

  // Info rows (label: value pairs)
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: 7,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: METRONIC.border,
    gap: 16,
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: "500",
    color: METRONIC.subtle,
    width: 120,
    flexShrink: 0,
  },
  infoValue: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    color: METRONIC.text,
    textAlign: "right",
    flexWrap: "wrap",
  },

  // Contracts
  contractsHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  contractCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: METRONIC.border,
    backgroundColor: Theme.cardWhite,
    padding: 16,
    marginBottom: 12,
    gap: 10,
  },
  contractCardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  contractCardLeft: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  contractCardTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: METRONIC.text,
  },
  contractCardMeta: {
    fontSize: 12,
    fontWeight: "500",
    color: METRONIC.subtle,
  },
  contractStatusPill: {
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 3,
    flexShrink: 0,
  },
  contractSubTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: METRONIC.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 4,
    marginBottom: 6,
  },
  contractRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: METRONIC.border,
  },
  contractName: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: METRONIC.text,
  },
  contractExpiry: {
    fontSize: 11,
    fontWeight: "500",
    color: METRONIC.muted,
  },

  // SLA badges
  slaBadgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  slaChip: {
    borderRadius: 6,
    borderWidth: 1,
    borderColor: METRONIC.border,
    backgroundColor: "#F9FAFB",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  slaChipText: {
    fontSize: 11,
    fontWeight: "600",
    color: METRONIC.subtle,
  },

  // Compliance health
  complianceHealthRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 20,
  },
  complianceHealthCard: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: METRONIC.border,
    backgroundColor: Theme.cardWhite,
    padding: 16,
    alignItems: "center",
    gap: 6,
  },
  complianceHealthDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  complianceHealthCount: {
    fontSize: 24,
    fontWeight: "800",
    color: METRONIC.text,
    letterSpacing: -0.5,
  },
  complianceHealthLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: METRONIC.subtle,
  },

  // Alert config
  alertConfigRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
    marginTop: 10,
    padding: 14,
    borderRadius: 10,
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: METRONIC.border,
  },
  alertConfigChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#EEF6FF",
    backgroundColor: "#EEF6FF",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  alertConfigText: {
    fontSize: 11,
    fontWeight: "700",
    color: METRONIC.link,
  },
  alertConfigHint: {
    fontSize: 11,
    fontWeight: "500",
    color: METRONIC.muted,
    flex: 1,
    minWidth: 200,
  },

  // Empty action card
  emptyActionCard: {
    padding: 48,
    alignItems: "center",
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: METRONIC.border,
    borderStyle: "dashed",
    backgroundColor: "#FAFAFA",
  },
  emptyActionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: METRONIC.text,
    marginTop: 8,
  },
  emptyActionSub: {
    fontSize: 13,
    fontWeight: "500",
    color: METRONIC.subtle,
    textAlign: "center",
    maxWidth: 400,
    lineHeight: 20,
  },

  // Add button
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: METRONIC.text,
  },
  addBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textOnPrimary,
    letterSpacing: 0.2,
  },

  // Warehouse
  warehouseGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  warehouseCard: {
    width: "47%",
    minWidth: 280,
    flexGrow: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: METRONIC.border,
    backgroundColor: Theme.cardWhite,
    padding: 16,
    gap: 2,
  },
  warehouseCardHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  warehouseCardName: {
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    color: METRONIC.text,
  },
  warehouseCardCode: {
    fontSize: 10,
    fontWeight: "700",
    color: METRONIC.muted,
    letterSpacing: 0.5,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: METRONIC.border,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },

  // Performance
  performanceHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: METRONIC.border,
    backgroundColor: Theme.cardWhite,
    marginBottom: 20,
  },
  performanceHeaderMeta: {
    flex: 1,
    gap: 6,
  },
  performanceGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 12,
  },
  performanceMetricCard: {
    width: "18%",
    minWidth: 130,
    flexGrow: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: METRONIC.border,
    backgroundColor: Theme.cardWhite,
    padding: 14,
    alignItems: "center",
    gap: 6,
  },
  performanceMetricIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "#F9FAFB",
    alignItems: "center",
    justifyContent: "center",
  },
  performanceMetricValue: {
    fontSize: 16,
    fontWeight: "800",
    color: METRONIC.text,
  },
  performanceMetricLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: METRONIC.subtle,
    textAlign: "center",
    lineHeight: 14,
  },

  // Scorecard ring
  scorecardRing: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 4,
    borderColor: "#50CD89",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E8FFF3",
    gap: 0,
    flexShrink: 0,
  },
  scorecardScore: {
    fontSize: 20,
    fontWeight: "900",
    color: "#50CD89",
    letterSpacing: -0.5,
  },
  scorecardGrade: {
    fontSize: 11,
    fontWeight: "700",
    color: "#50CD89",
    marginTop: -2,
  },

  // Grade chips
  gradeChip: {
    width: 28,
    height: 28,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: METRONIC.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F9FAFB",
  },
  gradeChipText: {
    fontSize: 10,
    fontWeight: "700",
    color: METRONIC.subtle,
  },

  // Finance
  financeKpiRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 20,
    flexWrap: "wrap",
  },
  agingRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 20,
    flexWrap: "wrap",
  },
  agingCard: {
    flex: 1,
    minWidth: 120,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: METRONIC.border,
    borderTopWidth: 3,
    backgroundColor: Theme.cardWhite,
    padding: 14,
    alignItems: "center",
    gap: 4,
  },
  agingValue: {
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  agingLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: METRONIC.subtle,
  },

  // Timeline
  timelineNote: {
    fontSize: 12,
    fontWeight: "500",
    color: METRONIC.muted,
    marginBottom: 16,
    paddingHorizontal: 2,
  },
  timeline: {
    gap: 0,
  },
  timelineItem: {
    flexDirection: "row",
    gap: 12,
  },
  timelineLeft: {
    alignItems: "center",
    width: 28,
  },
  timelineIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: METRONIC.border,
    marginTop: 4,
    marginBottom: 4,
    minHeight: 24,
  },
  timelineContent: {
    flex: 1,
    paddingBottom: 20,
    paddingTop: 4,
    minWidth: 0,
    gap: 4,
  },
  timelineTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: METRONIC.text,
    lineHeight: 19,
  },
  timelineMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  timelineDate: {
    fontSize: 11,
    fontWeight: "500",
    color: METRONIC.muted,
  },

  // Data table alt row
  dataTableRowAlt: {
    backgroundColor: "#FAFAFA",
  },

  // heroTagRow (also in client profile, included here for convenience)
  heroTagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 8,
  },
});
