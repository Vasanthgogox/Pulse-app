import {
  METRONIC,
  METRONIC_HEX_BACKGROUND,
} from "@/features/network/components/desktop/networkDesktopHub.styles";
import Theme from "@/constants/Theme";
import Layout from "@/constants/Layout";
import { formatCount, formatFinanceChip, formatFinanceInr } from "./financeProFormat";
import { FINANCE_PRO_STACK_BREAKPOINT } from "./financeProLayout";
import {
  OBLIGATION_AGE_BUCKETS,
  OBLIGATION_AGE_LABELS,
  type ObligationAgeBucket,
  type PipelineStage,
  type PipelineStageId,
} from "../model/financeProTypes";
import { Children, createContext, useContext, useState, type ReactNode } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";

export const FINANCE_PRO_CANVAS_BG = METRONIC.bodyBg;

const FinanceProCompactContext = createContext(false);

export function FinanceProCompactScope({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <FinanceProCompactContext.Provider value={true}>
      {children}
    </FinanceProCompactContext.Provider>
  );
}

function useFinanceProCompact() {
  return useContext(FinanceProCompactContext);
}

type WidgetColumns = "4" | "1-2" | "2-1" | "2-1-1" | "1.5-1-1" | "1-1" | "1-1-1";

const WIDGET_COLUMNS: Record<WidgetColumns, string> = {
  "4": "repeat(4, minmax(0, 1fr))",
  "1-2": "minmax(0, 1fr) minmax(0, 1.85fr)",
  "2-1": "minmax(0, 2fr) minmax(0, 1fr)",
  "2-1-1": "minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr)",
  "1.5-1-1": "minmax(0, 1.5fr) minmax(0, 1fr) minmax(0, 1fr)",
  "1-1": "minmax(0, 1fr) minmax(0, 1fr)",
  "1-1-1": "repeat(3, minmax(0, 1fr))",
};

export const AGE_BUCKET_COLORS: Record<ObligationAgeBucket, string> = {
  current: Theme.chartSeries2,
  d1_15: Theme.chartSeries1,
  d16_30: Theme.chartSeries5,
  d31_60: Theme.chartSeries4,
  d60: Theme.chartSeries3,
};

const NOWRAP =
  Platform.OS === "web"
    ? ({ whiteSpace: "nowrap" } as unknown as TextStyle)
    : null;

export const BILLING_FLOW_STAGES = [
  "completed",
  "pod_pending",
  "ready_to_invoice",
  "invoiced",
  "cash_attributed",
] as const;

export type BillingFlowStage = (typeof BILLING_FLOW_STAGES)[number];

export const BILLING_FLOW_LABELS: Record<BillingFlowStage, string> = {
  completed: "Completed",
  pod_pending: "POD",
  ready_to_invoice: "Ready to bill",
  invoiced: "Invoiced",
  cash_attributed: "Cash attributed",
};

export const BILLING_FLOW_LABELS_SHORT: Record<BillingFlowStage, string> = {
  completed: "Completed",
  pod_pending: "POD",
  ready_to_invoice: "Ready",
  invoiced: "Invoiced",
  cash_attributed: "Cash",
};

export function useFinanceProDesktop() {
  const { width } = useWindowDimensions();
  return {
    width,
    stacked: width < FINANCE_PRO_STACK_BREAKPOINT,
  };
}

export function FinanceProStack({ children }: { children: ReactNode }) {
  const compact = useFinanceProCompact();
  return (
    <View style={[styles.stack, compact && styles.stackCompact]}>{children}</View>
  );
}

export function FinanceProKpiRow({ children }: { children: ReactNode }) {
  const { width } = useWindowDimensions();
  const cols = width < 720 ? 1 : width < FINANCE_PRO_STACK_BREAKPOINT ? 2 : 4;
  return (
    <View
      style={[
        styles.kpiRow,
        Platform.OS === "web"
          ? ({
              display: "grid",
              gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
              alignItems: "stretch",
            } as unknown as ViewStyle)
          : cols === 1
            ? styles.kpiRowStack
            : styles.kpiRowNative,
      ]}
    >
      {children}
    </View>
  );
}

export function FinanceProKpiCard({
  label,
  value,
  sub,
  onPress,
}: {
  label: string;
  value: string;
  sub?: string;
  onPress?: () => void;
}) {
  const inner = (
    <View style={styles.kpiCard}>
      <Text style={[styles.kpiValue, NOWRAP]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={[styles.kpiLabel, NOWRAP]} numberOfLines={1}>
        {label}
      </Text>
      {sub ? (
        <Text style={styles.kpiSub} numberOfLines={2}>
          {sub}
        </Text>
      ) : null}
    </View>
  );
  if (!onPress) {
    return <View style={styles.kpiPress}>{inner}</View>;
  }
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={styles.kpiPress}
    >
      {inner}
    </Pressable>
  );
}

export function FinanceProMiniKpiGrid({ children }: { children: ReactNode }) {
  return (
    <View
      style={[
        styles.miniGrid,
        Platform.OS === "web"
          ? ({
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
              gridTemplateRows: "minmax(0, 1fr) minmax(0, 1fr)",
              alignItems: "stretch",
            } as unknown as ViewStyle)
          : styles.miniGridNative,
      ]}
    >
      {children}
    </View>
  );
}

