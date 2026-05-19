/**
 * Trips hub — bento intelligence metric row (reference: staggered manifest pulse cards).
 */
import type { ReactNode } from "react";
import { useEffect } from "react";
import Theme from "@/constants/Theme";
import type { TripMetricId } from "@/features/trips/utils/tripHubMetrics";
import { formatINRChip } from "@/lib/format";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { LinearGradient } from "expo-linear-gradient";
import { Radar } from "lucide-react-native";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from "react-native-reanimated";

export type ActiveMetricTabId = TripMetricId | "all";

export type BentoMetricVariant =
  | "indigo"
  | "slate"
  | "cyan"
  | "emerald"
  | "orange"
  | "purple"
  | "active";

export type BentoMetricSize = "large" | "small";

export type BentoMetricItem = {
  id: ActiveMetricTabId;
  count: number;
  title: string;
  subtitle: string;
  size: BentoMetricSize;
  variant: BentoMetricVariant;
  icon: React.ComponentProps<typeof FontAwesome>["name"];
};

const VARIANT_BLOB: Record<BentoMetricVariant, string> = {
  indigo: "#6366f1",
  slate: "#64748b",
  cyan: "#38bdf8",
  emerald: "#10b981",
  orange: "#f59e0b",
  purple: "#a855f7",
  active: "#6366f1",
};

/** Typography parity with `TripsHubViews` fleet / ledger cards. */
const FS_CAPTION = 8;
const FS_AMOUNT_LABEL = 7;
const FS_COUNT_LARGE = 28;
const FS_COUNT_SMALL = 22;

const BENTO_LAYOUT: Record<
  ActiveMetricTabId,
  { size: BentoMetricSize; variant: BentoMetricVariant }
> = {
  all: { size: "large", variant: "indigo" },
  unassigned: { size: "small", variant: "slate" },
  assigned: { size: "small", variant: "active" },
  loading: { size: "small", variant: "orange" },
  in_transit: { size: "small", variant: "cyan" },
  unloading: { size: "small", variant: "purple" },
  delivered_docs_pending: { size: "large", variant: "emerald" },
};

