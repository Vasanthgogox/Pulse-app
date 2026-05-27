/**
 * Pulse analytics layout primitives — matches fleet desktop reference UI.
 */
import React, { memo, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Animated,
  Easing,
  Text,
  View,
  useWindowDimensions,
  type ViewStyle,
} from "react-native";
import FontAwesome from "@expo/vector-icons/FontAwesome";

import Theme from "@/constants/Theme";
import type { ScoreLevel } from "@/features/analytics";

import { RiskMeter } from "../RiskMeter";
import {
  isPulseCompact,
  packKpiItems,
  pulseBodyPadding,
  pulseBodySpacing,
  pulseColumnCount,
  pulseHeroPadding,
  pulseKpiGap,
  pulseStyles,
} from "./pulseStyles";

// ─────────────────────────────────────────────────────────────────────────────
// Shell + section
// ─────────────────────────────────────────────────────────────────────────────

export interface PulseAnalyticsShellProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  /** When nested inside party detail scroll (Client/Supplier detail). */
  embedded?: boolean;
}

export const PulseAnalyticsShell = memo(function PulseAnalyticsShell({
  title,
  subtitle,
  children,
  embedded = false,
}: PulseAnalyticsShellProps) {
  const { width } = useWindowDimensions();
  const compact = isPulseCompact(width);
  const pad = pulseBodyPadding(width, embedded);
  const heroPad = pulseHeroPadding(width);
  const bodySpace = pulseBodySpacing(width);

  return (
    <View style={pulseStyles.canvas}>
      <View
        style={[
          pulseStyles.hero,
          heroPad,
          { paddingHorizontal: pad },
        ]}
      >
        <View style={pulseStyles.heroGlow} pointerEvents="none" />
        <Text
          style={[
            pulseStyles.heroTitle,
            compact && pulseStyles.heroTitleCompact,
          ]}
        >
          {title}
        </Text>
        <Text
          style={[
            pulseStyles.heroSubtitle,
            compact && pulseStyles.heroSubtitleCompact,
          ]}
        >
          {subtitle}
        </Text>
      </View>
      <View
        style={[
          pulseStyles.body,
          bodySpace,
          { paddingHorizontal: pad },
        ]}
      >
        {children}
      </View>
    </View>
  );
});

export interface PulseSectionProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

export const PulseSection = memo(function PulseSection({
  title,
  subtitle,
  children,
}: PulseSectionProps) {
  const { width } = useWindowDimensions();
  const compact = isPulseCompact(width);

  return (
    <View
      style={[
        pulseStyles.sectionBlock,
        compact && pulseStyles.sectionBlockCompact,
      ]}
    >
      <Text
        style={[
          pulseStyles.sectionTitle,
          compact && pulseStyles.sectionTitleCompact,
        ]}
      >
        {title}
      </Text>
      {subtitle ? (
        <Text
          style={[
            pulseStyles.sectionSubtitle,
            compact && pulseStyles.sectionSubtitleCompact,
          ]}
        >
          {subtitle}
        </Text>
      ) : null}
      {children}
    </View>
  );
});

export interface PulseChartPanelProps {
  title: string;
  subtitle?: string;
  rightIcon?: ReactNode;
  children: ReactNode;
  bodyStyle?: ViewStyle;
}

