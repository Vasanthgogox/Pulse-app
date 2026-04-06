/**
 * Single card: summary (Total In / Out) + toolbar (search, report icon, filter).
 * Animated icons, report icon-only, used on Treasury and Entity detail.
 */
import Theme from '@/constants/Theme';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, TouchableWithoutFeedback, View, useWindowDimensions } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type EntityListFilter = 'all' | 'has_due' | 'no_due';

export interface TreasurySummaryCardProps {
  /** When provided, summary row is shown at top of card */
  totalIn?: number;
  totalOut?: number;
  labelIn?: string;
  labelOut?: string;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  searchPlaceholder?: string;
  onReportPress: () => void;
  entityFilter?: EntityListFilter;
  onEntityFilterChange?: (f: EntityListFilter) => void;
  showPeriodFilter?: boolean;
  periodFilter?: 'TODAY' | 'MONTH' | 'RANGE';
  onPeriodFilterChange?: (p: 'TODAY' | 'MONTH' | 'RANGE') => void;
  /** Ledger tab only: source filter (All / Asset / Aggregate) shown next to period filter. */
  sourceFilter?: 'all' | 'asset' | 'aggregate';
  onSourceFilterChange?: (s: 'all' | 'asset' | 'aggregate') => void;
  /** Rendered at top of card (e.g. merged tabs) */
  topContent?: ReactNode;
  /** When true, card has no horizontal margin and fits width */
  fullWidth?: boolean;
  /** When true, report/ledger icon is not shown in toolbar (e.g. moved to header). */
  hideReportInToolbar?: boolean;
  /** Override entity filter labels (e.g. Garage: "Has expense" / "No expense" instead of "Has due" / "No due"). */
  entityFilterLabels?: Partial<Record<EntityListFilter, string>>;
  /** Garage tab: period options (YTD 2026, MAR 2026, etc.) shown in same filter dropdown. */
  garagePeriodOptions?: { value: string; label: string }[];
  garagePeriod?: string;
  onGaragePeriodChange?: (value: string) => void;
  /** Garage tab: view/sort (Vehicle | Trips | Revenue | Profit) in same filter dropdown. */
  garageViewTab?: 'vehicle' | 'trips' | 'revenue' | 'profit';
  onGarageViewTabChange?: (value: 'vehicle' | 'trips' | 'revenue' | 'profit') => void;
  /** Vehicle detail: show margin % in the card (e.g. +90.5%) */
  marginPercent?: number | null;
  /** Ledger tab: filter by cash direction. When set, one of the summary cells is highlighted. */
  cashDirectionFilter?: 'all' | 'in' | 'out';
  /** Ledger tab: called when user taps the cash-in (left) summary cell. Toggle filter to in/all. */
  onCashInPress?: () => void;
  /** Ledger tab: called when user taps the cash-out (right) summary cell. Toggle filter to out/all. */
  onCashOutPress?: () => void;
  /** When entity filter row is shown, optional content to render on the right (e.g. view mode icons). */
  filterRowRight?: ReactNode;
  /**
   * When set (e.g. Finance sub-tab id), changing this restarts the summary amount count-up from 0.
   * Without it, amounts only animate when the numeric total changes (entity detail / other embeds).
   */
  amountAnimationResetKey?: string;
  /** Cash tab: match Network hub — fiscal tabs, then search row, then totals (flex order; same controls). */
  cashNetworkLayout?: boolean;
}

const ENTITY_FILTER_LABELS: Record<EntityListFilter, string> = {
  all: 'All',
  has_due: 'Has due',
  no_due: 'No due',
};

const SOURCE_FILTER_LABELS: Record<'all' | 'asset' | 'aggregate', string> = {
  all: 'All',
  asset: 'Asset',
  aggregate: 'Aggregate',
};

