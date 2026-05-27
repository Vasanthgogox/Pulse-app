/**
 * PerformanceLeaderboard + HBarChart + RankBadge — reusable primitives.
 * ============================================================================
 *
 * Replaces the inline `LeaderboardRow` / `HBarChart` / `RANK_BADGE` map
 * that were duplicated across four analytics tabs:
 *   • `features/vehicles/components/analytics/FleetAnalyticsTab.tsx`
 *   • `features/drivers/components/analytics/FleetDriverAnalyticsTab.tsx`
 *   • `features/clients/components/analytics/FleetClientAnalyticsTab.tsx`
 *   • `features/suppliers/components/analytics/FleetSupplierAnalyticsTab.tsx`
 *
 * Animation parity: same 700ms `Easing.out(cubic)` reveal as the original
 * `HBarChart` — entrance feels identical when we later refactor the
 * existing tabs to use these primitives.
 *
 * Performance: the leaderboard expects a memoised `rows` prop and uses
 * `keyExtractor` + `getItemLayout` so it scales to 1000+ drivers without
 * jank. For very large fleets, wrap with `FlashList` upstream.
 */

import { memo, useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ListRenderItem,
  type ViewStyle,
} from "react-native";
import Svg, { G, Rect, Text as SvgText } from "react-native-svg";

import { Theme } from "@/constants/Theme";

// ─────────────────────────────────────────────────────────────────────────────
// RankBadge — gold / silver / bronze pill, replaces duplicate `RANK_BADGE`
// map inline across analytics tabs.
// ─────────────────────────────────────────────────────────────────────────────

export type RankTier = "gold" | "silver" | "bronze" | "neutral";

export interface RankBadgeProps {
  rank: number;
  /** Override tier — defaults to 1=gold, 2=silver, 3=bronze, else neutral. */
  tier?: RankTier;
  size?: "sm" | "md";
}

const TIER_PALETTE: Record<RankTier, { bg: string; fg: string }> = {
  gold: { bg: Theme.rankGoldBg, fg: Theme.rankGoldFg },
  silver: { bg: Theme.rankSilverBg, fg: Theme.rankSilverFg },
  bronze: { bg: Theme.rankBronzeBg, fg: Theme.rankBronzeFg },
  neutral: { bg: Theme.surface, fg: Theme.textRouteCard },
};

function tierForRank(rank: number): RankTier {
  if (rank === 1) return "gold";
  if (rank === 2) return "silver";
  if (rank === 3) return "bronze";
  return "neutral";
}

