import { METRONIC } from "@/features/network/components/desktop/networkDesktopHub.styles";
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

type WidgetColumns = "4" | "2-1" | "2-1-1" | "1.5-1-1" | "1-1" | "1-1-1";

const WIDGET_COLUMNS: Record<WidgetColumns, string> = {
  "4": "repeat(4, minmax(0, 1fr))",
  "2-1": "minmax(0, 2fr) minmax(0, 1fr)",
  "2-1-1": "minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr)",
  "1.5-1-1": "minmax(0, 1.5fr) minmax(0, 1fr) minmax(0, 1fr)",
  "1-1": "minmax(0, 1fr) minmax(0, 1fr)",
  "1-1-1": "repeat(3, minmax(0, 1fr))",
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
  const cols = columns ?? Math.min(stories.length, 4);
  return (
    <View
      style={[
        styles.attentionRow,
        stacked && styles.widgetRowStack,
        !stacked && Platform.OS === "web"
          ? ({
              display: "grid",
              gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
            } as unknown as ViewStyle)
          : null,
      ]}
    >
      {stories.map((story, index) => (
        <Pressable
          key={story.id}
          onPress={() => onPress(story.id)}
          style={[
            cols === 1 ? styles.attentionFlat : styles.attentionCard,
            cols === 1 && index === stories.length - 1 && styles.attentionFlatLast,
          ]}
          accessibilityRole="button"
          accessibilityLabel={`Investigate ${story.title}`}
        >
          <Text style={[styles.attentionBadge, NOWRAP]} numberOfLines={1}>
            {story.badge}
          </Text>
          <Text style={[styles.attentionTitle, NOWRAP]} numberOfLines={1}>
            {story.title}
          </Text>
          <Text style={[styles.attentionAmount, NOWRAP]} numberOfLines={1}>
            {story.amount}
          </Text>
          {story.facts.map((fact) => (
            <Text key={fact} style={styles.attentionFact} numberOfLines={2}>
              {fact}
            </Text>
          ))}
        </Pressable>
      ))}
    </View>
  );
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

  if (compact) {
    return (
      <View
        onLayout={(e) => onLayout(Math.floor(e.nativeEvent.layout.width))}
        style={styles.flowCompact}
      >
        {BILLING_FLOW_STAGES.map((id) => {
          const data = pipeline.find((s) => s.id === id);
          const on = selected === id;
          return (
            <Pressable
              key={id}
              style={[styles.flowCompactRow, on && styles.flowCardOn]}
              onPress={() => onSelect(id)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`Billing stage ${BILLING_FLOW_LABELS[id]}`}
            >
              <View style={styles.flowCompactCopy}>
                <Text style={[styles.flowLabel, NOWRAP]} numberOfLines={1}>
                  {BILLING_FLOW_LABELS[id]}
                </Text>
                <Text style={[styles.flowMeta, NOWRAP]} numberOfLines={1}>
                  {`${formatCount(data?.count ?? 0)} trips · ${formatCount(data?.customerCount ?? 0)} customers`}
                </Text>
              </View>
              <Text style={[styles.flowCompactValue, NOWRAP]} numberOfLines={1}>
                {formatFinanceChip(data?.value ?? 0)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    );
  }

  const stages = BILLING_FLOW_STAGES.map((id, index) => {
    const data = pipeline.find((s) => s.id === id);
    const on = selected === id;
    return (
      <View key={id} style={[styles.flowItem, styles.flowItemFill]}>
        {index > 0 ? <Text style={styles.flowArrow}>→</Text> : null}
        <Pressable
          style={[styles.flowCard, styles.flowCardFill, on && styles.flowCardOn]}
          onPress={() => onSelect(id)}
          accessibilityRole="button"
          accessibilityState={{ selected: on }}
          accessibilityLabel={`Billing stage ${BILLING_FLOW_LABELS[id]}`}
        >
          <Text style={[styles.flowLabel, NOWRAP]} numberOfLines={1}>
            {short ? BILLING_FLOW_LABELS_SHORT[id] : BILLING_FLOW_LABELS[id]}
          </Text>
          <Text style={[styles.flowValue, NOWRAP]} numberOfLines={1}>
            {formatFinanceChip(data?.value ?? 0)}
          </Text>
          <Text style={[styles.flowMeta, NOWRAP]} numberOfLines={1}>
            {`${formatCount(data?.count ?? 0)} trips`}
          </Text>
          <Text style={[styles.flowMeta, NOWRAP]} numberOfLines={1}>
            {`${formatCount(data?.customerCount ?? 0)} customers`}
          </Text>
        </Pressable>
      </View>
    );
  });

  return (
    <View
      onLayout={(e) => onLayout(Math.floor(e.nativeEvent.layout.width))}
      style={styles.flowRowFill}
    >
      {stages}
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
    gap: 12,
    width: "100%",
  },
  stackCompact: {
    gap: 10,
  },
  kpiRow: {
    width: "100%",
    gap: 12,
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
    overflow: "hidden",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: METRONIC.border,
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 14,
    paddingVertical: 14,
    ...(Platform.OS === "web"
      ? ({ boxShadow: "0 0 20px 0 rgba(76, 87, 125, 0.04)" } as unknown as ViewStyle)
      : null),
  },
  kpiValue: {
    fontSize: 22,
    fontWeight: "800",
    color: METRONIC.text,
    letterSpacing: -0.5,
    fontVariant: ["tabular-nums"],
  },
  kpiLabel: {
    marginTop: 4,
    fontSize: 10,
    fontWeight: "700",
    color: METRONIC.muted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  kpiSub: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: "500",
    color: METRONIC.subtle,
  },
  widgetRow: {
    width: "100%",
    gap: 12,
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
    gap: 12,
    borderWidth: 1,
    borderColor: METRONIC.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
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
    marginBottom: 4,
  },
  heroCompact: {
    marginBottom: 0,
  },
  heroEyebrow: {
    fontSize: 11,
    fontWeight: "700",
    color: METRONIC.muted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  heroValue: {
    marginTop: 4,
    fontSize: 36,
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
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
    color: METRONIC.subtle,
  },
  heroCaptionCompact: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
  },
  attentionRow: {
    width: "100%",
    gap: 12,
    alignItems: "stretch",
  },
  attentionCard: {
    minWidth: 0,
    flex: 1,
    borderWidth: 1,
    borderColor: METRONIC.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: Theme.cardWhite,
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
    marginTop: 6,
    fontSize: 16,
    fontWeight: "800",
    color: METRONIC.text,
  },
  attentionAmount: {
    marginTop: 4,
    fontSize: 20,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    color: METRONIC.text,
  },
  attentionFact: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: "500",
    color: METRONIC.subtle,
  },
  monthRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 10,
  },
  monthChip: {
    minHeight: Layout.minTouchTargetSize,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: METRONIC.border,
    backgroundColor: "#F9FAFB",
  },
  monthChipOn: {
    borderColor: Theme.primary,
    backgroundColor: Theme.brandBlueWashSubtle,
  },
  monthLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: METRONIC.muted,
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
    paddingVertical: 4,
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
    minWidth: 88,
    minHeight: Layout.minTouchTargetSize,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: METRONIC.border,
    backgroundColor: "#F9FAFB",
    overflow: "hidden",
  },
  flowCardFill: {
    flex: 1,
    minWidth: 72,
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
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: METRONIC.border,
    backgroundColor: "#F9FAFB",
  },
  flowCompactCopy: {
    flex: 1,
    minWidth: 0,
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
  },
  flowLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: METRONIC.muted,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  flowValue: {
    marginTop: 6,
    fontSize: 16,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    color: METRONIC.text,
    flexShrink: 0,
  },
  flowMeta: { marginTop: 2, fontSize: 11, color: METRONIC.subtle },
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