function formatAmount(n: number): string {
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0, minimumFractionDigits: 0 })}`;
}

const springConfig = { damping: 14, stiffness: 180 };

const AMOUNT_ANIMATION_DURATION = 420;

function AnimatedAmount({
  value,
  style,
  animationResetKey,
}: {
  value: number;
  style?: object;
  /** When defined, a change restarts the count from 0 (e.g. switching Finance sub-tabs). */
  animationResetKey?: string;
}) {
  const target = Number.isFinite(value) ? Math.round(value) : 0;
  const [displayValue, setDisplayValue] = useState(0);
  const shared = useSharedValue(0);
  const prevResetKeyRef = useRef<string | undefined>(undefined);

  const syncDisplay = useCallback((n: number) => {
    setDisplayValue(n);
  }, []);

  useEffect(() => {
    cancelAnimation(shared);

    const useResetKey = animationResetKey !== undefined;
    const segmentChanged =
      useResetKey && prevResetKeyRef.current !== animationResetKey;

    if (useResetKey) {
      prevResetKeyRef.current = animationResetKey;
    }

    if (segmentChanged) {
      shared.value = 0;
      setDisplayValue(0);
    }

    shared.value = withTiming(target, {
      duration: AMOUNT_ANIMATION_DURATION,
      easing: Easing.out(Easing.cubic),
    });
  }, [target, animationResetKey, shared]);

  useAnimatedReaction(
    () => Math.round(shared.value),
    (current, previous) => {
      if (current !== previous) {
        runOnJS(syncDisplay)(current);
      }
    },
  );

  return <Text style={[styles.summaryValue, style]}>{formatAmount(displayValue)}</Text>;
}

function AnimatedIcon({
  name,
  size,
  color,
  style,
  pulse,
}: {
  name: React.ComponentProps<typeof FontAwesome>['name'];
  size: number;
  color: string;
  style?: object;
  pulse?: boolean;
}) {
  const scale = useSharedValue(1);
  const pulseScale = useSharedValue(1);

  useEffect(() => {
    if (!pulse) return;
    pulseScale.value = withRepeat(
      withSequence(
        withTiming(1.06, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, [pulse]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value * pulseScale.value }],
  }));

  return (
    <Animated.View style={[animatedStyle, style]}>
      <FontAwesome name={name} size={size} color={color} />
    </Animated.View>
  );
}

function PressableIcon({
  name,
  size,
  color,
  onPress,
  pulse,
  style,
}: {
  name: React.ComponentProps<typeof FontAwesome>['name'];
  size: number;
  color: string;
  onPress: () => void;
  pulse?: boolean;
  style?: object;
}) {
  const scale = useSharedValue(1);
  const pulseScale = useSharedValue(1);

  useEffect(() => {
    if (!pulse) return;
    pulseScale.value = withRepeat(
      withSequence(
        withTiming(1.08, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, [pulse]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value * pulseScale.value }],
  }));

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={1}
      onPressIn={() => {
        scale.value = withSpring(0.88, springConfig);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, springConfig);
      }}
      style={style}
    >
      <Animated.View style={animatedStyle}>
        <FontAwesome name={name} size={size} color={color} />
      </Animated.View>
    </TouchableOpacity>
  );
}

export function TreasurySummaryCard({
  totalIn = 0,
  totalOut = 0,
  labelIn,
  labelOut,
  searchQuery,
  onSearchChange,
  searchPlaceholder = 'Search entities…',
  onReportPress,
  entityFilter = 'all',
  onEntityFilterChange,
  showPeriodFilter,
  periodFilter = 'MONTH',
  onPeriodFilterChange,
  sourceFilter = 'all',
  onSourceFilterChange,
  topContent,
  fullWidth = false,
  hideReportInToolbar = false,
  entityFilterLabels,
  garagePeriodOptions,
  garagePeriod,
  onGaragePeriodChange,
  garageViewTab,
  onGarageViewTabChange,
  marginPercent,
  cashDirectionFilter = 'all',
  onCashInPress,
  onCashOutPress,
  filterRowRight,
  amountAnimationResetKey,
  cashNetworkLayout = false,
}: TreasurySummaryCardProps) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  /** Stack search + filters; horizontal scroll for filters on narrow widths */
  const compactToolbar = windowWidth < 560;
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [showPeriodDropdown, setShowPeriodDropdown] = useState(false);
  const [showSourceDropdown, setShowSourceDropdown] = useState(false);
  const [dropdownAnchorY, setDropdownAnchorY] = useState(0);
  const refPeriodFilter = useRef<View>(null);
  const refSourceFilter = useRef<View>(null);

  const effectiveEntityFilterLabels = { ...ENTITY_FILTER_LABELS, ...entityFilterLabels };
  const showSummary = labelIn != null && labelOut != null;
  /** Cash tab: Network-style toolbar (search above totals, entity chips in toolbar). */
  const cashNetworkToolbar = cashNetworkLayout && showSummary;
  const filterLabel =
    onEntityFilterChange != null
      ? effectiveEntityFilterLabels[entityFilter]
      : showPeriodFilter && onPeriodFilterChange
        ? periodFilter === 'MONTH'
          ? 'This month'
          : periodFilter
        : null;
  const sourceFilterLabel = onSourceFilterChange != null ? SOURCE_FILTER_LABELS[sourceFilter] : null;
  const showFilterDropdownOpen =
    (onEntityFilterChange != null && showFilterDropdown) ||
    (showPeriodFilter && onPeriodFilterChange && showPeriodDropdown) ||
    (onSourceFilterChange != null && showSourceDropdown);

  const filterBtnScale = useSharedValue(1);
  const filterAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: filterBtnScale.value }],
  }));

  const periodAndSourceFilters = (
    <>
      {filterLabel != null && (
        <View ref={refPeriodFilter} style={styles.filterBlock} collapsable={false}>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => {
              refPeriodFilter.current?.measureInWindow((_x, y, _w, h) => {
                setDropdownAnchorY(y + h + 6);
                if (onEntityFilterChange) {
                  setShowPeriodDropdown(false);
                  setShowSourceDropdown(false);
                  setShowFilterDropdown((v) => !v);
                } else if (onPeriodFilterChange) {
                  setShowFilterDropdown(false);
                  setShowSourceDropdown(false);
                  setShowPeriodDropdown((v) => !v);
                }
              });
            }}
            onPressIn={() => {
              filterBtnScale.value = withSpring(0.92, springConfig);
            }}
            onPressOut={() => {
              filterBtnScale.value = withSpring(1, springConfig);
            }}
            style={styles.filterTrigger}
          >
            <Animated.View style={[styles.filterTriggerInner, filterAnimatedStyle]}>
              <FontAwesome name="filter" size={11} color={Theme.textOnDark} />
              <Text style={styles.filterTriggerText} numberOfLines={1}>
                {filterLabel}
              </Text>
              <FontAwesome name="chevron-down" size={11} color={Theme.textOnDark} />
            </Animated.View>
          </TouchableOpacity>
          {showFilterDropdownOpen && (
            <Modal
              visible
              transparent
              animationType="fade"
              onRequestClose={() => {
                setShowFilterDropdown(false);
                setShowPeriodDropdown(false);
                setShowSourceDropdown(false);
              }}
            >
              <View style={styles.filterModalOverlay}>
                <TouchableWithoutFeedback
                  onPress={() => {
                    setShowFilterDropdown(false);
                    setShowPeriodDropdown(false);
                    setShowSourceDropdown(false);
                  }}
                >
                  <View style={StyleSheet.absoluteFill} />
                </TouchableWithoutFeedback>
                <View style={[styles.filterModalCardWrap, { top: dropdownAnchorY > 0 ? dropdownAnchorY : insets.top + 100 }]}>
                  <View style={styles.filterModalCard}>
                    <View style={styles.filterModalHandle} />
                    {onEntityFilterChange && showFilterDropdown && (
                      <>
                        <View style={styles.filterModalSectionRow}>
                          <FontAwesome name="sitemap" size={11} color={Theme.teslaRed} style={styles.filterModalSectionIcon} />
                          <Text style={styles.filterModalSectionLabel}>Entity</Text>
                        </View>
                        {(['all', 'has_due', 'no_due'] as const).map((f) => (
                          <TouchableOpacity
                            key={f}
                            style={[styles.dropdownItem, entityFilter === f && styles.dropdownItemActive]}
                            onPress={() => {
                              onEntityFilterChange(f);
                              setShowFilterDropdown(false);
                            }}
                            activeOpacity={0.75}
                          >
                            {entityFilter === f && <View style={styles.dropdownItemAccent} />}
                            <View style={[styles.dropdownItemIconWrap, entityFilter === f && styles.dropdownItemIconWrapActive]}>
                              <FontAwesome
                                name={f === 'all' ? 'list' : f === 'has_due' ? 'exclamation-circle' : 'check-circle'}
                                size={14}
                                color={entityFilter === f ? Theme.teslaRed : Theme.textMutedDemo}
                              />
                            </View>
                            <Text style={[styles.dropdownItemText, entityFilter === f && styles.dropdownItemTextActive]}>
                              {effectiveEntityFilterLabels[f]}
                            </Text>
                            {entityFilter === f && (
                              <FontAwesome name="check" size={12} color={Theme.teslaRed} style={styles.dropdownItemCheck} />
                            )}
                          </TouchableOpacity>
                        ))}
                        <View style={styles.filterModalDivider} />
                      </>
                    )}
                    {showFilterDropdown && garagePeriodOptions != null && garagePeriodOptions.length > 0 && onGaragePeriodChange != null && (
                      <>
                        <View style={styles.filterModalSectionRow}>
                          <FontAwesome name="calendar" size={11} color={Theme.teslaRed} style={styles.filterModalSectionIcon} />
                          <Text style={styles.filterModalSectionLabel}>Period</Text>
                        </View>
                        {garagePeriodOptions.map((opt) => (
                          <TouchableOpacity
                            key={opt.value}
                            style={[styles.dropdownItem, garagePeriod === opt.value && styles.dropdownItemActive]}
                            onPress={() => {
                              onGaragePeriodChange(opt.value);
                              setShowFilterDropdown(false);
                            }}
                            activeOpacity={0.75}
                          >
                            {garagePeriod === opt.value && <View style={styles.dropdownItemAccent} />}
                            <View style={[styles.dropdownItemIconWrap, garagePeriod === opt.value && styles.dropdownItemIconWrapActive]}>
                              <FontAwesome
                                name="calendar"
                                size={14}
                                color={garagePeriod === opt.value ? Theme.teslaRed : Theme.textMutedDemo}
                              />
                            </View>
                            <Text style={[styles.dropdownItemText, garagePeriod === opt.value && styles.dropdownItemTextActive]}>
                              {opt.label}
                            </Text>
                            {garagePeriod === opt.value && (
                              <FontAwesome name="check" size={12} color={Theme.teslaRed} style={styles.dropdownItemCheck} />
                            )}
                          </TouchableOpacity>
                        ))}
                        <View style={styles.filterModalDivider} />
                      </>
                    )}
                    {showFilterDropdown && onGarageViewTabChange != null && garageViewTab != null && (
                      <>
                        <View style={styles.filterModalSectionRow}>
                          <FontAwesome name="sort" size={11} color={Theme.teslaRed} style={styles.filterModalSectionIcon} />
                          <Text style={styles.filterModalSectionLabel}>View / Sort</Text>
                        </View>
                        {(['vehicle', 'trips', 'revenue', 'profit'] as const).map((v) => (
                          <TouchableOpacity
                            key={v}
                            style={[styles.dropdownItem, garageViewTab === v && styles.dropdownItemActive]}
                            onPress={() => {
                              onGarageViewTabChange(v);
                              setShowFilterDropdown(false);
                            }}
                            activeOpacity={0.75}
                          >
                            {garageViewTab === v && <View style={styles.dropdownItemAccent} />}
                            <View style={[styles.dropdownItemIconWrap, garageViewTab === v && styles.dropdownItemIconWrapActive]}>
                              <FontAwesome
                                name={v === 'vehicle' ? 'truck' : v === 'trips' ? 'road' : v === 'revenue' ? 'money' : 'bar-chart'}
                                size={14}
                                color={garageViewTab === v ? Theme.teslaRed : Theme.textMutedDemo}
                              />
                            </View>
                            <Text style={[styles.dropdownItemText, garageViewTab === v && styles.dropdownItemTextActive]}>
                              {v.charAt(0).toUpperCase() + v.slice(1)}
                            </Text>
                            {garageViewTab === v && (
                              <FontAwesome name="check" size={12} color={Theme.teslaRed} style={styles.dropdownItemCheck} />
                            )}
                          </TouchableOpacity>
                        ))}
                        <View style={styles.filterModalDivider} />
                      </>
                    )}
                    {showPeriodFilter && onPeriodFilterChange && showPeriodDropdown && (
                      <>
                        <View style={styles.filterModalSectionRow}>
                          <FontAwesome name="calendar" size={11} color={Theme.teslaRed} style={styles.filterModalSectionIcon} />
                          <Text style={styles.filterModalSectionLabel}>Date range</Text>
                        </View>
                        {(['TODAY', 'MONTH', 'RANGE'] as const).map((p) => (
                          <TouchableOpacity
                            key={p}
                            style={[styles.dropdownItem, periodFilter === p && styles.dropdownItemActive]}
                            onPress={() => {
                              onPeriodFilterChange(p);
                              setShowPeriodDropdown(false);
                            }}
                            activeOpacity={0.75}
                          >
                            {periodFilter === p && <View style={styles.dropdownItemAccent} />}
                            <View style={[styles.dropdownItemIconWrap, periodFilter === p && styles.dropdownItemIconWrapActive]}>
                              <FontAwesome
                                name={p === 'TODAY' ? 'calendar' : p === 'MONTH' ? 'calendar-check-o' : 'calendar-plus-o'}
                                size={14}
                                color={periodFilter === p ? Theme.teslaRed : Theme.textMutedDemo}
                              />
                            </View>
                            <Text style={[styles.dropdownItemText, periodFilter === p && styles.dropdownItemTextActive]}>
                              {p === 'MONTH' ? 'This month' : p.charAt(0) + p.slice(1).toLowerCase()}
                            </Text>
                            {periodFilter === p && (
                              <FontAwesome name="check" size={12} color={Theme.teslaRed} style={styles.dropdownItemCheck} />
                            )}
                          </TouchableOpacity>
                        ))}
                      </>
                    )}
                    {onSourceFilterChange && showSourceDropdown && (
                      <>
                        <View style={styles.filterModalSectionRow}>
                          <FontAwesome name="database" size={11} color={Theme.teslaRed} style={styles.filterModalSectionIcon} />
                          <Text style={styles.filterModalSectionLabel}>Source</Text>
                        </View>
                        {(['all', 'asset', 'aggregate'] as const).map((s) => (
                          <TouchableOpacity
                            key={s}
                            style={[styles.dropdownItem, sourceFilter === s && styles.dropdownItemActive]}
                            onPress={() => {
                              onSourceFilterChange(s);
                              setShowSourceDropdown(false);
                            }}
                            activeOpacity={0.75}
                          >
                            {sourceFilter === s && <View style={styles.dropdownItemAccent} />}
                            <View style={[styles.dropdownItemIconWrap, sourceFilter === s && styles.dropdownItemIconWrapActive]}>
                              <FontAwesome
                                name={s === 'all' ? 'list' : s === 'asset' ? 'truck' : 'sitemap'}
                                size={14}
                                color={sourceFilter === s ? Theme.teslaRed : Theme.textMutedDemo}
                              />
                            </View>
                            <Text style={[styles.dropdownItemText, sourceFilter === s && styles.dropdownItemTextActive]}>
                              {SOURCE_FILTER_LABELS[s]}
                            </Text>
                            {sourceFilter === s && (
                              <FontAwesome name="check" size={12} color={Theme.teslaRed} style={styles.dropdownItemCheck} />
                            )}
                          </TouchableOpacity>
                        ))}
                      </>
                    )}
                  </View>
                </View>
              </View>
            </Modal>
          )}
        </View>
      )}
      {sourceFilterLabel != null && (
        <View ref={refSourceFilter} style={styles.filterBlock} collapsable={false}>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => {
              refSourceFilter.current?.measureInWindow((_x, y, _w, h) => {
                setDropdownAnchorY(y + h + 6);
                setShowFilterDropdown(false);
                setShowPeriodDropdown(false);
                setShowSourceDropdown((v) => !v);
              });
            }}
            onPressIn={() => {
              filterBtnScale.value = withSpring(0.92, springConfig);
            }}
            onPressOut={() => {
              filterBtnScale.value = withSpring(1, springConfig);
            }}
            style={styles.filterTrigger}
          >
            <Animated.View style={[styles.filterTriggerInner, filterAnimatedStyle]}>
              <FontAwesome name="database" size={11} color={Theme.textOnDark} />
              <Text style={styles.filterTriggerText} numberOfLines={1}>
                {sourceFilterLabel}
              </Text>
              <FontAwesome name="chevron-down" size={11} color={Theme.textOnDark} />
            </Animated.View>
          </TouchableOpacity>
        </View>
      )}
    </>
  );

  const toolbarOnly = fullWidth && !showSummary;
  return (
    <View style={[
      styles.card,
      fullWidth && styles.cardFullWidth,
      toolbarOnly && styles.cardFullWidthToolbarOnly,
    ]}>
      {topContent != null && (
        <View style={[styles.topContent, cashNetworkLayout && styles.topContentNetwork]}>
          {topContent}
        </View>
      )}
      {!cashNetworkLayout && showSummary && onEntityFilterChange != null &&
        (filterRowRight != null ? (
          <View style={styles.filterRowWrap}>
            <View style={[styles.statusPillRow, styles.statusPillRowInWrap]}>
              {(['all', 'has_due', 'no_due'] as const).map((f) => (
                <TouchableOpacity
                  key={f}
                  style={[styles.statusPill, entityFilter === f && styles.statusPillActive]}
                  onPress={() => onEntityFilterChange(f)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.statusPillText, entityFilter === f && styles.statusPillTextActive]}>
                    {effectiveEntityFilterLabels[f]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.filterRowRight}>{filterRowRight}</View>
          </View>
        ) : (
          <View style={styles.statusPillRow}>
            {(['all', 'has_due', 'no_due'] as const).map((f) => (
              <TouchableOpacity
                key={f}
                style={[styles.statusPill, entityFilter === f && styles.statusPillActive]}
                onPress={() => onEntityFilterChange(f)}
                activeOpacity={0.8}
              >
                <Text style={[styles.statusPillText, entityFilter === f && styles.statusPillTextActive]}>
                  {effectiveEntityFilterLabels[f]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ))}
      <View
        style={[
          styles.summaryToolbarStack,
          cashNetworkLayout && showSummary && styles.cashNetworkOrderedWrap,
        ]}
      >
      {showSummary && (
        <>
          <View
            style={[
              styles.summaryRow,
              cashNetworkLayout && showSummary && styles.summaryRowNetwork,
              cashNetworkLayout && showSummary && styles.summaryOrderAfterToolbar,
            ]}
          >
            {onCashInPress != null ? (
              <Pressable
                style={[
                  styles.summaryCell,
                  marginPercent != null && !Number.isNaN(marginPercent) && styles.summaryCellThird,
                  cashDirectionFilter === 'in' && styles.summaryCellActive,
                ]}
                onPress={onCashInPress}
                android_ripple={undefined}
              >
                <View style={styles.labelRow}>
                  <AnimatedIcon
                    name="arrow-circle-up"
                    size={14}
                    color={Theme.darkGreen}
                    pulse
                  />
                  <Text style={styles.summaryLabel}>{labelIn}</Text>
                </View>
                <AnimatedAmount value={totalIn} animationResetKey={amountAnimationResetKey} />
              </Pressable>
            ) : (
              <View style={[styles.summaryCell, marginPercent != null && !Number.isNaN(marginPercent) && styles.summaryCellThird]}>
                <View style={styles.labelRow}>
                  <AnimatedIcon
                    name="arrow-circle-up"
                    size={14}
                    color={Theme.darkGreen}
                    pulse
                  />
                  <Text style={styles.summaryLabel}>{labelIn}</Text>
                </View>
                <AnimatedAmount value={totalIn} animationResetKey={amountAnimationResetKey} />
              </View>
            )}
            {marginPercent != null && !Number.isNaN(marginPercent) && (
              <View style={[styles.summaryCell, styles.summaryCellCenter]}>
                <Text style={styles.summaryLabel}>Margin</Text>
                <Text
                  style={[
                    styles.summaryValue,
                    styles.marginValue,
                    marginPercent > 0 && styles.marginValuePositive,
                    marginPercent < 0 && styles.marginValueNegative,
                  ]}
                >
                  {marginPercent > 0 ? '+' : ''}{marginPercent.toFixed(1)}%
                </Text>
              </View>
            )}
            {onCashOutPress != null ? (
              <Pressable
                style={[
                  styles.summaryCell,
                  styles.summaryCellRight,
                  marginPercent != null && !Number.isNaN(marginPercent) && styles.summaryCellThird,
                  cashDirectionFilter === 'out' && styles.summaryCellActive,
                ]}
                onPress={onCashOutPress}
                android_ripple={undefined}
              >
                <View style={styles.labelRowRight}>
                  <Text style={styles.summaryLabel}>{labelOut}</Text>
                  <AnimatedIcon
                    name="arrow-circle-down"
                    size={14}
                    color={Theme.teslaRed}
                    pulse
                  />
                </View>
                <AnimatedAmount value={totalOut} animationResetKey={amountAnimationResetKey} />
              </Pressable>
            ) : (
              <View style={[
                styles.summaryCell,
                styles.summaryCellRight,
                marginPercent != null && !Number.isNaN(marginPercent) && styles.summaryCellThird,
              ]}>
                <View style={styles.labelRowRight}>
                  <Text style={styles.summaryLabel}>{labelOut}</Text>
                  <AnimatedIcon
                    name="arrow-circle-down"
                    size={14}
                    color={Theme.teslaRed}
                    pulse
                  />
                </View>
                <AnimatedAmount value={totalOut} animationResetKey={amountAnimationResetKey} />
              </View>
            )}
          </View>
          <View
            style={[
              styles.divider,
              fullWidth && styles.dividerInFullWidth,
              cashNetworkLayout && showSummary && styles.dividerCashNetwork,
              cashNetworkLayout && showSummary && styles.dividerOrderBetween,
            ]}
          />
        </>
      )}

      {cashNetworkToolbar ? (
        <View
          style={[
            styles.toolbarRow,
            styles.toolbarRowNetwork,
            styles.toolbarOrderFirst,
          ]}
        >
          <View style={[styles.toolbarLeft, styles.toolbarLeftNetwork]}>
            <View style={[styles.searchWrap, styles.searchWrapNetwork]}>
              <AnimatedIcon
                name="search"
                size={14}
                color={Theme.textOnDarkMuted}
                style={styles.searchIcon}
              />
              <TextInput
                style={[styles.searchInput, styles.searchInputNetwork]}
                value={searchQuery}
                onChangeText={onSearchChange}
                placeholder={searchPlaceholder}
                placeholderTextColor={Theme.textOnDarkMuted}
                returnKeyType="search"
                autoCorrect={false}
                spellCheck={false}
                autoComplete="off"
              />
            </View>

            {onEntityFilterChange != null && (
              <View style={styles.networkEntityChipsWrap}>
                <View style={[styles.statusPillRow, styles.statusPillRowInWrap, styles.statusPillRowNetwork]}>
                  {(['all', 'has_due', 'no_due'] as const).map((f) => (
                    <TouchableOpacity
                      key={f}
                      style={[styles.statusPill, styles.statusPillNetwork, entityFilter === f && styles.statusPillActive]}
                      onPress={() => onEntityFilterChange(f)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.statusPillText, styles.statusPillTextNetwork, entityFilter === f && styles.statusPillTextActive]}>
                        {effectiveEntityFilterLabels[f]}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {filterRowRight != null && (
                  <View style={styles.filterRowRight}>{filterRowRight}</View>
                )}
              </View>
            )}

            {periodAndSourceFilters}
          </View>

          {!hideReportInToolbar && (
            <PressableIcon
              name="file-text-o"
              size={11}
              color={Theme.textOnDark}
              onPress={onReportPress}
              pulse
              style={styles.reportIconBtn}
            />
          )}
        </View>
      ) : (
        <View style={[styles.toolbarRow, compactToolbar && styles.toolbarRowStacked]}>
          <View style={[styles.searchWrap, compactToolbar && styles.searchWrapStacked]}>
            <AnimatedIcon name="search" size={11} color={Theme.textMutedDemo} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={onSearchChange}
              placeholder={searchPlaceholder}
              placeholderTextColor={Theme.textMutedDemo}
              returnKeyType="search"
              autoCorrect={false}
              spellCheck={false}
              autoComplete="off"
            />
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={[styles.toolbarFiltersScroll, compactToolbar && styles.toolbarFiltersScrollStacked]}
            contentContainerStyle={styles.toolbarFiltersContent}
          >
            {periodAndSourceFilters}
            {!hideReportInToolbar && (
              <PressableIcon
                name="file-text-o"
                size={11}
                color={Theme.textOnDark}
                onPress={onReportPress}
                pulse
                style={styles.reportIconBtn}
              />
            )}
          </ScrollView>
        </View>
      )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 8,
    marginBottom: 8,
    backgroundColor: Theme.darkBackground,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.separatorDark,
    overflow: 'visible',
    padding: 12,
    shadowColor: Theme.shadow,
    boxShadow: "0px 2px 6px 0px rgba(0, 0, 0, 0.15)",
    elevation: 4,
  },
  cardFullWidth: {
    marginHorizontal: 0,
    marginBottom: 0,
    borderRadius: 0,
    borderWidth: 0,
    borderColor: 'transparent',
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  cardFullWidthToolbarOnly: {
    paddingTop: 0,
  },
  topContent: {
    marginBottom: 10,
    marginHorizontal: -12,
  },
  /** Network hub: spacing under horizontal segment tabs (fiscal tabs). */
  topContentNetwork: {
    marginBottom: 8,
    paddingTop: 8,
  },
  /** Wraps summary + divider + toolbar so Cash can reorder like Network (search before totals). */
  summaryToolbarStack: {
    flexDirection: 'column',
  },
  cashNetworkOrderedWrap: {},
  summaryOrderAfterToolbar: {
    order: 1,
  },
  dividerOrderBetween: {
    order: 2,
  },
  toolbarOrderFirst: {
    order: 3,
  },
  /** Network searchRowDark-style toolbar row */
  toolbarRowNetwork: {
    paddingTop: 10,
    gap: 8,
  },
  toolbarLeft: {
    flex: 1,
    minWidth: 0,
  },
  toolbarLeftNetwork: {
    gap: 8,
  },
  /** Network: entity status tags next to search (like type chips). */
  networkEntityChipsWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    backgroundColor: Theme.darkSurface,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 6,
    paddingVertical: 4,
    gap: 6,
  },
  statusPillRowNetwork: {
    marginBottom: 0,
    gap: 3,
  },
  statusPillNetwork: {
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusPillTextNetwork: {
    fontSize: 8,
    fontWeight: '500',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  /** Network searchWrapDark */
  searchWrapNetwork: {
    minHeight: 38,
    borderRadius: 11,
    backgroundColor: Theme.darkSurface,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 12,
    paddingVertical: 0,
  },
  searchInputNetwork: {
    fontSize: 11,
    lineHeight: 14,
    color: Theme.textOnDark,
  },
  /** Totals band sits below search (Network: content below black block). */
  summaryRowNetwork: {
    marginTop: 0,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Theme.separatorDark,
  },
  dividerCashNetwork: {},
  filterRowWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
    marginHorizontal: 0,
  },
  filterRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusPillRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 10,
    marginHorizontal: 0,
  },
  statusPillRowInWrap: {
    marginBottom: 0,
  },
  statusPill: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  statusPillActive: {
    backgroundColor: Theme.teslaRed,
    borderColor: Theme.teslaRed,
  },
  statusPillText: {
    fontSize: 9,
    fontWeight: '600',
    color: Theme.textOnDarkMuted,
  },
  statusPillTextActive: {
    color: '#fff',
  },
  summaryRow: {
    flexDirection: 'row',
  },
  summaryCell: {
    flex: 1,
    paddingVertical: 2,
    paddingRight: 12,
  },
  summaryCellRight: {
    alignItems: 'flex-end',
    paddingRight: 0,
    paddingLeft: 12,
  },
  summaryCellThird: {
    flex: 1,
    maxWidth: undefined,
  },
  summaryCellCenter: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 12,
    paddingRight: 0,
  },
  summaryCellActive: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 4,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  labelRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  summaryLabel: {
    fontSize: 7,
    fontWeight: '800',
    color: Theme.textOnDark,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  summaryValue: {
    fontSize: 15,
    fontWeight: '800',
    color: Theme.textOnDark,
    letterSpacing: -0.3,
  },
  marginValue: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.2,
    marginTop: 4,
  },
  marginValuePositive: {
    color: Theme.darkGreen,
  },
  marginValueNegative: {
    color: Theme.teslaRed,
  },
  divider: {
    height: 1,
    backgroundColor: Theme.separatorDark,
    marginVertical: 4,
  },
  dividerInFullWidth: {
    height: 0,
    marginVertical: 0,
    backgroundColor: 'transparent',
  },
  toolbarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 36,
  },
  /** Narrow screens: search full width, filters in horizontal row below */
  toolbarRowStacked: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 10,
  },
  toolbarFiltersScroll: {
    flexGrow: 0,
    flexShrink: 0,
    minWidth: 0,
    maxWidth: '100%',
  },
  toolbarFiltersScrollStacked: {
    width: '100%',
    maxWidth: '100%',
  },
  toolbarFiltersContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 2,
    paddingRight: 4,
  },
  searchWrap: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    paddingLeft: 10,
    paddingRight: 10,
    paddingVertical: 6,
  },
  searchWrapStacked: {
    flex: 0,
    width: '100%',
    alignSelf: 'stretch',
  },
  searchIcon: {
    marginRight: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 11,
    fontWeight: '600',
    color: Theme.textOnDark,
    paddingVertical: 0,
    minWidth: 0,
  },
  reportIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: Theme.separatorDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBlock: {
    position: 'relative',
    minWidth: 72,
    zIndex: 1000,
    elevation: 1000,
  },
  filterTrigger: {
    borderRadius: 8,
    overflow: 'hidden',
  },
  filterTriggerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: Theme.darkBackground,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    gap: 5,
    shadowColor: '#000',
    boxShadow: "0px 1px 2px 0px rgba(0, 0, 0, 0.12)",
    elevation: 2,
  },
  filterTriggerText: {
    fontSize: 9,
    fontWeight: '800',
    color: Theme.textOnDark,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  filterModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  filterModalCardWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  filterModalCard: {
    width: '100%',
    maxWidth: 280,
    backgroundColor: Theme.darkBackground,
    borderTopWidth: 2,
    borderTopColor: Theme.teslaRed,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    shadowColor: '#000',
    boxShadow: "0px 3px 8px 0px rgba(0, 0, 0, 0.22)",
    elevation: 12,
    overflow: 'hidden',
  },
  filterModalHandle: {
    width: 32,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignSelf: 'center',
    marginBottom: 8,
  },
  filterModalSectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    marginTop: 0,
  },
  filterModalSectionIcon: {
    marginRight: 6,
  },
  filterModalSectionLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: Theme.textMutedDemo,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  filterModalDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginVertical: 10,
    marginLeft: -20,
    marginRight: -20,
  },
  dropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    marginTop: 6,
    minWidth: 132,
    backgroundColor: Theme.darkBackground,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: 10,
    padding: 8,
    zIndex: 10000,
    elevation: 10000,
    shadowColor: '#000',
    boxShadow: "0px 4px 12px 0px rgba(0, 0, 0, 0.3)",
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 0,
    position: 'relative' as const,
  },
  dropdownItemActive: {
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  dropdownItemAccent: {
    position: 'absolute',
    left: 0,
    top: 10,
    bottom: 10,
    width: 3,
    borderRadius: 2,
    backgroundColor: Theme.teslaRed,
  },
  dropdownItemIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  dropdownItemIconWrapActive: {
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  dropdownItemText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: Theme.textOnDark,
    textTransform: 'capitalize',
    letterSpacing: 0.2,
  },
  dropdownItemTextActive: {
    color: Theme.textOnDark,
    fontWeight: '700',
  },
  dropdownItemCheck: {
    marginLeft: 6,
  },
});
