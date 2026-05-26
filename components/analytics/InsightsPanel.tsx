/**
 * InsightsPanel — auto-derived bullet list of operational insights.
 * ============================================================================
 *
 * Renders a stack of one-line callouts derived from analytics data — e.g.
 * "Margin dropped 12% MoM", "Payment delay rose from 14d to 28d", "3 of
 * top 5 routes had zero trips this month". Pure presentational, takes a
 * computed `insights` prop; derivation lives in the caller so it can be
 * memoised against the underlying data.
 *
 * Tone palette:
 *   • positive — green check
 *   • negative — red alert
 *   • warning  — amber clock
 *   • info     — indigo lightbulb
 */

import { memo } from "react";
import { Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";

import { Theme } from "@/constants/Theme";

import type { AnalyticsInsight } from "@/features/analytics";

const TONE_STYLES: Record<
  AnalyticsInsight["tone"],
  { bg: string; fg: string; iconBg: string; symbol: string }
> = {
  positive: {
    bg: Theme.scoreExcellentBg,
    fg: Theme.scoreExcellentFg,
    iconBg: Theme.scoreExcellentFg,
    symbol: "✓",
  },
  negative: {
    bg: Theme.scoreCriticalBg,
    fg: Theme.scoreCriticalFg,
    iconBg: Theme.scoreCriticalFg,
    symbol: "!",
  },
  warning: {
    bg: Theme.scoreWarningBg,
    fg: Theme.scoreWarningFg,
    iconBg: Theme.scoreWarningFg,
    symbol: "⚠",
  },
  info: {
    bg: Theme.pulseIndigoWash,
    fg: Theme.primary,
    iconBg: Theme.primary,
    symbol: "i",
  },
};

export interface InsightsPanelProps {
  title?: string;
  insights: ReadonlyArray<AnalyticsInsight>;
  emptyLabel?: string;
  onInsightPress?: (insight: AnalyticsInsight) => void;
  containerStyle?: ViewStyle;
}

export const InsightsPanel = memo(function InsightsPanel({
  title,
  insights,
  emptyLabel = "No insights yet — bring more trips to unlock callouts",
  onInsightPress,
  containerStyle,
}: InsightsPanelProps) {
  return (
    <View style={[styles.panel, containerStyle]}>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      {insights.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{emptyLabel}</Text>
        </View>
      ) : (
        <View style={styles.list}>
          {insights.map((ins) => {
            const palette = TONE_STYLES[ins.tone];
            const Wrapper = onInsightPress ? Pressable : View;
            return (
              <Wrapper
                key={ins.id}
                style={({ pressed }: { pressed?: boolean }) => [
                  styles.row,
                  { backgroundColor: palette.bg },
                  pressed && styles.rowPressed,
                ]}
                onPress={onInsightPress ? () => onInsightPress(ins) : undefined}
              >
                <View style={[styles.icon, { backgroundColor: palette.iconBg }]}>
                  <Text style={styles.iconText}>{palette.symbol}</Text>
                </View>
                <Text
                  style={[styles.message, { color: palette.fg }]}
                  numberOfLines={3}
                >
                  {ins.message}
                </Text>
              </Wrapper>
            );
          })}
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  panel: {
    gap: 10,
  },
  title: {
    fontSize: 13,
    fontWeight: "800",
    color: Theme.textBody,
    marginBottom: 2,
  },
  list: {
    gap: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
  },
  rowPressed: {
    opacity: 0.85,
  },
  icon: {
    width: 22,
    height: 22,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  iconText: {
    color: Theme.cardWhite,
    fontSize: 12,
    fontWeight: "900",
  },
  message: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 16,
  },
  empty: {
    paddingVertical: 14,
    paddingHorizontal: 12,
    backgroundColor: Theme.surface,
    borderRadius: 14,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 12,
    color: Theme.textMuted,
    textAlign: "center",
  },
});
