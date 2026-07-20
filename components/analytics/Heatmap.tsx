/**
 * Heatmap — grid of colour-graded cells for aging / risk / compliance.
 * ============================================================================
 *
 * Used by:
 *   • Client Payment Behavior — aging buckets per month (rows = months,
 *     columns = 0-30 / 31-60 / 61-90 / 90+ days)
 *   • Supplier Operations — completion / on-time / cancellation per month
 *   • Driver compliance — per-doc-type validity
 *
 * Build:
 *   <Heatmap
 *     rows={[{ id: 'aug', label: 'Aug' }, ...]}
 *     columns={[{ id: '0_30', label: '0-30d' }, ...]}
 *     cells={[{ rowId, colId, intensity: 0..1, tone, label }]}
 *   />
 *
 * Intensity drives alpha; tone selects the base hue
 * (`healthy / notice / warning / critical / empty`).
 */

import { memo } from "react";
import { Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";

import { Theme } from "@/constants/Theme";
import type { HeatmapCell as HeatmapCellType } from "@/features/analytics/types/analytics.types";

const TONE_PALETTE: Record<
  NonNullable<HeatmapCellType["tone"]>,
  { bg: string; fg: string }
> = {
  healthy: { bg: Theme.scoreExcellentBg, fg: Theme.scoreExcellentFg },
  notice: { bg: Theme.heatmapNoticeBg, fg: Theme.heatmapNoticeFg },
  warning: { bg: Theme.heatmapWarningBg, fg: Theme.heatmapWarningFg },
  critical: { bg: Theme.heatmapCriticalBg, fg: Theme.heatmapCriticalFg },
  empty: { bg: Theme.heatmapEmpty, fg: Theme.textMuted },
};

function alphaFor(intensity: number): number {
  const clamped = Math.max(0, Math.min(1, intensity));
  // Make low-intensity cells visibly above empty, but not full saturation
  return 0.45 + clamped * 0.55;
}

export interface HeatmapRow {
  id: string;
  label: string;
}

export interface HeatmapColumn {
  id: string;
  label: string;
}

export interface HeatmapProps {
  rows: ReadonlyArray<HeatmapRow>;
  columns: ReadonlyArray<HeatmapColumn>;
  cells: ReadonlyArray<HeatmapCellType>;
  /** Cell width — defaults to 56px (fits 4 cols on small phones). */
  cellWidth?: number;
  cellHeight?: number;
  /** Label rendered above the grid. */
  title?: string;
  /** Subline below the title. */
  subtitle?: string;
  /** Show value inside each cell — defaults to true. */
  showLabels?: boolean;
  onCellPress?: (cell: HeatmapCellType) => void;
  containerStyle?: ViewStyle;
}

export const Heatmap = memo(function Heatmap({
  rows,
  columns,
  cells,
  cellWidth = 56,
  cellHeight = 36,
  title,
  subtitle,
  showLabels = true,
  onCellPress,
  containerStyle,
}: HeatmapProps) {
  // Index cells by row-col for O(1) lookup during render.
  const byKey = new Map<string, HeatmapCellType>();
  for (const c of cells) byKey.set(`${c.rowId}|${c.colId}`, c);

  return (
    <View style={[styles.container, containerStyle]}>
      {(title || subtitle) && (
        <View style={styles.titleStack}>
          {title ? <Text style={styles.title}>{title}</Text> : null}
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
      )}
      <View>
        <View style={styles.colHeaderRow}>
          <View style={styles.rowLabelSpacer} />
          {columns.map((col) => (
            <View
              key={col.id}
              style={[styles.colHeaderCell, { width: cellWidth }]}
            >
              <Text style={styles.colHeaderText} numberOfLines={1}>
                {col.label}
              </Text>
            </View>
          ))}
        </View>
        {rows.map((row) => (
          <View key={row.id} style={styles.gridRow}>
            <View style={styles.rowLabelCell}>
              <Text style={styles.rowLabelText} numberOfLines={1}>
                {row.label}
              </Text>
            </View>
            {columns.map((col) => {
              const cell = byKey.get(`${row.id}|${col.id}`);
              const tone = cell?.tone ?? "empty";
              const palette = TONE_PALETTE[tone];
              const intensity = cell?.intensity ?? 0;
              const cellChildren = (
                <View
                  style={[
                    styles.cell,
                    {
                      width: cellWidth,
                      height: cellHeight,
                      backgroundColor: palette.bg,
                      opacity: tone === "empty" ? 0.6 : alphaFor(intensity),
                    },
                  ]}
                >
                  {showLabels && cell?.label ? (
                    <Text
                      style={[styles.cellText, { color: palette.fg }]}
                      numberOfLines={1}
                    >
                      {cell.label}
                    </Text>
                  ) : null}
                </View>
              );
              if (!cell || !onCellPress) {
                return <View key={col.id}>{cellChildren}</View>;
              }
              return (
                <Pressable
                  key={col.id}
                  onPress={() => onCellPress(cell)}
                  style={({ pressed }) => (pressed ? styles.cellPressed : undefined)}
                >
                  {cellChildren}
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    gap: 10,
  },
  titleStack: {
    gap: 2,
  },
  title: {
    fontSize: 13,
    fontWeight: "800",
    color: Theme.textBody,
  },
  subtitle: {
    fontSize: 11,
    color: Theme.textMuted,
  },
  colHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: 6,
  },
  rowLabelSpacer: {
    width: 70,
  },
  colHeaderCell: {
    paddingHorizontal: 4,
    alignItems: "center",
  },
  colHeaderText: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  gridRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
    gap: 4,
  },
  rowLabelCell: {
    width: 70,
    paddingRight: 8,
  },
  rowLabelText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textRouteCard,
    textAlign: "right",
  },
  cell: {
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  cellText: {
    fontSize: 11,
    fontWeight: "800",
  },
  cellPressed: {
    opacity: 0.7,
  },
});
