/**
 * Shared styles for Pulse analytics dashboards (web reference parity).
 */
import { StyleSheet } from "react-native";

import Theme from "@/constants/Theme";

export const PULSE_RADIUS = 24;
export const PULSE_CARD_BORDER = Theme.borderLight;

export const pulseStyles = StyleSheet.create({
  canvas: {
    flex: 1,
    backgroundColor: Theme.analyticsCanvas,
  },
  hero: {
    backgroundColor: Theme.analyticsHeroBg,
    paddingTop: 28,
    paddingBottom: 40,
    overflow: "hidden",
  },
  heroGlow: {
    position: "absolute",
    top: -80,
    right: -80,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: "900",
    color: Theme.cardWhite,
    letterSpacing: -0.5,
  },
  heroSubtitle: {
    marginTop: 6,
    fontSize: 10,
    fontWeight: "700",
    color: Theme.analyticsHeroSubtitle,
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  body: {
    paddingBottom: 48,
    marginTop: -20,
    gap: 28,
    maxWidth: 1280,
    width: "100%",
    alignSelf: "center",
  },
  sectionBlock: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: Theme.textBody,
    letterSpacing: -0.2,
  },
  sectionSubtitle: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  kpiGrid: {
    gap: 12,
  },
  kpiRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    alignItems: "stretch",
  },
  kpiCell: {
    flex: 1,
    minWidth: 0,
  },
  panelGridStack: {
    gap: 12,
  },
  panelGridRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    alignItems: "stretch",
  },
  panelGridItem: {
    minWidth: 0,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: Theme.cardWhite,
    borderRadius: PULSE_RADIUS,
    borderWidth: 1,
    borderColor: PULSE_CARD_BORDER,
    padding: 20,
    minHeight: 118,
    justifyContent: "space-between",
  },
  kpiCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
  },
  kpiLabel: {
    flex: 1,
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  kpiIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: Theme.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  kpiValue: {
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: -1,
    fontStyle: "italic",
  },
  kpiFooter: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
  },
  kpiSub: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  trendChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  trendChipUp: {
    backgroundColor: Theme.positiveMuted,
  },
  trendChipDown: {
    backgroundColor: "#FEE2E2",
  },
  trendText: {
    fontSize: 9,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  badgeChip: {
    marginLeft: "auto",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(99,102,241,0.2)",
    backgroundColor: "rgba(99,102,241,0.08)",
  },
  badgeChipText: {
    fontSize: 8,
    fontWeight: "800",
    color: Theme.primary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  scoreGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    alignItems: "stretch",
  },
  scoreMain: {
    flex: 2,
    flexGrow: 2,
    minWidth: 320,
  },
  scoreSide: {
    flex: 1,
    flexGrow: 1,
    minWidth: 280,
    maxWidth: 420,
  },
  panel: {
    backgroundColor: Theme.cardWhite,
    borderRadius: PULSE_RADIUS,
    borderWidth: 1,
    borderColor: PULSE_CARD_BORDER,
    overflow: "hidden",
  },
  panelHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
    backgroundColor: "rgba(248,250,252,0.8)",
  },
  panelTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textBody,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  panelSubtitle: {
    marginTop: 3,
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  panelBody: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
  },
  healthCard: {
    padding: 24,
    minHeight: 280,
  },
  levelChip: {
    position: "absolute",
    top: 20,
    right: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  healthScoreLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  healthScoreRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
    marginTop: 4,
  },
  healthScoreValue: {
    fontSize: 52,
    fontWeight: "900",
    letterSpacing: -2,
    fontStyle: "italic",
  },
  healthScoreMax: {
    fontSize: 14,
    fontWeight: "800",
    color: Theme.textMuted,
  },
  healthCaption: {
    marginTop: 4,
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textMuted,
  },
  healthBadge: {
    alignSelf: "flex-start",
    marginTop: 10,
    marginBottom: 16,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: "rgba(99,102,241,0.12)",
  },
  healthBadgeText: {
    fontSize: 8,
    fontWeight: "800",
    color: Theme.primary,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  gaugeCard: {
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 280,
  },
  gaugeTitle: {
    marginTop: 8,
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textBody,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  gaugeCaption: {
    marginTop: 4,
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  healthBarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  healthBarLabel: {
    width: 96,
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  healthBarTrack: {
    flex: 1,
    height: 10,
    borderRadius: 999,
    backgroundColor: Theme.surface,
    overflow: "hidden",
  },
  healthBarFill: {
    height: "100%",
    borderRadius: 999,
  },
  healthBarValue: {
    width: 28,
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textBody,
    textAlign: "right",
  },
  laneBarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 14,
  },
  laneLabel: {
    width: 120,
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textRouteCard,
  },
  laneTrack: {
    flex: 1,
    height: 24,
    borderRadius: 8,
    backgroundColor: Theme.surface,
    overflow: "hidden",
    justifyContent: "center",
  },
  laneFill: {
    height: "100%",
    borderRadius: 8,
    justifyContent: "center",
    paddingRight: 8,
    minWidth: 4,
  },
  laneFillLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.cardWhite,
    textAlign: "right",
  },
  laneValue: {
    width: 52,
    fontSize: 14,
    fontWeight: "900",
    color: Theme.textBody,
    textAlign: "right",
    letterSpacing: -0.3,
  },
  insightPanel: {
    padding: 20,
    gap: 14,
  },
  insightRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  insightText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textRouteCard,
    lineHeight: 20,
  },
  insightStrong: {
    fontWeight: "900",
    color: Theme.textBody,
  },
  empty: {
    paddingVertical: 32,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textMuted,
  },
});

/** Responsive column count for KPI grids. */
export function pulseColumnCount(width: number): 1 | 2 | 3 | 4 {
  if (width >= 1280) return 4;
  if (width >= 900) return 3;
  if (width >= 520) return 2;
  return 1;
}

/** Horizontal padding for analytics shell body. */
export function pulseBodyPadding(width: number): number {
  if (width >= 1280) return 32;
  if (width >= 768) return 24;
  return 16;
}

/** Pack KPI items into dense rows (no empty spacer cells). */
export function packKpiItems<T extends { id: string }>(
  rows: ReadonlyArray<ReadonlyArray<T | null>>,
  cols: number,
): T[][] {
  const items = rows.flat().filter((c): c is T => c != null);
  const packed: T[][] = [];
  for (let i = 0; i < items.length; i += cols) {
    packed.push(items.slice(i, i + cols));
  }
  return packed;
}
