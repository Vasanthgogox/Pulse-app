/**
 * Shared layout tokens + helpers for party analytics dashboards.
 */
import { StyleSheet } from "react-native";

import { Theme } from "@/constants/Theme";

/** Resolve KPI column count from viewport width + requested max. */
export function resolveAnalyticsColumns(
  width: number,
  requested: 2 | 3 | 4 = 4,
): 2 | 3 | 4 {
  if (width < 520) return 2;
  if (width < 900) return requested >= 3 ? 3 : 2;
  return requested;
}

export const analyticsPanelStyles = StyleSheet.create({
  root: {
    gap: 18,
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  scoreRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    alignItems: "stretch",
  },
  scoreCol: {
    flex: 1,
    minWidth: 300,
    minHeight: 240,
  },
  meterCard: {
    flex: 1,
    backgroundColor: Theme.surface,
    borderRadius: 18,
    paddingVertical: 20,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 240,
  },
  empty: {
    paddingVertical: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  insights: {
    gap: 8,
  },
});
