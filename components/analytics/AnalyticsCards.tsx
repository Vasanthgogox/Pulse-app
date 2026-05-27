/**
 * Reusable analytics primitives — Cards.
 * ============================================================================
 *
 * Replaces the inline `KpiCard` / `SectionHeader` / `ChartCard` that were
 * previously duplicated across `features/vehicles/components/analytics/*`,
 * `features/drivers/components/analytics/*`, and the (untracked)
 * fleet-client / fleet-supplier tabs.
 *
 * Components exported here:
 *   • `<KPICard />`           — single metric tile with optional accent + delta
 *   • `<KPIHeader />`         — wraps KPICards in a responsive grid
 *   • `<ScoreCard />`         — 0-100 score + level + breakdown rows
 *   • `<SectionHeader />`     — h2 + optional right action
 *   • `<ChartCard />`         — surface around a chart with title + meta
 *
 * Design language matches the existing `KpiCard` exactly (slate-50 card,
 * uppercase 9px label, italic 20px value, optional accent stripe) so new
 * analytics tabs and refactored existing tabs land visually identical.
 */

import { memo, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";

import { Theme } from "@/constants/Theme";

import type { ScoreLevel } from "@/features/analytics";

// ─────────────────────────────────────────────────────────────────────────────
// KPICard
// ─────────────────────────────────────────────────────────────────────────────

export interface KPICardProps {
  label: string;
  value: string;
  sub?: string;
  /** Hex string. Drives both the left accent stripe (3px) and the value
   *  color. Pass a `Theme.chartSeriesN` token for series-aligned KPIs. */
  accent?: string;
  /** Larger min-height; use for hero / first-row KPIs. */
  wide?: boolean;
  /** Red-tinted background — for "outstanding" / "expired" style KPIs. */
  alert?: boolean;
  /** Optional delta chip rendered under the value
   *  (e.g. `+12% MoM`, `-3% YoY`). */
  delta?: {
    label: string;
    direction: "up" | "down" | "flat";
  };
  /** Optional icon at top-right. */
  iconSlot?: ReactNode;
  /** Tap target — when present, the card becomes a `Pressable`. */
  onPress?: () => void;
  /** Loading shimmer placeholder. Renders `ActivityIndicator` in place
   *  of the value. */
  loading?: boolean;
  /** Override card style. */
  containerStyle?: ViewStyle;
}

export const KPICard = memo(function KPICard({
  label,
  value,
  sub,
  accent,
  wide,
  alert,
  delta,
  iconSlot,
  onPress,
  loading,
  containerStyle,
}: KPICardProps) {
  const cardStyle = [
    kpiStyles.card,
    wide && kpiStyles.cardWide,
    alert && kpiStyles.cardAlert,
    accent ? { borderLeftWidth: 3, borderLeftColor: accent } : undefined,
    containerStyle,
  ];

  const Inner = (
    <>
      <View style={kpiStyles.headerRow}>
        <Text style={kpiStyles.label} numberOfLines={1}>
          {label}
        </Text>
        {iconSlot ? <View style={kpiStyles.iconSlot}>{iconSlot}</View> : null}
      </View>
      {loading ? (
        <ActivityIndicator
          size="small"
          color={accent ?? Theme.primary}
          style={kpiStyles.loader}
        />
      ) : (
        <Text
          style={[kpiStyles.value, accent ? { color: accent } : undefined]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {value}
        </Text>
      )}
      {sub ? (
        <Text style={kpiStyles.sub} numberOfLines={1}>
          {sub}
        </Text>
      ) : null}
      {delta ? <DeltaChip label={delta.label} direction={delta.direction} /> : null}
    </>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [...cardStyle, pressed && kpiStyles.cardPressed]}
        accessibilityRole="button"
        accessibilityLabel={`${label} ${value}`}
      >
        {Inner}
      </Pressable>
    );
  }
  return <View style={cardStyle}>{Inner}</View>;
});