export function FinanceProMiniKpi({
  label,
  value,
  sub,
  onPress,
}: {
  label: string;
  value: string;
  sub?: string;
  onPress?: () => void;
}) {
  const inner = (
    <View style={styles.miniKpi}>
      <Text style={[styles.miniKpiValue, NOWRAP]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.miniKpiLabel} numberOfLines={1}>
        {label}
      </Text>
      {sub ? (
        <Text style={styles.miniKpiSub} numberOfLines={1}>
          {sub}
        </Text>
      ) : null}
    </View>
  );
  if (!onPress) {
    return <View style={styles.miniKpiPress}>{inner}</View>;
  }
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label} ${value}`}
      style={styles.miniKpiPress}
    >
      {inner}
    </Pressable>
  );
}

export function FinanceProHeroStat({
  label,
  value,
  badge,
  caption,
  metrics,
  progressPct,
}: {
  label: string;
  value: string;
  badge?: string;
  caption?: string;
  metrics?: { label: string; value: string }[];
  progressPct?: number;
}) {
  const pct = Math.max(0, Math.min(100, progressPct ?? 0));
  return (
    <View style={styles.heroStat}>
      {Platform.OS === "web" ? (
        <View pointerEvents="none" style={styles.heroStatPattern} />
      ) : null}
      <View style={styles.heroStatBody}>
        <Text style={styles.heroStatLabel}>{label}</Text>
        <View style={styles.heroStatValueRow}>
          <Text style={styles.heroStatValue} numberOfLines={1}>
            {value}
          </Text>
          {badge ? (
            <View style={styles.heroStatBadge}>
              <Text style={styles.heroStatBadgeText}>{badge}</Text>
            </View>
          ) : null}
        </View>
        {caption ? (
          <Text style={styles.heroStatCaption} numberOfLines={2}>
            {caption}
          </Text>
        ) : null}
        {progressPct != null ? (
          <View style={styles.heroProgressTrack} accessibilityRole="progressbar">
            <View style={[styles.heroProgressFill, { width: `${pct}%` }]} />
          </View>
        ) : null}
        {metrics && metrics.length > 0 ? (
          <View style={styles.heroMetricRow}>
            {metrics.map((metric) => (
              <View key={metric.label} style={styles.heroMetric}>
                <Text style={styles.heroMetricLabel} numberOfLines={1}>
                  {metric.label}
                </Text>
                <Text style={[styles.heroMetricValue, NOWRAP]} numberOfLines={1}>
                  {metric.value}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

export function FinanceProChartLegend({
  items,
}: {
  items: { label: string; color: string }[];
}) {
  return (
    <View style={styles.chartLegend}>
      {items.map((item) => (
        <View key={item.label} style={styles.chartLegendItem}>
          <View style={[styles.chartLegendDot, { backgroundColor: item.color }]} />
          <Text style={styles.chartLegendLabel}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}

export function FinanceProWidgetRow({
  columns,
  children,
}: {
  columns: WidgetColumns;
  children: ReactNode;
}) {
  const { stacked } = useFinanceProDesktop();
  return (
    <View
      style={[
        styles.widgetRow,
        stacked
          ? styles.widgetRowStack
          : Platform.OS === "web"
            ? ({
                display: "grid",
                gridTemplateColumns: WIDGET_COLUMNS[columns],
                alignItems: "stretch",
              } as unknown as ViewStyle)
            : styles.widgetRowNative,
      ]}
    >
      {children}
    </View>
  );
}

export function FinanceProGrid({
  stacked,
  children,
}: {
  stacked: boolean;
  children: ReactNode;
}) {
  return (
    <View
      style={[
        styles.grid,
        stacked && styles.gridStack,
        !stacked && Platform.OS === "web"
          ? ({
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
            } as unknown as ViewStyle)
          : null,
      ]}
    >
      {children}
    </View>
  );
}

export function FinanceProPanel({
  title,
  kicker,
  action,
  children,
}: {
  title: string;
  kicker?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const compact = useFinanceProCompact();
  return (
    <View style={[styles.panel, compact && styles.panelCompact]}>
      <View style={[styles.panelHead, compact && styles.panelHeadCompact]}>
        <View style={styles.panelCopy}>
          <Text style={styles.panelTitle}>{title}</Text>
          {kicker ? <Text style={styles.panelKicker}>{kicker}</Text> : null}
        </View>
        {action}
      </View>
      {children}
    </View>
  );
}

export function FinanceProPageHero({
  eyebrow,
  value,
  caption,
  children,
}: {
  eyebrow: string;
  value: string;
  caption?: string;
  children?: ReactNode;
}) {
  const compact = useFinanceProCompact();
  return (
    <View style={[styles.hero, compact && styles.heroCompact]}>
      <Text style={styles.heroEyebrow}>{eyebrow}</Text>
      <Text style={[styles.heroValue, compact && styles.heroValueCompact]}>
        {value}
      </Text>
      {caption ? (
        <Text style={[styles.heroCaption, compact && styles.heroCaptionCompact]}>
          {caption}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

export function FinanceProAttentionGrid({
  stories,
  onPress,
  columns,
}: {
  stories: {
    id: string;
    badge: string;
    title: string;
    amount: string;
    facts: string[];
  }[];
  onPress: (id: string) => void;
  columns?: number;
}) {
  const { stacked } = useFinanceProDesktop();
  if (stories.length === 0) return null;
  const cols = Math.min(columns ?? stories.length, 4);
  return (
    <View
      style={[
        styles.attentionRow,
        stacked && styles.widgetRowStack,
        !stacked && Platform.OS === "web"
          ? ({
              display: "grid",
              gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
              alignItems: "stretch",
            } as unknown as ViewStyle)
          : styles.attentionRowNative,
      ]}
    >
      {stories.map((story, index) => (
        <Pressable
          key={story.id}
          onPress={() => onPress(story.id)}
          style={[
            cols === 1 ? styles.attentionFlat : styles.attentionCard,
            cols === 1 && index === stories.length - 1 && styles.attentionFlatLast,
            Platform.OS === "web"
              ? ({ cursor: "pointer" } as unknown as ViewStyle)
              : null,
          ]}
          accessibilityRole="button"
          accessibilityLabel={`Investigate ${story.title}`}
        >
          <View style={styles.attentionCardTop}>
            <View
              style={[
                styles.attentionBadgeWrap,
                attentionToneStyle(story.badge),
              ]}
            >
              <Text style={[styles.attentionBadge, NOWRAP]} numberOfLines={1}>
                {story.badge}
              </Text>
            </View>
            <Text style={[styles.attentionTitle, NOWRAP]} numberOfLines={1}>
              {story.title}
            </Text>
            <Text style={[styles.attentionAmount, NOWRAP]} numberOfLines={1}>
              {story.amount}
            </Text>
          </View>
          {story.facts.length > 0 ? (
            <View style={styles.attentionFactList}>
              {story.facts.map((fact) => (
                <View key={fact} style={styles.attentionFactChip}>
                  <Text style={styles.attentionFact} numberOfLines={2}>
                    {fact}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
          <Text style={styles.attentionCta}>Review</Text>
        </Pressable>
      ))}
    </View>
  );
}

function attentionToneStyle(badge: string) {
  const key = badge.toLowerCase();
  if (key.includes("oldest") || key.includes("blocked")) {
    return styles.attentionBadgeCritical;
  }
  if (key.includes("concentration") || key.includes("highest")) {
    return styles.attentionBadgeWarn;
  }
  if (key.includes("billed")) {
    return styles.attentionBadgeGood;
  }
  return null;
}

export function FinanceProMonthStrip({
  months,
  selectedKey,
  onSelect,
}: {
  months: { key: string; label: string; billed: number }[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
}) {
  return (
    <View style={styles.monthRow}>
      {months.map((month) => {
        const on = selectedKey === month.key;
        return (
          <Pressable
            key={month.key}
            onPress={() => onSelect(month.key)}
            style={[styles.monthChip, on && styles.monthChipOn]}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
          >
            <Text style={[styles.monthLabel, on && styles.monthLabelOn]}>
              {month.label}
            </Text>
            <Text style={styles.monthValue}>{formatFinanceChip(month.billed)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function FinanceProAgeBoard({
  totals,
  selected,
  onSelect,
}: {
  totals: Record<ObligationAgeBucket, number>;
  selected: ObligationAgeBucket | null;
  onSelect: (bucket: ObligationAgeBucket) => void;
}) {
  const [width, setWidth] = useState(0);
  const compact = width > 0 && width < 520;
  if (compact) {
    return (
      <View
        onLayout={(e) => {
          const next = Math.floor(e.nativeEvent.layout.width);
          if (next > 0 && next !== width) setWidth(next);
        }}
      >
        <FinanceProAgeStrip totals={totals} selected={selected} onSelect={onSelect} />
      </View>
    );
  }
  return (
    <View
      onLayout={(e) => {
        const next = Math.floor(e.nativeEvent.layout.width);
        if (next > 0 && next !== width) setWidth(next);
      }}
      style={styles.ageBoard}
    >
      {OBLIGATION_AGE_BUCKETS.map((key) => {
        const on = selected === key;
        return (
          <Pressable
            key={key}
            style={[styles.ageBoardCell, on && styles.flowCardOn]}
            onPress={() => onSelect(key)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`Age ${OBLIGATION_AGE_LABELS[key]}, ${formatFinanceInr(totals[key])}`}
          >
            <Text style={[styles.flowLabel, NOWRAP]} numberOfLines={1}>
              {OBLIGATION_AGE_LABELS[key]}
            </Text>
            <Text style={[styles.flowValue, NOWRAP]} numberOfLines={1}>
              {formatFinanceChip(totals[key])}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function FinanceProAgeHighlights({
  totals,
  selected,
  onSelect,
  title = "Aging",
  kicker = "Open book by days outstanding",
  heroLabel = "All open exposure",
  badge,
}: {
  totals: Record<ObligationAgeBucket, number>;
  selected: ObligationAgeBucket | null;
  onSelect: (bucket: ObligationAgeBucket) => void;
  title?: string;
  kicker?: string;
  heroLabel?: string;
  badge?: string;
}) {
  const outstanding = OBLIGATION_AGE_BUCKETS.reduce(
    (sum, key) => sum + (totals[key] ?? 0),
    0,
  );
  const agedShare =
    outstanding > 0 ? ((totals.d60 + totals.d31_60) / outstanding) * 100 : 0;
  const barTotal = Math.max(outstanding, 1);

  return (
    <View style={styles.ageHighlights}>
      <View style={styles.ageHighlightsHead}>
        <Text style={styles.panelTitle}>{title}</Text>
        <Text style={styles.panelKicker}>{kicker}</Text>
      </View>
      <View style={styles.ageHighlightsHero}>
        <Text style={styles.ageHighlightsKicker}>{heroLabel}</Text>
        <View style={styles.heroStatValueRow}>
          <Text style={styles.ageHighlightsValue} numberOfLines={1}>
            {formatFinanceInr(outstanding)}
          </Text>
          {outstanding > 0 ? (
            <View
              style={[
                styles.heroStatBadge,
                !badge && agedShare >= 40 && styles.heroStatBadgeWarn,
              ]}
            >
              <Text
                style={[
                  styles.heroStatBadgeText,
                  !badge && agedShare >= 40 && styles.heroStatBadgeWarnText,
                ]}
              >
                {badge ?? `${agedShare.toFixed(0)}% over 30d`}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
      <View style={styles.ageStackTrack}>
        {OBLIGATION_AGE_BUCKETS.map((key) => {
          const widthPct = Math.max(0, (totals[key] / barTotal) * 100);
          if (widthPct <= 0) return null;
          return (
            <View
              key={key}
              style={[
                styles.ageStackFill,
                {
                  width: `${widthPct}%`,
                  backgroundColor: AGE_BUCKET_COLORS[key],
                },
              ]}
            />
          );
        })}
      </View>
      <View style={styles.ageHighlightList}>
        {OBLIGATION_AGE_BUCKETS.map((key) => {
          const on = selected === key;
          const share = outstanding > 0 ? (totals[key] / outstanding) * 100 : 0;
          return (
            <Pressable
              key={key}
              onPress={() => onSelect(key)}
              style={[styles.ageHighlightRow, on && styles.ageHighlightRowOn]}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`Age ${OBLIGATION_AGE_LABELS[key]}, ${formatFinanceInr(totals[key])}`}
            >
              <View
                style={[
                  styles.ageHighlightDot,
                  { backgroundColor: AGE_BUCKET_COLORS[key] },
                ]}
              />
              <Text style={styles.ageHighlightLabel} numberOfLines={1}>
                {OBLIGATION_AGE_LABELS[key]}
              </Text>
              <Text style={styles.ageHighlightShare} numberOfLines={1}>
                {share > 0 ? `${share.toFixed(0)}%` : "—"}
              </Text>
              <Text style={[styles.ageHighlightAmount, NOWRAP]} numberOfLines={1}>
                {formatFinanceChip(totals[key])}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function FinanceProCollectRank({
  rows,
  selectedId,
  onSelect,
}: {
  rows: {
    id: string;
    name: string;
    amount: number;
    share: number;
    hint: string;
  }[];
  selectedId: string | null;
  onSelect: (id: string, name: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <Text style={styles.collectEmpty}>No customers with open exposure.</Text>
    );
  }
  return (
    <View style={styles.collectList}>
      {rows.map((row) => {
        const on = selectedId === row.id;
        const barPct = Math.max(0, Math.min(100, row.share));
        const concentrated = row.share >= 40;
        return (
          <Pressable
            key={row.id}
            onPress={() => onSelect(row.id, row.name)}
            style={[styles.collectRow, on && styles.collectRowOn]}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`Collect from ${row.name}, ${formatFinanceInr(row.amount)}`}
          >
            <View style={styles.collectRowTop}>
              <Text style={[styles.collectName, NOWRAP]} numberOfLines={1}>
                {row.name}
              </Text>
              <Text
                style={[
                  styles.collectShare,
                  concentrated && styles.collectShareWarn,
                ]}
                numberOfLines={1}
              >
                {`${row.share.toFixed(row.share >= 10 ? 0 : 1)}%`}
              </Text>
            </View>
            <View style={styles.collectRowMid}>
              <Text style={[styles.collectAmount, NOWRAP]} numberOfLines={1}>
                {formatFinanceInr(row.amount)}
              </Text>
              <Text style={styles.collectHint} numberOfLines={1}>
                {row.hint}
              </Text>
            </View>
            <View style={styles.collectBarTrack}>
              <View
                style={[
                  styles.collectBarFill,
                  concentrated && styles.collectBarWarn,
                  { width: `${Math.max(barPct, barPct > 0 ? 4 : 0)}%` },
                ]}
              />
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

export function FinanceProMetric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  const compact = useFinanceProCompact();
  return (
    <View style={[styles.metric, compact && styles.metricCompact]}>
      <Text style={[styles.metricLabel, NOWRAP]} numberOfLines={1}>
        {label}
      </Text>
      <Text
        style={[styles.metricValue, compact && styles.metricValueCompact]}
        numberOfLines={compact ? 2 : 1}
      >
        {value}
      </Text>
      {hint ? (
        <Text style={styles.metricHint} numberOfLines={2}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

export function FinanceProMetricRow({ children }: { children: ReactNode }) {
  const { stacked } = useFinanceProDesktop();
  return (
    <View
      style={[
        styles.metricRow,
        stacked
          ? styles.metricRowStack
          : Platform.OS === "web"
            ? ({
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(128px, 1fr))",
                alignItems: "start",
              } as unknown as ViewStyle)
            : styles.metricRowNative,
      ]}
    >
      {children}
    </View>
  );
}

export function FinanceProFactGrid({ children }: { children: ReactNode }) {
  const { stacked } = useFinanceProDesktop();
  const items = Children.toArray(children);
  return (
    <View
      style={[
        styles.factGrid,
        stacked
          ? styles.factGridStack
          : Platform.OS === "web"
            ? ({
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                alignItems: "start",
                columnGap: 20,
                rowGap: 14,
              } as unknown as ViewStyle)
            : styles.factGridNative,
      ]}
    >
      {stacked || Platform.OS === "web"
        ? items
        : items.map((child, index) => (
            <View key={index} style={styles.factCell}>
              {child}
            </View>
          ))}
    </View>
  );
}

export function FinanceProAgeStrip({
  totals,
  selected,
  onSelect,
}: {
  totals: Record<ObligationAgeBucket, number>;
  selected: ObligationAgeBucket | null;
  onSelect: (bucket: ObligationAgeBucket) => void;
}) {
  const max = Math.max(...OBLIGATION_AGE_BUCKETS.map((k) => totals[k]), 1);
  return (
    <View>
      {OBLIGATION_AGE_BUCKETS.map((key) => {
        const on = selected === key;
        const pct = Math.max(2, (totals[key] / max) * 100);
        return (
          <Pressable
            key={key}
            style={[styles.ageRow, on && styles.ageRowOn]}
            onPress={() => onSelect(key)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${OBLIGATION_AGE_LABELS[key]}, ${formatFinanceInr(totals[key])}`}
          >
            <Text style={styles.ageLabel}>{OBLIGATION_AGE_LABELS[key]}</Text>
            <View style={styles.ageTrack}>
              <View style={[styles.ageFill, { width: `${pct}%` }]} />
            </View>
            <Text style={styles.ageValue}>{formatFinanceChip(totals[key])}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function FinanceProPipelineFlow({
  pipeline,
  selected,
  onSelect,
}: {
  pipeline: PipelineStage[];
  selected: PipelineStageId | null;
  onSelect: (id: PipelineStageId) => void;
}) {
  const [width, setWidth] = useState(0);
  const compact = width > 0 && width < 640;
  const short = width > 0 && width < 920;
  const onLayout = (next: number) => {
    if (next > 0 && next !== width) setWidth(next);
  };
  const maxValue = Math.max(
    ...BILLING_FLOW_STAGES.map(
      (id) => pipeline.find((s) => s.id === id)?.value ?? 0,
    ),
    1,
  );

  if (compact) {
    return (
      <View
        onLayout={(e) => onLayout(Math.floor(e.nativeEvent.layout.width))}
        style={styles.flowCompact}
      >
        {BILLING_FLOW_STAGES.map((id, index) => {
          const data = pipeline.find((s) => s.id === id);
          const on = selected === id;
          const empty = (data?.value ?? 0) <= 0;
          const barPct = Math.max(0, ((data?.value ?? 0) / maxValue) * 100);
          return (
            <Pressable
              key={id}
              style={[
                styles.flowCompactRow,
                on && styles.flowCardOn,
                empty && styles.flowCardEmpty,
              ]}
              onPress={() => onSelect(id)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`Billing stage ${BILLING_FLOW_LABELS[id]}`}
            >
              <View style={styles.flowCompactCopy}>
                <Text style={[styles.flowStep, NOWRAP]} numberOfLines={1}>
                  {String(index + 1).padStart(2, "0")}
                </Text>
                <Text style={[styles.flowLabel, NOWRAP]} numberOfLines={1}>
                  {BILLING_FLOW_LABELS[id]}
                </Text>
                <View style={styles.flowBarTrack}>
                  <View style={[styles.flowBarFill, { width: `${barPct}%` }]} />
                </View>
                <Text style={[styles.flowMeta, NOWRAP]} numberOfLines={1}>
                  {`${formatCount(data?.count ?? 0)} trips · ${formatCount(data?.customerCount ?? 0)} customers`}
                </Text>
              </View>
              <Text
                style={[
                  styles.flowCompactValue,
                  empty && styles.flowValueEmpty,
                  NOWRAP,
                ]}
                numberOfLines={1}
              >
                {formatFinanceChip(data?.value ?? 0)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    );
  }

  return (
    <View
      onLayout={(e) => onLayout(Math.floor(e.nativeEvent.layout.width))}
      style={[
        styles.flowGrid,
        Platform.OS === "web"
          ? ({
              display: "grid",
              gridTemplateColumns: `repeat(${BILLING_FLOW_STAGES.length}, minmax(0, 1fr))`,
              alignItems: "stretch",
            } as unknown as ViewStyle)
          : styles.flowRowFill,
      ]}
    >
      {BILLING_FLOW_STAGES.map((id, index) => {
        const data = pipeline.find((s) => s.id === id);
        const on = selected === id;
        const empty = (data?.value ?? 0) <= 0;
        const barPct = Math.max(0, ((data?.value ?? 0) / maxValue) * 100);
        return (
          <Pressable
            key={id}
            style={[
              styles.flowCard,
              styles.flowCardFill,
              on && styles.flowCardOn,
              empty && styles.flowCardEmpty,
              Platform.OS === "web"
                ? ({ cursor: "pointer" } as unknown as ViewStyle)
                : null,
            ]}
            onPress={() => onSelect(id)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`Billing stage ${BILLING_FLOW_LABELS[id]}`}
          >
            <View style={styles.flowCardHead}>
              <Text style={styles.flowStep}>
                {String(index + 1).padStart(2, "0")}
              </Text>
              <Text style={[styles.flowLabel, NOWRAP]} numberOfLines={1}>
                {short ? BILLING_FLOW_LABELS_SHORT[id] : BILLING_FLOW_LABELS[id]}
              </Text>
            </View>
            <Text
              style={[styles.flowValue, empty && styles.flowValueEmpty, NOWRAP]}
              numberOfLines={1}
            >
              {formatFinanceChip(data?.value ?? 0)}
            </Text>
            <View style={styles.flowBarTrack}>
              <View
                style={[
                  styles.flowBarFill,
                  { width: `${Math.max(barPct, empty ? 0 : 6)}%` },
                ]}
              />
            </View>
            <Text style={[styles.flowMeta, NOWRAP]} numberOfLines={1}>
              {`${formatCount(data?.count ?? 0)} trips · ${formatCount(data?.customerCount ?? 0)} customers`}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export type { FinanceProTableColumn } from "./FinanceProDataTable";
export { FinanceProDataTable } from "./FinanceProDataTable";

export function FinanceProPrimaryAction({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={styles.primary}
      onPress={onPress}
      accessibilityRole="button"
    >
      <Text style={styles.primaryText}>{label}</Text>
    </Pressable>
  );
}

export function FinanceProQuietAction({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={styles.quiet}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={styles.quietText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: 16,
    width: "100%",
  },
  stackCompact: {
    gap: 12,
  },
  kpiRow: {
    width: "100%",
    gap: 16,
  },
  kpiRowNative: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  kpiRowStack: {
    display: "flex",
    flexDirection: "column",
  },
  kpiPress: {
    minWidth: 0,
    flex: 1,
    height: "100%",
  },
  kpiCard: {
    minWidth: 0,
    flex: 1,
    height: "100%",
    justifyContent: "center",
    overflow: "hidden",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: METRONIC.border,
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 18,
    paddingVertical: 16,
    ...(Platform.OS === "web"
      ? ({ boxShadow: "0 0 20px 0 rgba(76, 87, 125, 0.04)" } as unknown as ViewStyle)
      : null),
  },
  kpiValue: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "800",
    color: METRONIC.text,
    letterSpacing: -0.5,
    fontVariant: ["tabular-nums"],
  },
  kpiLabel: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: "600",
    color: METRONIC.subtle,
    textTransform: "none",
    letterSpacing: 0,
  },
  kpiSub: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: "500",
    color: METRONIC.muted,
  },
  miniGrid: {
    width: "100%",
    gap: 16,
    alignSelf: "stretch",
    flex: 1,
  },
  miniGridNative: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  miniGridStack: {
    display: "flex",
    flexDirection: "column",
  },
  miniKpiPress: {
    minWidth: 0,
    flex: 1,
    flexBasis: 140,
    height: "100%",
  },
  miniKpi: {
    minWidth: 0,
    flex: 1,
    height: "100%",
    justifyContent: "center",
    overflow: "hidden",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: METRONIC.border,
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 18,
    paddingVertical: 16,
    ...(Platform.OS === "web"
      ? ({ boxShadow: "0 0 20px 0 rgba(76, 87, 125, 0.04)" } as unknown as ViewStyle)
      : null),
  },
  miniKpiValue: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: "800",
    color: METRONIC.text,
    letterSpacing: -0.6,
    fontVariant: ["tabular-nums"],
  },
  miniKpiLabel: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: "600",
    color: METRONIC.subtle,
  },
  miniKpiSub: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: "500",
    color: METRONIC.muted,
  },
  heroStat: {
    minWidth: 0,
    flex: 1,
    alignSelf: "stretch",
    overflow: "hidden",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: METRONIC.border,
    backgroundColor: Theme.cardWhite,
    position: "relative",
    ...(Platform.OS === "web"
      ? ({ boxShadow: "0 0 20px 0 rgba(76, 87, 125, 0.04)" } as unknown as ViewStyle)
      : null),
  },
  heroStatPattern: {
    ...StyleSheet.absoluteFillObject,
    ...METRONIC_HEX_BACKGROUND,
    opacity: 0.55,
  },
  heroStatBody: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 22,
    gap: 8,
    zIndex: 1,
  },
  heroStatLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: METRONIC.subtle,
  },
  heroStatValueRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
  },
  heroStatValue: {
    fontSize: 34,
    lineHeight: 40,
    fontWeight: "800",
    letterSpacing: -1,
    fontVariant: ["tabular-nums"],
    color: METRONIC.text,
    flexShrink: 1,
    minWidth: 0,
  },
  heroStatBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: Theme.scoreExcellentBg,
  },
  heroStatBadgeText: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.scoreExcellentFg,
  },
  heroStatBadgeWarn: {
    backgroundColor: Theme.scoreWarningBg,
  },
  heroStatBadgeWarnText: {
    color: Theme.scoreWarningFg,
  },
  heroStatCaption: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500",
    color: METRONIC.subtle,
    maxWidth: 420,
  },
  heroProgressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: Theme.surfaceGray,
    overflow: "hidden",
    marginTop: 4,
  },
  heroProgressFill: {
    height: 8,
    borderRadius: 4,
    backgroundColor: Theme.darkGreen,
  },
  heroMetricRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 20,
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: METRONIC.border,
  },
  heroMetric: {
    minWidth: 96,
    flexGrow: 1,
    flexBasis: 96,
  },
  heroMetricLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: METRONIC.muted,
  },
  heroMetricValue: {
    marginTop: 4,
    fontSize: 16,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    color: METRONIC.text,
  },
  chartLegend: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 14,
  },
  chartLegendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  chartLegendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  chartLegendLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: METRONIC.subtle,
  },
  ageHighlights: {
    minWidth: 0,
    width: "100%",
    alignSelf: "stretch",
    flex: 1,
    gap: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: METRONIC.border,
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 16,
    backgroundColor: Theme.cardWhite,
    ...(Platform.OS === "web"
      ? ({ boxShadow: "0 0 20px 0 rgba(76, 87, 125, 0.04)" } as unknown as ViewStyle)
      : null),
  },
  ageHighlightsHead: {
    gap: 2,
  },
  ageHighlightsHero: {
    gap: 4,
  },
  ageHighlightsKicker: {
    fontSize: 12,
    fontWeight: "600",
    color: METRONIC.muted,
  },
  ageHighlightsValue: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "800",
    letterSpacing: -0.8,
    fontVariant: ["tabular-nums"],
    color: METRONIC.text,
    flexShrink: 1,
    minWidth: 0,
  },
  ageStackTrack: {
    flexDirection: "row",
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
    backgroundColor: Theme.surfaceGray,
  },
  ageStackFill: {
    height: 8,
  },
  ageHighlightList: {
    gap: 2,
  },
  ageHighlightRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: Layout.minTouchTargetSize,
    gap: 10,
    paddingHorizontal: 6,
    marginHorizontal: -6,
    borderRadius: 8,
  },
  ageHighlightRowOn: {
    backgroundColor: Theme.brandBlueWashSubtle,
  },
  ageHighlightDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  ageHighlightLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: "600",
    color: METRONIC.subtle,
  },
  ageHighlightShare: {
    width: 40,
    textAlign: "right",
    fontSize: 12,
    fontWeight: "600",
    color: METRONIC.muted,
    fontVariant: ["tabular-nums"],
  },
  ageHighlightAmount: {
    minWidth: 64,
    textAlign: "right",
    fontSize: 13,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    color: METRONIC.text,
  },
  collectList: {
    gap: 4,
    width: "100%",
  },
  collectEmpty: {
    fontSize: 13,
    fontWeight: "500",
    color: METRONIC.subtle,
  },
  collectRow: {
    gap: 6,
    minHeight: Layout.minTouchTargetSize,
    paddingVertical: 10,
    paddingHorizontal: 8,
    marginHorizontal: -8,
    borderRadius: 10,
  },
  collectRowOn: {
    backgroundColor: Theme.brandBlueWashSubtle,
  },
  collectRowTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  collectName: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontWeight: "700",
    color: METRONIC.text,
  },
  collectShare: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.darkGreen,
    fontVariant: ["tabular-nums"],
  },
  collectShareWarn: {
    color: Theme.scoreWarningFg,
  },
  collectRowMid: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 12,
  },
  collectAmount: {
    fontSize: 15,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    color: METRONIC.text,
  },
  collectHint: {
    flex: 1,
    minWidth: 0,
    textAlign: "right",
    fontSize: 12,
    fontWeight: "500",
    color: METRONIC.subtle,
  },
  collectBarTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: Theme.surfaceGray,
    overflow: "hidden",
  },
  collectBarFill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: Theme.darkGreen,
  },
  collectBarWarn: {
    backgroundColor: Theme.chartSeries4,
  },
  widgetRow: {
    width: "100%",
    gap: 16,
    alignItems: "stretch",
    ...(Platform.OS === "web"
      ? ({ alignItems: "stretch" } as unknown as ViewStyle)
      : null),
  },
  widgetRowNative: {
    flexDirection: "row",
  },
  widgetRowStack: {
    display: "flex",
    flexDirection: "column",
  },
  grid: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 12,
    width: "100%",
  },
  gridStack: {
    flexDirection: "column",
    display: "flex",
  },
  panel: {
    minWidth: 0,
    width: "100%",
    alignSelf: "stretch",
    justifyContent: "flex-start",
    gap: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: METRONIC.border,
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 16,
    backgroundColor: Theme.cardWhite,
    ...(Platform.OS === "web"
      ? ({ boxShadow: "0 0 20px 0 rgba(76, 87, 125, 0.04)" } as unknown as ViewStyle)
      : null),
  },
  panelCompact: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
    gap: 12,
  },
  panelHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 0,
  },
  panelHeadCompact: {
    marginBottom: 0,
  },
  panelCopy: { flex: 1, minWidth: 0 },
  panelKicker: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: "500",
    color: METRONIC.muted,
  },
  panelTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: METRONIC.text,
  },
  hero: {
    overflow: "hidden",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: METRONIC.border,
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 24,
    paddingVertical: 22,
    ...(Platform.OS === "web"
      ? ({ boxShadow: "0 0 20px 0 rgba(76, 87, 125, 0.04)" } as unknown as ViewStyle)
      : null),
  },
  heroCompact: {
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  heroEyebrow: {
    fontSize: 12,
    fontWeight: "700",
    color: METRONIC.subtle,
  },
  heroValue: {
    marginTop: 6,
    fontSize: 34,
    fontWeight: "800",
    letterSpacing: -1,
    fontVariant: ["tabular-nums"],
    color: METRONIC.text,
  },
  heroValueCompact: {
    fontSize: 28,
    letterSpacing: -0.6,
  },
  heroCaption: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500",
    color: METRONIC.subtle,
    maxWidth: 560,
  },
  heroCaptionCompact: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 18,
  },
  attentionRow: {
    width: "100%",
    gap: 16,
    alignItems: "stretch",
  },
  attentionRowNative: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  attentionCard: {
    minWidth: 0,
    flex: 1,
    flexBasis: 240,
    minHeight: 176,
    height: "100%",
    justifyContent: "space-between",
    gap: 12,
    borderWidth: 1,
    borderColor: METRONIC.border,
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 16,
    backgroundColor: Theme.surface,
  },
  attentionCardTop: {
    gap: 6,
  },
  attentionBadgeWrap: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: Theme.brandBlueWashSubtle,
  },
  attentionBadgeWarn: {
    backgroundColor: Theme.scoreWarningBg,
  },
  attentionBadgeCritical: {
    backgroundColor: Theme.scoreCriticalBg,
  },
  attentionBadgeGood: {
    backgroundColor: Theme.scoreExcellentBg,
  },
  attentionFlat: {
    minWidth: 0,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: METRONIC.border,
  },
  attentionFlatLast: {
    borderBottomWidth: 0,
    paddingBottom: 0,
  },
  attentionBadge: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: Theme.primary,
  },
  attentionTitle: {
    marginTop: 2,
    fontSize: 18,
    fontWeight: "800",
    color: METRONIC.text,
  },
  attentionAmount: {
    marginTop: 2,
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.4,
    fontVariant: ["tabular-nums"],
    color: METRONIC.text,
  },
  attentionFactList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: METRONIC.border,
  },
  attentionFactChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: METRONIC.border,
    maxWidth: "100%",
  },
  attentionFact: {
    marginTop: 0,
    fontSize: 11,
    fontWeight: "600",
    color: METRONIC.subtle,
  },
  attentionCta: {
    fontSize: 12,
    fontWeight: "800",
    color: METRONIC.link,
  },
  monthRow: {
    flexDirection: "row",
    flexWrap: "nowrap",
    gap: 6,
    marginBottom: 4,
  },
  monthChip: {
    flex: 1,
    minWidth: 0,
    minHeight: Layout.minTouchTargetSize,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: METRONIC.border,
    backgroundColor: Theme.surface,
  },
  monthChipOn: {
    borderColor: Theme.primary,
    backgroundColor: Theme.brandBlueWashSubtle,
  },
  monthLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: METRONIC.muted,
    textAlign: "center",
  },
  monthLabelOn: {
    color: Theme.primary,
  },
  monthValue: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    color: METRONIC.text,
    textAlign: "center",
  },
  ageBoard: {
    width: "100%",
    gap: 8,
    ...(Platform.OS === "web"
      ? ({
          display: "grid",
          gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
          alignItems: "stretch",
        } as unknown as ViewStyle)
      : { flexDirection: "row", flexWrap: "wrap" }),
  },
  ageBoardCell: {
    minWidth: 0,
    flexGrow: 1,
    flexBasis: 0,
    minHeight: Layout.minTouchTargetSize,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: METRONIC.border,
    backgroundColor: "#F9FAFB",
  },
  metricRow: {
    width: "100%",
    gap: 16,
  },
  metricRowNative: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  metricRowStack: {
    display: "flex",
    flexDirection: "column",
  },
  factGrid: {
    width: "100%",
    gap: 14,
  },
  factGridNative: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  factCell: {
    width: "48%",
    flexGrow: 1,
    minWidth: 140,
  },
  factGridStack: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  metric: {
    minWidth: 0,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 140,
    marginBottom: 0,
  },
  metricCompact: {
    flexGrow: 0,
    flexBasis: "auto",
    width: "100%",
  },
  metricLabel: { fontSize: 11, fontWeight: "600", color: METRONIC.muted },
  metricValue: {
    marginTop: 4,
    fontSize: 18,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    color: METRONIC.text,
  },
  metricValueCompact: {
    fontSize: 16,
    lineHeight: 22,
    marginTop: 2,
  },
  metricHint: { marginTop: 2, fontSize: 11, color: METRONIC.muted },
  ageRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 36,
    gap: 10,
    paddingVertical: 4,
  },
  ageRowOn: {
    backgroundColor: Theme.brandBlueWashSubtle,
    marginHorizontal: -6,
    paddingHorizontal: 6,
    borderRadius: 8,
  },
  ageLabel: {
    width: 72,
    fontSize: 12,
    fontWeight: "700",
    color: METRONIC.subtle,
  },
  ageTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#F1F1F4",
    overflow: "hidden",
  },
  ageFill: {
    height: 8,
    borderRadius: 4,
    backgroundColor: Theme.primary,
  },
  ageValue: {
    width: 72,
    textAlign: "right",
    fontSize: 12,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    color: METRONIC.text,
  },
  flowRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 0,
    paddingVertical: 4,
  },
  flowRowFill: {
    flexDirection: "row",
    alignItems: "stretch",
    width: "100%",
    gap: 12,
    paddingVertical: 0,
  },
  flowGrid: {
    width: "100%",
    gap: 12,
  },
  flowItem: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  flowItemFill: {
    flex: 1,
    minWidth: 72,
  },
  flowArrow: {
    marginHorizontal: 6,
    alignSelf: "center",
    fontSize: 14,
    color: METRONIC.muted,
    fontWeight: "700",
  },
  flowCard: {
    minWidth: 0,
    minHeight: 148,
    paddingVertical: 16,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: METRONIC.border,
    backgroundColor: Theme.surface,
    overflow: "hidden",
    justifyContent: "space-between",
    gap: 8,
  },
  flowCardFill: {
    flex: 1,
    minWidth: 0,
    height: "100%",
  },
  flowCardHead: {
    gap: 4,
  },
  flowStep: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
    color: METRONIC.muted,
    fontVariant: ["tabular-nums"],
  },
  flowBarTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: Theme.cardWhite,
    overflow: "hidden",
  },
  flowBarFill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: Theme.primary,
  },
  flowCardEmpty: {
    opacity: 0.72,
  },
  flowValueEmpty: {
    color: METRONIC.muted,
  },
  flowCompact: {
    width: "100%",
    gap: 8,
  },
  flowCompactRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: Layout.minTouchTargetSize,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: METRONIC.border,
    backgroundColor: Theme.surface,
  },
  flowCompactCopy: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  flowCompactValue: {
    fontSize: 16,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    color: METRONIC.text,
    flexShrink: 0,
  },
  flowCardOn: {
    borderColor: Theme.primary,
    backgroundColor: Theme.brandBlueWashSubtle,
    opacity: 1,
  },
  flowLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: METRONIC.muted,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  flowValue: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.4,
    fontVariant: ["tabular-nums"],
    color: METRONIC.text,
    flexShrink: 0,
  },
  flowMeta: { fontSize: 11, fontWeight: "500", color: METRONIC.subtle },
  primary: {
    minHeight: Layout.minTouchTargetSize,
    paddingHorizontal: 14,
    justifyContent: "center",
    backgroundColor: Theme.primary,
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  primaryText: {
    color: Theme.screenBackground,
    fontWeight: "800",
    fontSize: 13,
  },
  quiet: {
    minHeight: Layout.minTouchTargetSize,
    justifyContent: "center",
    alignSelf: "flex-start",
  },
  quietText: {
    color: METRONIC.link,
    fontWeight: "800",
    fontSize: 13,
  },
});

export { FinanceProSelectableBars } from "./FinanceProSelectableBars";