function BentoMetricCard({
  item,
  active,
  onPress,
  flexStyle,
}: {
  item: BentoMetricItem;
  active: boolean;
  onPress: () => void;
  flexStyle: ViewStyle;
}) {
  const hover = useSharedValue(0);
  const press = useSharedValue(0);
  const pulse = useSharedValue(0);
  const blobColor = VARIANT_BLOB[item.variant];
  const isZero = item.count === 0;

  useEffect(() => {
    if (!active || Platform.OS !== "web") return;
    pulse.value = withRepeat(
      withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
  }, [active, pulse]);

  const cardAnim = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: interpolate(hover.value, [0, 1], [0, active ? -4 : -2]),
      },
      {
        scale:
          (active ? 1.02 : 1) *
          interpolate(hover.value, [0, 1], [1, 1.006]) *
          interpolate(press.value, [0, 1], [1, 0.988]),
      },
    ],
  }));

  const scanAnim = useAnimatedStyle(() => ({
    opacity: interpolate(pulse.value, [0, 1], [0.65, 1]),
    transform: [{ scale: interpolate(pulse.value, [0, 1], [1, 1.08]) }],
  }));

  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => {
        hover.value = withTiming(1, { duration: 140 });
      }}
      onHoverOut={() => {
        hover.value = withTiming(0, { duration: 160 });
      }}
      onPressIn={() => {
        press.value = withSpring(1, { damping: 18, stiffness: 300 });
      }}
      onPressOut={() => {
        press.value = withSpring(0, { damping: 18, stiffness: 300 });
      }}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${item.title}, ${item.count} trips`}
      style={[styles.cardPressable, flexStyle]}
    >
      <Animated.View
        style={[
          styles.card,
          item.size === "large" && styles.cardLarge,
          active ? styles.cardGlow : styles.cardIdle,
          cardAnim,
        ]}
      >
        {!active ? (
          <View style={[StyleSheet.absoluteFill, styles.cardIdleBg]} />
        ) : (
          <LinearGradient
            colors={["#171A20", "#1e293b"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        )}

        <View
          style={[
            styles.cornerBlob,
            { backgroundColor: blobColor },
            active && styles.cornerBlobActive,
          ]}
          pointerEvents="none"
        />

        <View
          style={[
            styles.cardBody,
            item.size === "large" ? styles.cardBodyLarge : styles.cardBodySmall,
          ]}
        >
          <View style={styles.countRow}>
            <Text
              style={[
                styles.count,
                item.size === "large" ? styles.countLarge : styles.countSmall,
                active && styles.countActive,
                isZero && !active && styles.countZero,
              ]}
            >
              {item.count}
            </Text>
            {active ? (
              <Animated.View style={[styles.scanOrb, scanAnim]}>
                <FontAwesome name="crosshairs" size={11} color="#818cf8" />
              </Animated.View>
            ) : (
              <View
                style={[
                  styles.iconOrb,
                  { backgroundColor: `${blobColor}18`, borderColor: `${blobColor}30` },
                ]}
              >
                <FontAwesome name={item.icon} size={10} color={blobColor} />
              </View>
            )}
          </View>
          <View style={styles.labelBlock}>
            <Text
              style={[
                styles.label,
                active ? styles.labelActive : styles.labelIdle,
              ]}
              numberOfLines={1}
            >
              {item.title}
            </Text>
            <Text
              style={[
                styles.sub,
                active ? styles.subActive : styles.subIdle,
              ]}
              numberOfLines={2}
            >
              {item.subtitle}
            </Text>
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

function BentoSectionHeader({
  missionLabel,
  sections,
}: {
  missionLabel: string;
  sections: string[];
}) {
  return (
    <View style={styles.headerRow}>
      <View style={styles.missionPulse}>
        <Radar size={13} color="#6366f1" />
        <Text style={styles.missionPulseText}>{missionLabel}</Text>
      </View>
      <View style={styles.sectionLabels}>
        {sections.map((label) => (
          <Text key={label} style={styles.sectionLabel}>
            {label}
          </Text>
        ))}
      </View>
    </View>
  );
}

export type TripsHubBentoMetricsProps = {
  metricOrder: ActiveMetricTabId[];
  activeMetricTab: ActiveMetricTabId;
  onSelectMetric: (id: ActiveMetricTabId) => void;
  getCount: (id: ActiveMetricTabId) => number;
  getTitle: (id: ActiveMetricTabId) => string;
  getSubtitle: (id: ActiveMetricTabId) => string;
  getIcon: (id: ActiveMetricTabId) => React.ComponentProps<typeof FontAwesome>["name"];
  missionPulseLabel: string;
  sectionLabels: string[];
  isDesktop: boolean;
  style?: StyleProp<ViewStyle>;
};

export function TripsHubBentoMetrics({
  metricOrder,
  activeMetricTab,
  onSelectMetric,
  getCount,
  getTitle,
  getSubtitle,
  getIcon,
  missionPulseLabel,
  sectionLabels,
  isDesktop,
  style,
}: TripsHubBentoMetricsProps) {
  const items: BentoMetricItem[] = metricOrder.map((id) => {
    const layout = BENTO_LAYOUT[id];
    return {
      id,
      count: getCount(id),
      title: getTitle(id),
      subtitle: getSubtitle(id),
      size: layout.size,
      variant: layout.variant,
      icon: getIcon(id),
    };
  });

  const renderCard = (item: BentoMetricItem) => (
    <BentoMetricCard
      key={item.id}
      item={item}
      active={activeMetricTab === item.id}
      onPress={() => onSelectMetric(item.id)}
      flexStyle={
        item.size === "large" ? styles.flexLarge : styles.flexSmall
      }
    />
  );

  if (!isDesktop) {
    return (
      <View style={[styles.hub, style]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.mobileScroll}
        >
          {items.map(renderCard)}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.hub, style]}>
      <BentoSectionHeader
        missionLabel={missionPulseLabel}
        sections={sectionLabels}
      />
      <View style={styles.bentoRow}>{items.map(renderCard)}</View>
    </View>
  );
}

export type HistoryTripMetricId =
  | "due_to_get"
  | "no_due_to_get"
  | "due_to_pay"
  | "no_due_to_pay";

export type HistoryBentoMetricItem = {
  id: HistoryTripMetricId;
  count: number;
  amount: number;
  title: string;
  subtitle: string;
  variant: BentoMetricVariant;
  showsAmount: boolean;
};

const HISTORY_VARIANT: Record<
  HistoryTripMetricId,
  { variant: BentoMetricVariant; showsAmount: boolean }
> = {
  due_to_get: { variant: "emerald", showsAmount: true },
  no_due_to_get: { variant: "slate", showsAmount: false },
  due_to_pay: { variant: "orange", showsAmount: true },
  no_due_to_pay: { variant: "slate", showsAmount: false },
};

function HistoryBentoMetricCard({
  item,
  active,
  onPress,
}: {
  item: HistoryBentoMetricItem;
  active: boolean;
  onPress: () => void;
}) {
  const hover = useSharedValue(0);
  const press = useSharedValue(0);
  const blobColor = VARIANT_BLOB[item.variant];
  const isZero = item.count === 0;
  const dueAttention =
    item.showsAmount && item.amount > 0 && !active;

  const cardAnim = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: interpolate(hover.value, [0, 1], [0, active ? -4 : -2]),
      },
      {
        scale:
          (active ? 1.02 : 1) *
          interpolate(hover.value, [0, 1], [1, 1.006]) *
          interpolate(press.value, [0, 1], [1, 0.988]),
      },
    ],
  }));

  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => {
        hover.value = withTiming(1, { duration: 140 });
      }}
      onHoverOut={() => {
        hover.value = withTiming(0, { duration: 160 });
      }}
      onPressIn={() => {
        press.value = withSpring(1, { damping: 18, stiffness: 300 });
      }}
      onPressOut={() => {
        press.value = withSpring(0, { damping: 18, stiffness: 300 });
      }}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${item.title}, ${item.count} trips`}
      style={[styles.cardPressable, styles.flexSmall]}
    >
      <Animated.View
        style={[
          styles.card,
          active ? styles.cardGlow : styles.cardIdle,
          dueAttention && styles.cardDueAttention,
          cardAnim,
        ]}
      >
        {!active ? (
          <View style={[StyleSheet.absoluteFill, styles.cardIdleBg]} />
        ) : (
          <LinearGradient
            colors={["#171A20", "#1e293b"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        )}

        <View
          style={[
            styles.cornerBlob,
            { backgroundColor: blobColor },
            active && styles.cornerBlobActive,
          ]}
          pointerEvents="none"
        />

        <View style={[styles.cardBody, styles.cardBodySmall]}>
          <View style={styles.countRow}>
            <Text
              style={[
                styles.count,
                styles.countSmall,
                active && styles.countActive,
                isZero && !active && styles.countZero,
              ]}
            >
              {item.count}
            </Text>
            {item.showsAmount ? (
              <Text
                style={[
                  styles.historyAmount,
                  active
                    ? styles.historyAmountActive
                    : styles.historyAmountIdle,
                  item.amount > 0 && styles.historyAmountDue,
                ]}
                numberOfLines={1}
              >
                {formatINRChip(item.amount)}
              </Text>
            ) : (
              <View
                style={[
                  styles.iconOrb,
                  {
                    backgroundColor: `${blobColor}18`,
                    borderColor: `${blobColor}30`,
                  },
                ]}
              >
                <FontAwesome
                  name={
                    item.id === "no_due_to_get" || item.id === "no_due_to_pay"
                      ? "check"
                      : "rupee"
                  }
                  size={10}
                  color={blobColor}
                />
              </View>
            )}
          </View>
          <View style={styles.labelBlock}>
            <Text
              style={[
                styles.label,
                active ? styles.labelActive : styles.labelIdle,
              ]}
              numberOfLines={2}
            >
              {item.title}
            </Text>
            <Text
              style={[
                styles.sub,
                active ? styles.subActive : styles.subIdle,
              ]}
              numberOfLines={2}
            >
              {item.subtitle}
            </Text>
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

export type TripsHubHistoryBentoMetricsProps = {
  metricOrder: HistoryTripMetricId[];
  activeMetricTab: HistoryTripMetricId | null;
  onSelectMetric: (id: HistoryTripMetricId | null) => void;
  getMetric: (id: HistoryTripMetricId) => {
    count: number;
    amount: number;
    title: string;
    hint: string;
  };
  missionPulseLabel: string;
  receivableSectionLabel: string;
  payableSectionLabel: string;
  isDesktop: boolean;
  style?: StyleProp<ViewStyle>;
};

export function TripsHubHistoryBentoMetrics({
  metricOrder,
  activeMetricTab,
  onSelectMetric,
  getMetric,
  missionPulseLabel,
  receivableSectionLabel,
  payableSectionLabel,
  isDesktop,
  style,
}: TripsHubHistoryBentoMetricsProps) {
  const items: HistoryBentoMetricItem[] = metricOrder.map((id) => {
    const meta = HISTORY_VARIANT[id];
    const m = getMetric(id);
    return {
      id,
      count: m.count,
      amount: m.amount,
      title: m.title,
      subtitle: m.hint,
      variant: meta.variant,
      showsAmount: meta.showsAmount,
    };
  });

  const renderCard = (item: HistoryBentoMetricItem) => (
    <HistoryBentoMetricCard
      key={item.id}
      item={item}
      active={activeMetricTab === item.id}
      onPress={() =>
        onSelectMetric(activeMetricTab === item.id ? null : item.id)
      }
    />
  );

  if (!isDesktop) {
    return (
      <View style={[styles.hub, style]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.mobileScroll}
        >
          {items.map(renderCard)}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.hub, style]}>
      <BentoSectionHeader
        missionLabel={missionPulseLabel}
        sections={[receivableSectionLabel, payableSectionLabel]}
      />
      <View style={styles.bentoRow}>{items.map(renderCard)}</View>
    </View>
  );
}

/** @deprecated Use TripsHubBentoMetrics — kept for history tab rails if needed. */
export function TripsHubMetricGroupRail({
  children,
  style,
}: {
  children: ReactNode;
  isLargeScreen?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.legacyRail, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  hub: {
    width: "100%" as const,
    marginBottom: 8,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 2,
    marginBottom: 10,
  },
  missionPulse: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  missionPulseText: {
    fontSize: FS_CAPTION,
    fontWeight: "800",
    color: Theme.primary,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  sectionLabels: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    flexWrap: "wrap",
  },
  sectionLabel: {
    fontSize: FS_CAPTION,
    fontWeight: "800",
    color: Theme.textSection,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  bentoRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 8,
    width: "100%" as const,
  },
  mobileScroll: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 2,
    paddingBottom: 4,
  },
  flexLarge: {
    flex: 1.22,
    minWidth: 100,
    maxWidth: "16%" as const,
  },
  flexSmall: {
    flex: 1,
    minWidth: 0,
  },
  cardPressable: {
    minHeight: 92,
    alignSelf: "stretch",
  },
  card: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    overflow: "hidden",
    minHeight: 92,
  },
  cardLarge: {
    minHeight: 96,
  },
  cardIdle: {
    borderColor: "#ffffff",
    ...Platform.select({
      web: {
        boxShadow: "0 20px 50px -10px rgba(0,0,0,0.06)",
      },
      default: {
        shadowColor: "#0f172a",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.06,
        shadowRadius: 16,
        elevation: 3,
      },
    }),
  },
  cardGlow: {
    borderWidth: 1.5,
    borderColor: "#171A20",
    zIndex: 2,
    ...Platform.select({
      web: {
        boxShadow: "0 24px 48px -12px rgba(23,26,32,0.45)",
      },
      default: {
        shadowColor: "#171A20",
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.35,
        shadowRadius: 20,
        elevation: 10,
      },
    }),
  },
  cardIdleBg: {
    backgroundColor: Theme.cardWhite,
  },
  cornerBlob: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 64,
    height: 64,
    borderBottomLeftRadius: 64,
    opacity: 0.06,
  },
  cornerBlobActive: {
    opacity: 0.12,
  },
  cardBody: {
    flex: 1,
    justifyContent: "space-between",
    zIndex: 1,
    minWidth: 0,
  },
  cardBodyLarge: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 11,
  },
  cardBodySmall: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
  },
  countRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 8,
    minHeight: 28,
  },
  count: {
    fontWeight: "800",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    fontVariant: ["tabular-nums"],
    flexShrink: 1,
    minWidth: 0,
  },
  countLarge: {
    fontSize: FS_COUNT_LARGE,
    lineHeight: FS_COUNT_LARGE + 2,
    letterSpacing: -0.8,
  },
  countSmall: {
    fontSize: FS_COUNT_SMALL,
    lineHeight: FS_COUNT_SMALL + 2,
    letterSpacing: -0.6,
  },
  countActive: {
    color: Theme.textOnDark,
  },
  countZero: {
    color: Theme.textMuted,
  },
  scanOrb: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(99,102,241,0.2)",
    borderWidth: 1,
    borderColor: "rgba(99,102,241,0.35)",
    flexShrink: 0,
  },
  iconOrb: {
    width: 26,
    height: 26,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    flexShrink: 0,
  },
  labelBlock: {
    gap: 3,
    minWidth: 0,
    width: "100%" as const,
  },
  label: {
    fontSize: FS_CAPTION,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.55,
    lineHeight: FS_CAPTION + 3,
  },
  labelIdle: {
    color: Theme.textMuted,
  },
  labelActive: {
    color: "#a5b4fc",
  },
  sub: {
    fontSize: FS_AMOUNT_LABEL,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.45,
    lineHeight: FS_AMOUNT_LABEL + 4,
  },
  subIdle: {
    color: Theme.textSection,
  },
  subActive: {
    color: "rgba(255,255,255,0.42)",
  },
  historyAmount: {
    fontSize: FS_CAPTION + 1,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    flexShrink: 1,
    minWidth: 0,
    maxWidth: "48%",
    textAlign: "right" as const,
    letterSpacing: -0.2,
    lineHeight: FS_CAPTION + 4,
  },
  historyAmountIdle: {
    color: Theme.textSecondary,
  },
  historyAmountActive: {
    color: "rgba(255,255,255,0.72)",
  },
  historyAmountDue: {
    color: Theme.teslaRed,
  },
  cardDueAttention: {
    borderColor: Theme.teslaRed,
    borderWidth: 1.5,
    ...Platform.select({
      web: {
        boxShadow: "0 8px 24px -8px rgba(220,38,38,0.25)",
      },
      default: {
        shadowColor: Theme.teslaRed,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 3,
      },
    }),
  },
  legacyRail: {
    flexDirection: "row",
    gap: 8,
    alignItems: "stretch",
  },
  legacyGroupLabel: {
    fontSize: 8,
    fontWeight: "600",
    color: Theme.networkSectionLabel,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 5,
  },
});

export const tripsHubMetricGroupLabelStyle = styles.legacyGroupLabel;