function DeltaChip({
  label,
  direction,
}: {
  label: string;
  direction: "up" | "down" | "flat";
}) {
  const arrow = direction === "up" ? "▲" : direction === "down" ? "▼" : "▬";
  const fg =
    direction === "up"
      ? Theme.positive
      : direction === "down"
        ? Theme.negative
        : Theme.textMuted;
  return (
    <View style={[kpiStyles.deltaChip, { borderColor: fg }]}>
      <Text style={[kpiStyles.deltaArrow, { color: fg }]}>{arrow}</Text>
      <Text style={[kpiStyles.deltaLabel, { color: fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// KPIHeader — responsive grid of KPICards (2 cols mobile, 4 cols desktop)
// ─────────────────────────────────────────────────────────────────────────────

export interface KPIHeaderProps {
  cards: ReadonlyArray<KPICardProps & { id: string }>;
  /** Number of columns to render. Default 2; pass 4 on tablets / web. */
  columns?: 2 | 3 | 4;
  /** Optional title rendered above the grid. */
  title?: string;
  /** Optional helper subline below the title. */
  subtitle?: string;
  /** Optional right-aligned action (e.g. a "View all" link). */
  rightAction?: ReactNode;
}

export const KPIHeader = memo(function KPIHeader({
  cards,
  columns = 2,
  title,
  subtitle,
  rightAction,
}: KPIHeaderProps) {
  return (
    <View style={headerStyles.container}>
      {(title || rightAction) && (
        <View style={headerStyles.titleRow}>
          <View style={headerStyles.titleStack}>
            {title ? <Text style={headerStyles.title}>{title}</Text> : null}
            {subtitle ? (
              <Text style={headerStyles.subtitle}>{subtitle}</Text>
            ) : null}
          </View>
          {rightAction ? (
            <View style={headerStyles.rightAction}>{rightAction}</View>
          ) : null}
        </View>
      )}
      <View style={headerStyles.grid}>
        {cards.map((c) => {
          const { id, ...rest } = c;
          return (
            <View
              key={id}
              style={[headerStyles.gridCell, { flexBasis: `${100 / columns}%` }]}
            >
              <KPICard {...rest} />
            </View>
          );
        })}
      </View>
    </View>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// ScoreCard — 0-100 score + level + sub-score breakdown
// ─────────────────────────────────────────────────────────────────────────────

export interface ScoreCardProps {
  title: string;
  score: number;
  level: ScoreLevel;
  /** Sub-scores rendered as small horizontal bars beneath the headline. */
  subScores?: ReadonlyArray<{ label: string; value: number; max?: number }>;
  /** Free-form caption — e.g. "based on last 6 months". */
  caption?: string;
  /** Optional badges row (e.g. `["premium", "fast_paying"]`). */
  badges?: ReadonlyArray<{ label: string; tone: ScoreLevel | "info" }>;
  /** Loading state. */
  loading?: boolean;
}

const SCORE_LEVEL_PALETTE: Record<
  ScoreLevel,
  { bg: string; fg: string; label: string }
> = {
  excellent: {
    bg: Theme.scoreExcellentBg,
    fg: Theme.scoreExcellentFg,
    label: "Excellent",
  },
  good: { bg: Theme.scoreGoodBg, fg: Theme.scoreGoodFg, label: "Good" },
  warning: {
    bg: Theme.scoreWarningBg,
    fg: Theme.scoreWarningFg,
    label: "Watch",
  },
  critical: {
    bg: Theme.scoreCriticalBg,
    fg: Theme.scoreCriticalFg,
    label: "Critical",
  },
  unknown: { bg: Theme.surface, fg: Theme.textMuted, label: "Insufficient data" },
};

export const ScoreCard = memo(function ScoreCard({
  title,
  score,
  level,
  subScores,
  caption,
  badges,
  loading,
}: ScoreCardProps) {
  const palette = SCORE_LEVEL_PALETTE[level];
  return (
    <View style={scoreStyles.card}>
      <View style={scoreStyles.headerRow}>
        <Text style={scoreStyles.title}>{title}</Text>
        <View
          style={[
            scoreStyles.levelChip,
            { backgroundColor: palette.bg, borderColor: palette.fg },
          ]}
        >
          <Text style={[scoreStyles.levelText, { color: palette.fg }]}>
            {palette.label}
          </Text>
        </View>
      </View>

      <View style={scoreStyles.scoreRow}>
        {loading ? (
          <ActivityIndicator color={palette.fg} />
        ) : (
          <>
            <Text style={[scoreStyles.scoreValue, { color: palette.fg }]}>
              {Number.isFinite(score) ? Math.round(score) : "—"}
            </Text>
            <Text style={scoreStyles.scoreMax}>/ 100</Text>
          </>
        )}
      </View>
      {caption ? <Text style={scoreStyles.caption}>{caption}</Text> : null}

      {badges && badges.length > 0 ? (
        <View style={scoreStyles.badgeRow}>
          {badges.map((b, i) => {
            const palette2 =
              b.tone === "info"
                ? { bg: Theme.pulseIndigoWash, fg: Theme.primary }
                : SCORE_LEVEL_PALETTE[b.tone];
            return (
              <View
                key={`${b.label}-${i}`}
                style={[scoreStyles.badge, { backgroundColor: palette2.bg }]}
              >
                <Text style={[scoreStyles.badgeText, { color: palette2.fg }]}>
                  {b.label}
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}

      {subScores && subScores.length > 0 ? (
        <View style={scoreStyles.subStack}>
          {subScores.map((s) => {
            const max = s.max ?? 100;
            const pct = max > 0 ? Math.min(100, Math.max(0, (s.value / max) * 100)) : 0;
            return (
              <View key={s.label} style={scoreStyles.subRow}>
                <Text style={scoreStyles.subLabel} numberOfLines={1}>
                  {s.label}
                </Text>
                <View style={scoreStyles.subTrack}>
                  <View
                    style={[
                      scoreStyles.subFill,
                      {
                        width: `${pct}%`,
                        backgroundColor: palette.fg,
                      },
                    ]}
                  />
                </View>
                <Text style={scoreStyles.subValue}>{Math.round(s.value)}</Text>
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// SectionHeader — small h2 + optional right action
// ─────────────────────────────────────────────────────────────────────────────

export interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  rightAction?: ReactNode;
}

export const SectionHeader = memo(function SectionHeader({
  title,
  subtitle,
  rightAction,
}: SectionHeaderProps) {
  return (
    <View style={sectionStyles.row}>
      <View style={sectionStyles.titleStack}>
        <Text style={sectionStyles.title}>{title}</Text>
        {subtitle ? <Text style={sectionStyles.subtitle}>{subtitle}</Text> : null}
      </View>
      {rightAction ? <View style={sectionStyles.right}>{rightAction}</View> : null}
    </View>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// ChartCard — surface with title + meta + slot for any chart
// ─────────────────────────────────────────────────────────────────────────────

export interface ChartCardProps {
  title: string;
  subtitle?: string;
  rightMeta?: ReactNode;
  children: ReactNode;
  /** Use when the chart inside already has its own padding. */
  noPadding?: boolean;
  containerStyle?: ViewStyle;
}

export const ChartCard = memo(function ChartCard({
  title,
  subtitle,
  rightMeta,
  children,
  noPadding,
  containerStyle,
}: ChartCardProps) {
  return (
    <View style={[chartStyles.card, containerStyle]}>
      <View style={chartStyles.headerRow}>
        <View style={chartStyles.titleStack}>
          <Text style={chartStyles.title}>{title}</Text>
          {subtitle ? <Text style={chartStyles.subtitle}>{subtitle}</Text> : null}
        </View>
        {rightMeta ? <View style={chartStyles.right}>{rightMeta}</View> : null}
      </View>
      <View style={[chartStyles.body, noPadding && chartStyles.bodyNoPadding]}>
        {children}
      </View>
    </View>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const kpiStyles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 3,
    minHeight: 92,
    justifyContent: "flex-end",
  },
  cardWide: {
    minHeight: 78,
  },
  cardAlert: {
    backgroundColor: "rgba(232,33,39,0.04)",
    borderColor: "rgba(232,33,39,0.20)",
  },
  cardPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  iconSlot: {
    marginLeft: 6,
  },
  label: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  value: {
    fontSize: 20,
    fontWeight: "800",
    fontStyle: "italic",
    color: Theme.textBody,
  },
  sub: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  loader: {
    marginVertical: 6,
    alignSelf: "flex-start",
  },
  deltaChip: {
    marginTop: 4,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  deltaArrow: {
    fontSize: 8,
    fontWeight: "700",
  },
  deltaLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
});

const headerStyles = StyleSheet.create({
  container: {
    gap: 12,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  titleStack: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  title: {
    fontSize: 15,
    fontWeight: "800",
    color: Theme.textBody,
  },
  subtitle: {
    fontSize: 12,
    color: Theme.textMuted,
  },
  rightAction: {
    marginLeft: 8,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    rowGap: 10,
  },
  gridCell: {
    flexGrow: 1,
    flexShrink: 1,
    // Subtract gap so 2-col / 3-col / 4-col grids land flush at edges.
    paddingRight: 0,
  },
});

const scoreStyles = StyleSheet.create({
  card: {
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 18,
    padding: 16,
    gap: 10,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    flex: 1,
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  levelChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  levelText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  scoreRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
  },
  scoreValue: {
    fontSize: 44,
    fontWeight: "900",
    fontStyle: "italic",
  },
  scoreMax: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textMuted,
  },
  caption: {
    fontSize: 11,
    color: Theme.textMuted,
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  subStack: {
    marginTop: 4,
    gap: 6,
  },
  subRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  subLabel: {
    width: 110,
    fontSize: 11,
    color: Theme.textRouteCard,
  },
  subTrack: {
    flex: 1,
    height: 6,
    backgroundColor: Theme.surface,
    borderRadius: 999,
    overflow: "hidden",
  },
  subFill: {
    height: "100%",
  },
  subValue: {
    width: 30,
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textBody,
    textAlign: "right",
  },
});

const sectionStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginTop: 4,
  },
  titleStack: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  title: {
    fontSize: 16,
    fontWeight: "800",
    color: Theme.textBody,
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 11,
    color: Theme.textMuted,
  },
  right: {
    marginLeft: 8,
  },
});

const chartStyles = StyleSheet.create({
  card: {
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 18,
    overflow: "hidden",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 4,
    gap: 8,
  },
  titleStack: {
    flex: 1,
    minWidth: 0,
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
  right: {
    marginLeft: 8,
  },
  body: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 14,
  },
  bodyNoPadding: {
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
  },
});