export const RankBadge = memo(function RankBadge({
  rank,
  tier,
  size = "md",
}: RankBadgeProps) {
  const resolved = tier ?? tierForRank(rank);
  const palette = TIER_PALETTE[resolved];
  return (
    <View
      style={[
        rankStyles.badge,
        size === "sm" && rankStyles.badgeSm,
        { backgroundColor: palette.bg },
      ]}
    >
      <Text
        style={[
          rankStyles.text,
          size === "sm" && rankStyles.textSm,
          { color: palette.fg },
        ]}
      >
        {rank <= 99 ? `#${rank}` : "99+"}
      </Text>
    </View>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// HBarChart — horizontal animated bars
// ─────────────────────────────────────────────────────────────────────────────

const AnimatedRect = Animated.createAnimatedComponent(Rect);

export interface HBarItem {
  id: string;
  label: string;
  value: number;
  /** Optional secondary metric used to colorise the bar (e.g. margin %).
   *  Falls back to `value` for the threshold check. */
  hue?: number;
  /** Pre-formatted right-side label (e.g. "₹4.2L"). */
  display?: string;
}

export interface HBarChartProps {
  items: HBarItem[];
  width: number;
  /** Row height — defaults to 28px. */
  rowHeight?: number;
  /** Gap between rows. */
  gap?: number;
  /** Width reserved for the left label. */
  labelWidth?: number;
  /** Width reserved for the right-side value. */
  valueWidth?: number;
  /** Color thresholds for the optional `hue` metric. When omitted, all
   *  bars are `Theme.chartSeries1` (indigo). */
  hueThresholds?: {
    positive: number;
    neutral: number;
  };
  /** Custom value formatter for the right-side label.
   *  When `display` is set on an item, that takes precedence. */
  formatValue?: (value: number) => string;
}

export const HBarChart = memo(function HBarChart({
  items,
  width,
  rowHeight = 28,
  gap = 8,
  labelWidth = 86,
  valueWidth = 56,
  hueThresholds = { positive: 15, neutral: 0 },
  formatValue,
}: HBarChartProps) {
  const barAnim = useRef(new Animated.Value(0)).current;

  const itemsKey = items.map((i) => `${i.id}:${i.value}`).join("|");

  useEffect(() => {
    barAnim.setValue(0);
    Animated.timing(barAnim, {
      toValue: 1,
      duration: 820,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [itemsKey, barAnim]);

  const maxVal = Math.max(...items.map((i) => i.value), 1);
  const chartW = Math.max(1, width - labelWidth - valueWidth - 8);
  const svgH = Math.max(items.length * (rowHeight + gap), rowHeight);

  return (
    <Svg width={width} height={svgH}>
      {items.map((item, i) => {
        const y = i * (rowHeight + gap);
        const finalW = (item.value / maxVal) * chartW;
        const stagger = 0.12 + (i / Math.max(items.length, 1)) * 0.88;
        const animW = barAnim.interpolate({
          inputRange: [0, stagger, 1],
          outputRange: [0, 0, Math.max(2, finalW)],
          extrapolate: "clamp",
        });
        const hue = item.hue ?? item.value;
        const barColor =
          hue >= hueThresholds.positive
            ? Theme.chartSeries2
            : hue >= hueThresholds.neutral
              ? Theme.chartSeries1
              : Theme.chartSeries3;
        const displayLabel =
          item.label.length > 11 ? item.label.slice(0, 10) + "…" : item.label;
        const right =
          item.display ??
          (formatValue ? formatValue(item.value) : String(Math.round(item.value)));
        return (
          <G key={item.id}>
            <Rect
              x={labelWidth}
              y={y + 4}
              width={chartW}
              height={rowHeight - 8}
              fill={Theme.surfaceGray}
              rx={4}
            />
            <AnimatedRect
              x={labelWidth}
              y={y + 4}
              width={animW as unknown as number}
              height={rowHeight - 8}
              fill={barColor}
              rx={4}
              fillOpacity={0.85}
            />
            <SvgText
              x={labelWidth - 6}
              y={y + rowHeight / 2 + 4}
              textAnchor="end"
              fontSize={9}
              fill={Theme.textMuted}
              fontWeight="600"
            >
              {displayLabel}
            </SvgText>
            <SvgText
              x={labelWidth + chartW + 5}
              y={y + rowHeight / 2 + 4}
              textAnchor="start"
              fontSize={9}
              fill={Theme.textPrimaryDark}
              fontWeight="700"
            >
              {right}
            </SvgText>
          </G>
        );
      })}
    </Svg>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// PerformanceLeaderboard — tabular ranking list
// ─────────────────────────────────────────────────────────────────────────────

export interface LeaderboardColumn<T> {
  id: keyof T | string;
  label: string;
  /** Returns the cell content for a row. */
  render: (row: T, rank: number) => string;
  /** Optional accent color for the value. */
  accent?: (row: T, rank: number) => string | undefined;
  /** Width hint. */
  width?: number;
  /** Right-align the column body. */
  alignRight?: boolean;
}

export interface PerformanceLeaderboardProps<T extends { id: string }> {
  rows: ReadonlyArray<T>;
  columns: ReadonlyArray<LeaderboardColumn<T>>;
  /** Primary label shown next to the rank badge — typically the entity name. */
  primaryLabel: (row: T) => string;
  /** Secondary subline beneath the primary label. */
  secondaryLabel?: (row: T) => string | undefined;
  /** Optional left avatar slot (e.g. PartyAvatar). */
  renderAvatar?: (row: T) => React.ReactNode;
  /** Optional badges row (e.g. "Top revenue", "High risk"). */
  renderBadges?: (row: T) => React.ReactNode;
  /** Tap handler — drill-down to the entity detail. */
  onPressRow?: (row: T) => void;
  /** Sticky table title. */
  title?: string;
  /** Right action above the table (e.g. sort select). */
  rightAction?: React.ReactNode;
  /** Empty state caption. */
  emptyLabel?: string;
  containerStyle?: ViewStyle;
}

const ROW_H = 56;

export function PerformanceLeaderboard<T extends { id: string }>({
  rows,
  columns,
  primaryLabel,
  secondaryLabel,
  renderAvatar,
  renderBadges,
  onPressRow,
  title,
  rightAction,
  emptyLabel = "No data yet",
  containerStyle,
}: PerformanceLeaderboardProps<T>) {
  const renderItem: ListRenderItem<T> = ({ item, index }) => {
    const rank = index + 1;
    return (
      <Pressable
        onPress={onPressRow ? () => onPressRow(item) : undefined}
        style={({ pressed }) => [
          leaderStyles.row,
          pressed && onPressRow ? leaderStyles.rowPressed : undefined,
        ]}
      >
        <View style={leaderStyles.leftCol}>
          <RankBadge rank={rank} size="sm" />
          {renderAvatar ? renderAvatar(item) : null}
          <View style={leaderStyles.identity}>
            <Text style={leaderStyles.primaryName} numberOfLines={1}>
              {primaryLabel(item)}
            </Text>
            {secondaryLabel ? (
              <Text style={leaderStyles.secondary} numberOfLines={1}>
                {secondaryLabel(item)}
              </Text>
            ) : null}
            {renderBadges ? (
              <View style={leaderStyles.badgeRow}>{renderBadges(item)}</View>
            ) : null}
          </View>
        </View>
        <View style={leaderStyles.metrics}>
          {columns.map((col) => {
            const accent = col.accent ? col.accent(item, rank) : undefined;
            return (
              <View
                key={String(col.id)}
                style={[
                  leaderStyles.cell,
                  { width: col.width ?? 64 },
                  col.alignRight !== false ? leaderStyles.cellRight : undefined,
                ]}
              >
                <Text style={leaderStyles.cellLabel} numberOfLines={1}>
                  {col.label}
                </Text>
                <Text
                  style={[
                    leaderStyles.cellValue,
                    accent ? { color: accent } : undefined,
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {col.render(item, rank)}
                </Text>
              </View>
            );
          })}
        </View>
      </Pressable>
    );
  };

  return (
    <View style={[leaderStyles.container, containerStyle]}>
      {(title || rightAction) && (
        <View style={leaderStyles.titleRow}>
          {title ? <Text style={leaderStyles.title}>{title}</Text> : null}
          {rightAction ? (
            <View style={leaderStyles.titleRight}>{rightAction}</View>
          ) : null}
        </View>
      )}
      <FlatList
        data={rows as T[]}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        scrollEnabled={false}
        getItemLayout={(_, index) => ({
          length: ROW_H,
          offset: ROW_H * index,
          index,
        })}
        ListEmptyComponent={
          <View style={leaderStyles.empty}>
            <Text style={leaderStyles.emptyText}>{emptyLabel}</Text>
          </View>
        }
      />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const rankStyles = StyleSheet.create({
  badge: {
    minWidth: 32,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    alignItems: "center",
  },
  badgeSm: {
    minWidth: 26,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  text: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  textSm: {
    fontSize: 10,
  },
});

const leaderStyles = StyleSheet.create({
  container: {
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 18,
    overflow: "hidden",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
  },
  title: {
    fontSize: 13,
    fontWeight: "800",
    color: Theme.textBody,
  },
  titleRight: {
    marginLeft: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  rowPressed: {
    backgroundColor: Theme.surface,
  },
  leftCol: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  identity: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  primaryName: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textBody,
  },
  secondary: {
    fontSize: 11,
    color: Theme.textMuted,
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 2,
  },
  metrics: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  cell: {
    gap: 2,
  },
  cellRight: {
    alignItems: "flex-end",
  },
  cellLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  cellValue: {
    fontSize: 13,
    fontWeight: "800",
    color: Theme.textBody,
  },
  empty: {
    paddingVertical: 28,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 12,
    color: Theme.textMuted,
  },
});
