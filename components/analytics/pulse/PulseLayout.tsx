/**
 * Pulse analytics layout primitives — matches fleet desktop reference UI.
 */
import React, {
  createContext,
  memo,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
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
  expandKpiRowsToGrid,
  isPulseCompact,
  isPulseDense,
  isPulseDesktop,
  pulseBodyPadding,
  pulseBodySpacing,
  pulseColumnCount,
  pulseHeroPadding,
  pulseKpiGap,
  pulseStyles,
} from "./pulseStyles";
import {
  PulseFinancialOverviewCard,
  type PulseFinancialOverviewProps,
} from "./PulseFinancialOverviewCard";

export type { PulseFinancialOverviewProps };

type PulseVisualMode = {
  dense: boolean;
  desktop: boolean;
  compact: boolean;
  embedded: boolean;
};

const PulseVisualModeContext = createContext<PulseVisualMode>({
  dense: false,
  desktop: false,
  compact: false,
  embedded: false,
});

export function usePulseVisualMode(): PulseVisualMode {
  return useContext(PulseVisualModeContext);
}

// ─────────────────────────────────────────────────────────────────────────────
// Shell + section
// ─────────────────────────────────────────────────────────────────────────────

export interface PulseAnalyticsShellProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  /** When nested inside party detail scroll (Client/Supplier detail). */
  embedded?: boolean;
  /** Slate financial hero — matches entity detail scorecard theme. */
  financialOverview?: PulseFinancialOverviewProps;
}

