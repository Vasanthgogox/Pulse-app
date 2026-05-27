/**
 * Shared styles for Pulse analytics dashboards.
 * Compact tokens apply on native / narrow viewports (party detail analytics tabs).
 */
import { Platform, StyleSheet } from "react-native";

import Theme from "@/constants/Theme";

export const PULSE_RADIUS = 24;
export const PULSE_RADIUS_COMPACT = 16;
export const PULSE_CARD_BORDER = Theme.borderLight;

/** Native phones and narrow embeds — single-column KPI cards, smaller type. */
export function isPulseCompact(width: number): boolean {
  if (Platform.OS !== "web") return true;
  return width < 768;
}

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
  heroTitleCompact: {
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  heroSubtitle: {
    marginTop: 6,
    fontSize: 10,
    fontWeight: "700",
    color: Theme.analyticsHeroSubtitle,
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  heroSubtitleCompact: {
    marginTop: 4,
    fontSize: 9,
    letterSpacing: 0.9,
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
  sectionBlockCompact: {
    gap: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: Theme.textBody,
    letterSpacing: -0.2,
  },
  sectionTitleCompact: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: -0.1,
  },
  sectionSubtitle: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  sectionSubtitleCompact: {
    fontSize: 9,
    letterSpacing: 0.6,
  },
  kpiGrid: {
    gap: 12,
  },
  kpiGridCompact: {
    gap: 8,
  },
  kpiRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    alignItems: "stretch",
  },
  kpiRowCompact: {
    gap: 8,
  },
  kpiCell: {
    flex: 1,
    minWidth: 0,
  },
  kpiCellCompact: {
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
  kpiCardCompact: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
    minHeight: 72,
    justifyContent: "flex-end",
  },
  kpiCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
  },
  kpiCardHeaderCompact: {
    marginBottom: 2,
  },
  kpiLabel: {
    flex: 1,
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  kpiLabelCompact: {
    fontSize: 9,
    letterSpacing: 0.7,
  },
  kpiIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: Theme.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  kpiIconWrapCompact: {
    width: 28,
    height: 28,
    borderRadius: 8,
  },
  kpiValue: {
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: -1,
    fontStyle: "italic",
  },
  kpiValueCompact: {
    fontSize: 16,
    fontWeight: "600",
    fontStyle: "normal",
    letterSpacing: -0.3,
    marginTop: 0,
  },
  kpiFooter: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
  },
  kpiFooterCompact: {
    marginTop: 3,
    gap: 4,
  },
  kpiSub: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  kpiSubCompact: {
    fontSize: 9,
    letterSpacing: 0.4,
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
  panelCompact: {
    borderRadius: PULSE_RADIUS_COMPACT,
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
  panelHeaderCompact: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  panelTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textBody,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  panelTitleCompact: {
    fontSize: 10,
    letterSpacing: 0.6,
  },
  panelSubtitle: {
    marginTop: 3,
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  panelSubtitleCompact: {
    fontSize: 8,
    marginTop: 2,
  },
  panelBody: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
  },
  panelBodyCompact: {
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 12,
  },
  healthCard: {
    padding: 24,
    minHeight: 280,
  },
  healthCardCompact: {
    padding: 14,
    minHeight: 0,
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
  healthScoreValueCompact: {
    fontSize: 36,
    fontWeight: "700",
    letterSpacing: -1,
    fontStyle: "normal",
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
  gaugeCardCompact: {
    padding: 14,
    minHeight: 0,
  },
  scoreGridCompact: {
    flexDirection: "column",
    gap: 8,
  },
  scoreMainCompact: {
    flex: 0,
    minWidth: 0,
    width: "100%",
  },
  scoreSideCompact: {
    flex: 0,
    minWidth: 0,
    maxWidth: "100%",
    width: "100%",
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

/** Responsive column count for KPI grids (party detail: 2-across on phone like Cash Flow). */
export function pulseColumnCount(width: number): 1 | 2 | 3 | 4 {
  if (isPulseCompact(width)) {
    if (width >= 720) return 3;
    return 2;
  }
  if (width >= 1280) return 4;
  if (width >= 900) return 3;
  if (width >= 520) return 2;
  return 1;
}

/** Gap between KPI cells for the current viewport. */
export function pulseKpiGap(width: number): number {
  return isPulseCompact(width) ? 8 : 12;
}

/** Default chart height inside pulse panels. */
export function pulseChartHeight(width: number): number {
  return isPulseCompact(width) ? 128 : 168;
}

/** Horizontal padding for analytics shell body. */
export function pulseBodyPadding(width: number, embedded = false): number {
  if (embedded && isPulseCompact(width)) return 12;
  if (width >= 1280) return 32;
  if (width >= 768) return 24;
  return 16;
}

/** Hero vertical padding for the analytics shell header band. */
export function pulseHeroPadding(width: number): {
  paddingTop: number;
  paddingBottom: number;
} {
  if (isPulseCompact(width)) {
    return { paddingTop: 12, paddingBottom: 16 };
  }
  return { paddingTop: 28, paddingBottom: 40 };
}

/** Body overlap + section rhythm under the hero band. */
export function pulseBodySpacing(width: number): {
  marginTop: number;
  gap: number;
} {
  if (isPulseCompact(width)) {
    return { marginTop: -10, gap: 12 };
  }
  return { marginTop: -20, gap: 28 };
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