export const PulseChartPanel = memo(function PulseChartPanel({
  title,
  subtitle,
  rightIcon,
  children,
  bodyStyle,
}: PulseChartPanelProps) {
  const { width } = useWindowDimensions();
  const compact = isPulseCompact(width);

  return (
    <View style={[pulseStyles.panel, compact && pulseStyles.panelCompact]}>
      <View
        style={[
          pulseStyles.panelHeader,
          compact && pulseStyles.panelHeaderCompact,
        ]}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={[
              pulseStyles.panelTitle,
              compact && pulseStyles.panelTitleCompact,
            ]}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text
              style={[
                pulseStyles.panelSubtitle,
                compact && pulseStyles.panelSubtitleCompact,
              ]}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>
        {rightIcon ?? (
          <FontAwesome
            name="bar-chart"
            size={compact ? 14 : 16}
            color={Theme.textMuted}
          />
        )}
      </View>
      <View
        style={[
          pulseStyles.panelBody,
          compact && pulseStyles.panelBodyCompact,
          bodyStyle,
        ]}
      >
        {children}
      </View>
    </View>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// KPI grid — dense packing on desktop (no empty spacer cells)
// ─────────────────────────────────────────────────────────────────────────────

export interface PulseKpiItem {
  id: string;
  label: string;
  value: string;
  subtext: string;
  valueColor?: string;
  iconName?: keyof typeof FontAwesome.glyphMap;
  trend?: number;
  badge?: string;
}

export interface PulseKpiGridProps {
  rows: ReadonlyArray<ReadonlyArray<PulseKpiItem | null>>;
}

export const PulseKpiGrid = memo(function PulseKpiGrid({ rows }: PulseKpiGridProps) {
  const { width } = useWindowDimensions();
  const compact = isPulseCompact(width);
  const cols = pulseColumnCount(width);
  const gap = pulseKpiGap(width);

  const packedRows = useMemo(
    () => packKpiItems(rows, cols) as PulseKpiItem[][],
    [rows, cols],
  );

  return (
    <View style={[pulseStyles.kpiGrid, compact && pulseStyles.kpiGridCompact]}>
      {packedRows.map((row, ri) => (
        <View
          key={`kpi-row-${ri}`}
          style={[
            pulseStyles.kpiRow,
            compact && pulseStyles.kpiRowCompact,
            { gap },
          ]}
        >
          {row.map((cell) => (
            <View
              key={cell.id}
              style={[pulseStyles.kpiCell, compact && pulseStyles.kpiCellCompact]}
            >
              <PulseKpiCard {...cell} />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
});

/** Side-by-side chart panels on wide screens; stacked on mobile. */
export const PulsePanelGrid = memo(function PulsePanelGrid({
  children,
  minColumnWidth = 340,
}: {
  children: ReactNode;
  minColumnWidth?: number;
}) {
  const { width } = useWindowDimensions();
  const pad = pulseBodyPadding(width) * 2;
  const usable = Math.max(280, width - pad);
  const compact = isPulseCompact(width);
  const columns = compact
    ? 1
    : Math.max(1, Math.min(2, Math.floor(usable / minColumnWidth)));

  if (columns <= 1) {
    return <View style={pulseStyles.panelGridStack}>{children}</View>;
  }

  const itemWidth = (usable - 12 * (columns - 1)) / columns;

  return (
    <View style={pulseStyles.panelGridRow}>
      {React.Children.map(children, (child, i) =>
        child ? (
          <View
            key={`panel-${i}`}
            style={[pulseStyles.panelGridItem, { width: itemWidth }]}
          >
            {child}
          </View>
        ) : null,
      )}
    </View>
  );
});

const PulseKpiCard = memo(function PulseKpiCard({
  label,
  value,
  subtext,
  valueColor = Theme.primary,
  iconName = "line-chart",
  trend,
  badge,
}: PulseKpiItem) {
  const { width } = useWindowDimensions();
  const compact = isPulseCompact(width);
  const trendUp = trend !== undefined && trend >= 0;

  return (
    <View style={[pulseStyles.kpiCard, compact && pulseStyles.kpiCardCompact]}>
      <View
        style={[
          pulseStyles.kpiCardHeader,
          compact && pulseStyles.kpiCardHeaderCompact,
        ]}
      >
        <Text
          style={[pulseStyles.kpiLabel, compact && pulseStyles.kpiLabelCompact]}
          numberOfLines={compact ? 2 : 1}
        >
          {label}
        </Text>
        {!compact ? (
          <View style={pulseStyles.kpiIconWrap}>
            <FontAwesome name={iconName} size={16} color={Theme.textMuted} />
          </View>
        ) : null}
      </View>
      <View>
        <Text
          style={[
            pulseStyles.kpiValue,
            compact && pulseStyles.kpiValueCompact,
            { color: valueColor },
          ]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
        >
          {value}
        </Text>
        <View
          style={[
            pulseStyles.kpiFooter,
            compact && pulseStyles.kpiFooterCompact,
          ]}
        >
          {trend !== undefined ? (
            <View
              style={[
                pulseStyles.trendChip,
                trendUp ? pulseStyles.trendChipUp : pulseStyles.trendChipDown,
              ]}
            >
              <FontAwesome
                name={trendUp ? "arrow-up" : "arrow-down"}
                size={8}
                color={trendUp ? Theme.positive : Theme.negative}
              />
              <Text
                style={[
                  pulseStyles.trendText,
                  { color: trendUp ? Theme.positive : Theme.negative },
                ]}
              >
                {Math.abs(trend)}%
              </Text>
            </View>
          ) : null}
          <Text
            style={[pulseStyles.kpiSub, compact && pulseStyles.kpiSubCompact]}
            numberOfLines={1}
          >
            {subtext}
          </Text>
          {badge ? (
            <View style={pulseStyles.badgeChip}>
              <Text style={pulseStyles.badgeChipText}>{badge}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Health score + gauge
// ─────────────────────────────────────────────────────────────────────────────

const LEVEL_CHIP: Record<
  ScoreLevel,
  { label: string; bg: string; fg: string; bar: string }
> = {
  excellent: {
    label: "EXCELLENT",
    bg: Theme.scoreExcellentBg,
    fg: Theme.scoreExcellentFg,
    bar: Theme.scoreExcellentFg,
  },
  good: {
    label: "GOOD",
    bg: Theme.scoreGoodBg,
    fg: Theme.scoreGoodFg,
    bar: Theme.scoreGoodFg,
  },
  warning: {
    label: "WATCH",
    bg: Theme.scoreWarningBg,
    fg: Theme.scoreWarningFg,
    bar: Theme.scoreWarningFg,
  },
  critical: {
    label: "CRITICAL",
    bg: Theme.scoreCriticalBg,
    fg: Theme.scoreCriticalFg,
    bar: Theme.scoreCriticalFg,
  },
  unknown: {
    label: "N/A",
    bg: Theme.surface,
    fg: Theme.textMuted,
    bar: Theme.textMuted,
  },
};

export interface PulseHealthBarItem {
  label: string;
  percent: number;
  color?: string;
}

export interface PulseHealthScorePanelProps {
  title?: string;
  score: number;
  level: ScoreLevel;
  caption: string;
  badgeLabel?: string;
  bars: readonly PulseHealthBarItem[];
}

export const PulseHealthScorePanel = memo(function PulseHealthScorePanel({
  title = "Health score",
  score,
  level,
  caption,
  badgeLabel,
  bars,
}: PulseHealthScorePanelProps) {
  const palette = LEVEL_CHIP[level];
  const displayScore = useCountUp(score);

  const { width } = useWindowDimensions();
  const compact = isPulseCompact(width);

  return (
    <View
      style={[
        pulseStyles.panel,
        pulseStyles.healthCard,
        compact && pulseStyles.healthCardCompact,
      ]}
    >
      <View
        style={[
          pulseStyles.levelChip,
          { backgroundColor: palette.bg, borderColor: palette.fg },
        ]}
      >
        <Text style={{ fontSize: 9, fontWeight: "800", color: palette.fg }}>
          {palette.label}
        </Text>
      </View>

      <Text style={pulseStyles.healthScoreLabel}>{title}</Text>
      <View style={pulseStyles.healthScoreRow}>
        <Text
          style={[
            pulseStyles.healthScoreValue,
            compact && pulseStyles.healthScoreValueCompact,
            { color: palette.fg },
          ]}
        >
          {displayScore}
        </Text>
        <Text style={pulseStyles.healthScoreMax}>/ 100</Text>
      </View>
      <Text style={pulseStyles.healthCaption}>{caption}</Text>
      {badgeLabel ? (
        <View style={pulseStyles.healthBadge}>
          <Text style={pulseStyles.healthBadgeText}>{badgeLabel}</Text>
        </View>
      ) : null}

      <View style={{ marginTop: 8 }}>
        {bars.map((b, i) => (
          <PulseHealthBar
            key={b.label}
            label={b.label}
            percent={b.percent}
            color={b.color ?? (b.percent < 40 ? Theme.chartSeries3 : palette.bar)}
            delayMs={80 + i * 60}
          />
        ))}
      </View>
    </View>
  );
});

export interface PulseGaugePanelProps {
  value: number;
  level: ScoreLevel;
  label: string;
  caption: string;
}

export const PulseGaugePanel = memo(function PulseGaugePanel({
  value,
  level,
  label,
  caption,
}: PulseGaugePanelProps) {
  const { width } = useWindowDimensions();
  const compact = isPulseCompact(width);

  return (
    <View
      style={[
        pulseStyles.panel,
        pulseStyles.gaugeCard,
        compact && pulseStyles.gaugeCardCompact,
      ]}
    >
      <RiskMeter
        value={value}
        level={level}
        label={label}
        caption={caption}
        size={compact ? 120 : 160}
        stroke={compact ? 10 : 12}
      />
    </View>
  );
});

export const PulseHealthRow = memo(function PulseHealthRow({
  score,
  gauge,
}: {
  score: ReactNode;
  gauge: ReactNode;
}) {
  const { width } = useWindowDimensions();
  const stacked = isPulseCompact(width) || width < 1024;

  const compact = isPulseCompact(width);

  if (stacked || compact) {
    return (
      <View style={[pulseStyles.scoreGridCompact, { gap: 8 }]}>
        <View style={pulseStyles.scoreMainCompact}>{score}</View>
        <View style={pulseStyles.scoreSideCompact}>{gauge}</View>
      </View>
    );
  }

  return (
    <View style={pulseStyles.scoreGrid}>
      <View style={pulseStyles.scoreMain}>{score}</View>
      <View style={pulseStyles.scoreSide}>{gauge}</View>
    </View>
  );
});

function PulseHealthBar({
  label,
  percent,
  color,
  delayMs,
}: PulseHealthBarItem & { delayMs: number }) {
  const anim = useRef(new Animated.Value(0)).current;
  const clamped = Math.max(0, Math.min(100, percent));

  useEffect(() => {
    anim.setValue(0);
    const t = setTimeout(() => {
      Animated.timing(anim, {
        toValue: clamped,
        duration: 900,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
    }, delayMs);
    return () => clearTimeout(t);
  }, [anim, clamped, delayMs]);

  const width = anim.interpolate({
    inputRange: [0, 100],
    outputRange: ["0%", "100%"],
  });

  return (
    <View style={pulseStyles.healthBarRow}>
      <Text style={pulseStyles.healthBarLabel} numberOfLines={1}>
        {label}
      </Text>
      <View style={pulseStyles.healthBarTrack}>
        <Animated.View
          style={[pulseStyles.healthBarFill, { width, backgroundColor: color }]}
        />
      </View>
      <Text style={pulseStyles.healthBarValue}>{Math.round(clamped)}</Text>
    </View>
  );
}

function useCountUp(target: number, duration = 900): number {
  const anim = useRef(new Animated.Value(0)).current;
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const id = anim.addListener(({ value: v }) => setDisplay(Math.round(v)));
    anim.setValue(0);
    Animated.timing(anim, {
      toValue: target,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
    return () => anim.removeListener(id);
  }, [anim, target, duration]);

  return display;
}

// ─────────────────────────────────────────────────────────────────────────────
// Lane bars + insights
// ─────────────────────────────────────────────────────────────────────────────

export interface PulseLaneBarItem {
  id: string;
  label: string;
  value: string;
  percent: number;
  marginLabel?: string;
}

export const PulseLaneBar = memo(function PulseLaneBar({
  label,
  value,
  percent,
  marginLabel,
}: PulseLaneBarItem) {
  const anim = useRef(new Animated.Value(0)).current;
  const clamped = Math.max(0, Math.min(100, percent));

  useEffect(() => {
    anim.setValue(0);
    Animated.timing(anim, {
      toValue: clamped,
      duration: 1000,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [anim, clamped]);

  const fillWidth = anim.interpolate({
    inputRange: [0, 100],
    outputRange: ["0%", "100%"],
  });

  return (
    <View style={pulseStyles.laneBarRow}>
      <Text style={pulseStyles.laneLabel} numberOfLines={2}>
        {label}
      </Text>
      <View style={pulseStyles.laneTrack}>
        <Animated.View
          style={[
            pulseStyles.laneFill,
            {
              width: fillWidth,
              backgroundColor:
                percent >= 15
                  ? Theme.chartSeries2
                  : percent >= 5
                    ? Theme.chartSeries1
                    : Theme.chartSeries3,
            },
          ]}
        >
          {marginLabel && clamped >= 22 ? (
            <Text style={pulseStyles.laneFillLabel}>{marginLabel}</Text>
          ) : null}
        </Animated.View>
      </View>
      <Text style={pulseStyles.laneValue}>{value}</Text>
    </View>
  );
});

export interface PulseInsightProps {
  message: string;
  tone: "positive" | "negative" | "warning" | "info";
}

export const PulseInsightsPanel = memo(function PulseInsightsPanel({
  insights,
}: {
  insights: readonly PulseInsightProps[];
}) {
  return (
    <View style={[pulseStyles.panel, pulseStyles.insightPanel]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <FontAwesome name="heartbeat" size={14} color={Theme.textBody} />
        <Text style={pulseStyles.sectionTitle}>What the data is telling you</Text>
      </View>
      {insights.map((item, i) => (
        <PulseInsightRow key={`insight-${i}`} {...item} />
      ))}
    </View>
  );
});

const INSIGHT_STYLE: Record<
  PulseInsightProps["tone"],
  { bg: string; border: string; icon: string; color: string }
> = {
  positive: {
    bg: "rgba(22,163,74,0.06)",
    border: Theme.positiveMuted,
    icon: "check-circle",
    color: Theme.positive,
  },
  negative: {
    bg: "rgba(232,33,39,0.06)",
    border: "#FECACA",
    icon: "exclamation-circle",
    color: Theme.negative,
  },
  warning: {
    bg: Theme.warningMuted,
    border: "#FDE68A",
    icon: "exclamation-triangle",
    color: Theme.warning,
  },
  info: {
    bg: "rgba(99,102,241,0.06)",
    border: "rgba(99,102,241,0.2)",
    icon: "info-circle",
    color: Theme.primary,
  },
};

function PulseInsightRow({ message, tone }: PulseInsightProps) {
  const s = INSIGHT_STYLE[tone];
  const parts = message.split(/(\*\*[^*]+\*\*)/g);

  return (
    <View
      style={[
        pulseStyles.insightRow,
        { backgroundColor: s.bg, borderColor: s.border },
      ]}
    >
      <FontAwesome name={s.icon as "check-circle"} size={22} color={s.color} />
      <Text style={pulseStyles.insightText}>
        {parts.map((part, i) => {
          if (part.startsWith("**") && part.endsWith("**")) {
            return (
              <Text key={i} style={pulseStyles.insightStrong}>
                {part.slice(2, -2)}
              </Text>
            );
          }
          return part;
        })}
      </Text>
    </View>
  );
}

/** Chart width inside panels — respects shell padding and multi-column layouts. */
export function usePulseChartWidth(options?: {
  /** Split usable width when charts sit in `PulsePanelGrid`. */
  columns?: number;
  extraPadding?: number;
}): number {
  const { width } = useWindowDimensions();
  const sidePad = pulseBodyPadding(width) * 2 + (options?.extraPadding ?? 48);
  const usable = Math.max(280, width - sidePad);
  const wantCols = options?.columns ?? 1;
  const cols =
    wantCols > 1 && width >= 960
      ? Math.min(wantCols, Math.max(1, Math.floor(usable / 320)))
      : 1;
  const gap = cols > 1 ? 12 * (cols - 1) : 0;
  const colW = (usable - gap) / cols;
  return Math.max(260, Math.min(colW, 1200));
}