export const PulseAnalyticsShell = memo(function PulseAnalyticsShell({
  title,
  subtitle,
  children,
  embedded = false,
  financialOverview,
}: PulseAnalyticsShellProps) {
  const { width } = useWindowDimensions();
  const compact = isPulseCompact(width);
  const desktop = isPulseDesktop(width);
  const dense = isPulseDense(width, embedded);
  const pad = pulseBodyPadding(width, embedded);
  const heroPad = pulseHeroPadding(width, embedded);
  const bodySpace = pulseBodySpacing(width, embedded);
  const visualMode = useMemo(
    (): PulseVisualMode => ({ dense, desktop, compact, embedded }),
    [dense, desktop, compact, embedded],
  );

  const useFinanceHero = Boolean(financialOverview);

  return (
    <PulseVisualModeContext.Provider value={visualMode}>
    <View style={pulseStyles.canvas}>
      {useFinanceHero ? (
        <View
          style={[
            pulseStyles.financeHeroBand,
            heroPad,
            { paddingHorizontal: pad },
          ]}
        >
          <Text
            style={[
              pulseStyles.financeHeroTitle,
              dense && pulseStyles.financeHeroTitleDense,
            ]}
            numberOfLines={1}
          >
            {title}
          </Text>
          <Text
            style={[
              pulseStyles.financeHeroSubtitle,
              dense && pulseStyles.financeHeroSubtitleDense,
            ]}
            numberOfLines={2}
          >
            {subtitle}
          </Text>
          <PulseFinancialOverviewCard {...financialOverview!} />
        </View>
      ) : (
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
              dense && pulseStyles.heroTitleCompact,
            ]}
          >
            {title}
          </Text>
          <Text
            style={[
              pulseStyles.heroSubtitle,
              dense && pulseStyles.heroSubtitleCompact,
            ]}
          >
            {subtitle}
          </Text>
        </View>
      )}
      <View
        style={[
          pulseStyles.body,
          bodySpace,
          { paddingHorizontal: pad },
          desktop && pulseStyles.bodyDesktop,
          dense && pulseStyles.bodyDense,
          useFinanceHero && pulseStyles.bodyAfterFinanceHero,
        ]}
      >
        {children}
      </View>
    </View>
    </PulseVisualModeContext.Provider>
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
  const { dense } = usePulseVisualMode();

  return (
    <View
      style={[
        pulseStyles.sectionBlock,
        dense && pulseStyles.sectionBlockDense,
      ]}
    >
      <Text
        style={[
          pulseStyles.sectionTitle,
          dense && pulseStyles.sectionTitleDense,
        ]}
      >
        {title}
      </Text>
      {subtitle ? (
        <Text
          style={[
            pulseStyles.sectionSubtitle,
            dense && pulseStyles.sectionSubtitleCompact,
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
  const { dense, embedded } = usePulseVisualMode();

  return (
    <View style={[pulseStyles.panel, dense && pulseStyles.panelCompact]}>
      <View
        style={[
          pulseStyles.panelHeader,
          dense && pulseStyles.panelHeaderCompact,
          embedded && dense && pulseStyles.panelHeaderFinance,
        ]}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={[
              pulseStyles.panelTitle,
              dense && pulseStyles.panelTitleCompact,
            ]}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text
              style={[
                pulseStyles.panelSubtitle,
                dense && pulseStyles.panelSubtitleCompact,
              ]}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>
        {rightIcon ?? (
          <FontAwesome
            name="bar-chart"
            size={dense ? 12 : 16}
            color={Theme.textMuted}
          />
        )}
      </View>
      <View
        style={[
          pulseStyles.panelBody,
          dense && pulseStyles.panelBodyCompact,
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
  const { dense, embedded } = usePulseVisualMode();
  const cols = pulseColumnCount(width);
  const gap = pulseKpiGap(width, embedded);

  const packedRows = useMemo(
    () => expandKpiRowsToGrid(rows, cols),
    [rows, cols],
  );

  return (
    <View style={[pulseStyles.kpiGrid, dense && pulseStyles.kpiGridCompact]}>
      {packedRows.map((row, ri) => (
        <View
          key={`kpi-row-${ri}`}
          style={[
            pulseStyles.kpiRow,
            dense && pulseStyles.kpiRowCompact,
            { gap },
          ]}
        >
          {row.map((cell, ci) => (
            <View
              key={cell?.id ?? `kpi-spacer-${ri}-${ci}`}
              style={[pulseStyles.kpiCell, dense && pulseStyles.kpiCellCompact]}
            >
              {cell ? (
                <PulseKpiCard {...cell} />
              ) : (
                <View
                  style={[
                    pulseStyles.kpiSpacer,
                    dense && pulseStyles.kpiSpacerDense,
                  ]}
                />
              )}
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
  const { embedded, dense } = usePulseVisualMode();
  const pad = pulseBodyPadding(width, embedded) * 2;
  const usable = Math.max(280, width - pad);
  const compact = isPulseCompact(width);
  const desktop = isPulseDesktop(width);
  const columns = compact
    ? 1
    : Math.max(1, Math.min(2, Math.floor(usable / minColumnWidth)));

  if (columns <= 1) {
    return <View style={pulseStyles.panelGridStack}>{children}</View>;
  }

  return (
    <View
      style={[
        pulseStyles.panelGridRow,
        desktop && { gap: dense ? 12 : 16 },
      ]}
    >
      {React.Children.map(children, (child, i) =>
        child ? (
          <View
            key={`panel-${i}`}
            style={[
              pulseStyles.panelGridItem,
              { minWidth: desktop ? minColumnWidth : minColumnWidth * 0.85 },
            ]}
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
  trend,
  badge,
}: PulseKpiItem) {
  const { dense, compact } = usePulseVisualMode();
  const trendUp = trend !== undefined && trend >= 0;

  return (
    <View
      style={[
        pulseStyles.kpiCard,
        dense && !compact && pulseStyles.kpiCardDense,
        compact && pulseStyles.kpiCardCompact,
      ]}
    >
      <View
        style={[
          pulseStyles.kpiCardHeader,
          dense && pulseStyles.kpiCardHeaderCompact,
        ]}
      >
        <Text
          style={[pulseStyles.kpiLabel, dense && pulseStyles.kpiLabelCompact]}
          numberOfLines={2}
        >
          {label}
        </Text>
      </View>
      <View>
        <Text
          style={[
            pulseStyles.kpiValue,
            dense && pulseStyles.kpiValueDense,
            compact && pulseStyles.kpiValueCompact,
            { color: valueColor },
          ]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
        >
          {value}
        </Text>
        <View
          style={[
            pulseStyles.kpiFooter,
            dense && pulseStyles.kpiFooterCompact,
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
            style={[pulseStyles.kpiSub, dense && pulseStyles.kpiSubCompact]}
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
  const { dense, compact } = usePulseVisualMode();

  return (
    <View
      style={[
        pulseStyles.panel,
        pulseStyles.healthCard,
        dense && !compact && pulseStyles.healthCardDense,
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
            dense && pulseStyles.healthScoreValueDense,
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
  const { dense, compact, desktop } = usePulseVisualMode();
  const ringSize = compact ? 112 : dense ? 132 : desktop ? 168 : 152;

  return (
    <View
      style={[
        pulseStyles.panel,
        pulseStyles.gaugeCard,
        dense && !compact && pulseStyles.gaugeCardDense,
        compact && pulseStyles.gaugeCardCompact,
        { overflow: "visible" as const },
      ]}
    >
      <View style={pulseStyles.gaugeCardInner}>
        <RiskMeter
          value={value}
          level={level}
          label={label}
          caption={caption}
          size={ringSize}
          stroke={compact ? 9 : dense ? 10 : 12}
        />
      </View>
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
  const stacked = width < 1024;

  if (stacked) {
    return (
      <View style={[pulseStyles.scoreGridCompact, { gap: 8 }]}>
        <View style={pulseStyles.scoreMainCompact}>{score}</View>
        <View style={pulseStyles.scoreSideCompact}>{gauge}</View>
      </View>
    );
  }

  return (
    <View style={[pulseStyles.scoreGrid, !stacked && pulseStyles.scoreGridDesktop]}>
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
  const { dense } = usePulseVisualMode();
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
      <Text
        style={[pulseStyles.laneValue, dense && pulseStyles.laneValueDense]}
      >
        {value}
      </Text>
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
  const { dense } = usePulseVisualMode();
  const s = INSIGHT_STYLE[tone];
  const parts = message.split(/(\*\*[^*]+\*\*)/g);

  return (
    <View
      style={[
        pulseStyles.insightRow,
        { backgroundColor: s.bg, borderColor: s.border },
      ]}
    >
      <FontAwesome name={s.icon as "check-circle"} size={dense ? 18 : 22} color={s.color} />
      <Text style={[pulseStyles.insightText, dense && pulseStyles.insightTextDense]}>
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
  /** Party detail analytics — tighter horizontal inset. */
  embedded?: boolean;
}): number {
  const { width } = useWindowDimensions();
  const sidePad =
    pulseBodyPadding(width, options?.embedded ?? false) * 2 +
    (options?.extraPadding ?? (options?.embedded ? 24 : 32));
  const usable = Math.max(280, width - sidePad);
  const wantCols = options?.columns ?? 1;
  const cols =
    wantCols > 1 && width >= 960
      ? Math.min(wantCols, Math.max(1, Math.floor(usable / 320)))
      : 1;
  const gap = cols > 1 ? 16 * (cols - 1) : 0;
  const colW = (usable - gap) / cols;
  return Math.max(280, colW);
}
