/**
 * Shared layout for party-detail analytics tabs (client, supplier, driver, vehicle).
 * Cancels parent scroll padding so analytics align edge-to-edge like Cash Flow.
 */
import { Platform, StyleSheet, useWindowDimensions } from "react-native";

import Layout from "@/constants/Layout";
import { isPulseDesktop } from "@/components/analytics/pulse/pulseStyles";

export const partyAnalyticsLayout = StyleSheet.create({
  inset: {
    marginHorizontal: -Layout.screenPaddingHorizontal,
    paddingHorizontal: Layout.screenPaddingHorizontal,
  },
  /** Desktop web — stretch analytics to the scroll viewport width. */
  insetDesktop: {
    marginHorizontal: 0,
    paddingHorizontal: 0,
    width: "100%",
    alignSelf: "stretch",
  },
});

/** Party analytics container styles for the current viewport. */
export function usePartyAnalyticsInsetStyle() {
  const { width } = useWindowDimensions();
  const desktop = isPulseDesktop(width);
  return desktop
    ? [partyAnalyticsLayout.inset, partyAnalyticsLayout.insetDesktop]
    : partyAnalyticsLayout.inset;
}

/** Standard KPI column count for custom party analytics grids (driver / vehicle). */
export function partyAnalyticsColumnCount(width: number): number {
  if (Platform.OS !== "web") return width >= 720 ? 4 : 2;
  if (width >= 1024) return 4;
  if (width >= 640) return 4;
  return 2;
}

/** Chunk items into fixed-width grid rows, padding the last row for alignment. */
export function chunkPartyKpiRows<T>(items: readonly T[], cols: number): (T | null)[][] {
  const rows: (T | null)[][] = [];
  for (let i = 0; i < items.length; i += cols) {
    const row: (T | null)[] = items.slice(i, i + cols);
    while (row.length < cols) row.push(null);
    rows.push(row);
  }
  return rows;
}
