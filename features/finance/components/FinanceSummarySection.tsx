import { DatePresetPillBar } from "@/components/DatePresetPillBar";
import Theme from "@/constants/Theme";
import { useLanguage } from "@/contexts/LanguageContext";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect } from "react";
import { Platform, Pressable, Text, TouchableOpacity, View } from "react-native";
import Animated, {
    Easing,
    interpolate,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withSpring,
    withTiming,
} from "react-native-reanimated";
import type {
    FinancePeriodFilter,
    FinanceSubTab,
    LedgerCategory,
} from "../types";
import { FinanceTabRow } from "./FinanceTabRow";
import { styles } from "./FinanceScreen.styles";
import type { EntityListFilter } from "./TreasurySummaryCard";
import { TreasurySummaryCard } from "./TreasurySummaryCard";

export type LedgerViewMode = "table" | "transaction";

export interface FinanceSummarySectionProps {
  activeTab: FinanceSubTab;
  onTabPress: (tabId: FinanceSubTab) => void;
  screenWidth: number;
  totalIn: number;
  totalOut: number;
  labelIn: string;
  labelOut: string;
  cashDirectionFilter?: "all" | "in" | "out";
  onCashInPress?: () => void;
  onCashOutPress?: () => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  searchPlaceholder?: string;
  onReportPress: () => void;
  entityFilter?: EntityListFilter;
  onEntityFilterChange?: (f: EntityListFilter) => void;
  entityFilterLabels?: Partial<Record<EntityListFilter, string>>;
  garagePeriodOptions?: { value: string; label: string }[];
  garagePeriod?: string;
  onGaragePeriodChange?: (v: string) => void;
  garageViewTab?: "vehicle" | "trips" | "revenue" | "profit";
  onGarageViewTabChange?: (
    v: "vehicle" | "trips" | "revenue" | "profit",
  ) => void;
  showPeriodFilter?: boolean;
  periodFilter?: FinancePeriodFilter;
  onPeriodFilterChange?: (p: FinancePeriodFilter) => void;
  /** Date preset row under fiscal tabs (all Finance sub-tabs). */
  datePreset?: {
    period: FinancePeriodFilter;
    onPeriodChange: (p: FinancePeriodFilter) => void;
    onCustomRangePress: () => void;
    customFrom: string | null;
    customTo: string | null;
  } | null;
  sourceFilter?: "all" | "asset" | "aggregate";
  onSourceFilterChange?: (s: "all" | "asset" | "aggregate") => void;
  /** Ledger tab: Table | Transaction view. Shown in header when on Ledger. */
  ledgerViewMode?: LedgerViewMode;
  onLedgerViewModeChange?: (m: LedgerViewMode) => void;
  /** Customers tab only: view mode (matrix / table / ledger) — shown in summary. */
  customerViewMode?: "matrix" | "table" | "ledger";
  onCustomerViewModeChange?: (m: "matrix" | "table" | "ledger") => void;
  /** When set, shows plus button in header (e.g. Add transaction on cash tab, Add node on entity tabs). */
  onAddClick?: () => void;
  /** Cash tab: party category filter (All / Customers / Suppliers / Vehicle / Driver). */
  ledgerCategory?: LedgerCategory;
  onLedgerCategoryChange?: (c: LedgerCategory) => void;
  onClearFilters?: () => void;
  isAnyFilterActive?: boolean;
  auditedTotalIn?: number;
  auditedTotalOut?: number;
  onQuickCustomRange?: (fromIso: string, toIso: string) => void;
}

function formatAmount(value: number): string {
  return `₹${value.toLocaleString("en-IN", {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  })}`;
}

function AnimatedFinanceCategoryCard({
  label,
  value,
  icon,
  gradient,
  onPress,
  style,
  desktop,
}: {
  label: string;
  value: string;
  icon: string;
  gradient: readonly [string, string];
  onPress: () => void;
  style?: any;
  desktop?: boolean;
}) {
  const hover = useSharedValue(0);
  const press = useSharedValue(0);
  const decorFloat = useSharedValue(0);

  useEffect(() => {
    decorFloat.value = withRepeat(
      withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
  }, [decorFloat]);

  const cardAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(hover.value, [0, 1], [0, -2]) },
      {
        scale:
          interpolate(hover.value, [0, 1], [1, 1.018]) *
          interpolate(press.value, [0, 1], [1, 0.985]),
      },
    ],
  }));
  const decorAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(decorFloat.value, [0, 1], [0, -4]) },
      { scale: interpolate(hover.value, [0, 1], [1, 1.06]) },
    ],
    opacity: interpolate(hover.value, [0, 1], [0.17, 0.24]),
  }));
  const iconBadgeAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(hover.value, [0, 1], [1, 1.08]) }],
  }));
  const ctaArrowAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(hover.value, [0, 1], [0, 3]) }],
  }));

  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => {
        hover.value = withTiming(1, { duration: 150 });
      }}
      onHoverOut={() => {
        hover.value = withTiming(0, { duration: 160 });
      }}
      onPressIn={() => {
        press.value = withSpring(1, { damping: 16, stiffness: 250 });
      }}
      onPressOut={() => {
        press.value = withSpring(0, { damping: 16, stiffness: 250 });
      }}
      style={style}
    >
      <Animated.View style={[styles.financeCategoryAnimatedWrap, cardAnimatedStyle]}>
        <LinearGradient
          colors={gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            styles.financeCategoryCardGradient,
            desktop && styles.financeCategoryCardGradientDesktop,
          ]}
        >
          <Animated.View
            style={[
              styles.financeCategoryDecorIcon,
              desktop && styles.financeCategoryDecorIconDesktop,
              decorAnimatedStyle,
            ]}
          >
            <FontAwesome
              name={icon as any}
              size={desktop ? 68 : 56}
              color={Theme.textOnDark}
            />
          </Animated.View>
          <View style={styles.financeCategoryTop}>
            <Animated.View
              style={[
                styles.financeCategoryIconBadge,
                desktop && styles.financeCategoryIconBadgeDesktop,
                iconBadgeAnimatedStyle,
              ]}
            >
              <FontAwesome
                name={icon as any}
                size={desktop ? 12 : 11}
                color={Theme.textOnDark}
              />
            </Animated.View>
            <Text
              style={[
                styles.financeCategoryTitle,
                desktop && styles.financeCategoryTitleDesktop,
              ]}
            >
              {label}
            </Text>
          </View>
          <Text
            style={[
              styles.financeCategoryValue,
              desktop && styles.financeCategoryValueDesktop,
            ]}
          >
            {value}
          </Text>
          <View style={styles.financeCategoryCtaRow}>
            <Text
              style={[
                styles.financeCategoryCtaText,
                desktop && styles.financeCategoryCtaTextDesktop,
              ]}
            >
              Grid Profile
            </Text>
            <Animated.View style={ctaArrowAnimatedStyle}>
              <FontAwesome
                name="arrow-right"
                size={desktop ? 12 : 11}
                color={Theme.textOnDark}
              />
            </Animated.View>
          </View>
        </LinearGradient>
      </Animated.View>
    </Pressable>
  );
}

export function FinanceSummarySection({
  activeTab,
  onTabPress,
  screenWidth,
  totalIn,
  totalOut,
  labelIn,
  labelOut,
  cashDirectionFilter,
  onCashInPress,
  onCashOutPress,
  searchQuery,
  onSearchChange,
  searchPlaceholder,
  onReportPress,
  entityFilter,
  onEntityFilterChange,
  entityFilterLabels,
  garagePeriodOptions,
  garagePeriod,
  onGaragePeriodChange,
  garageViewTab,
  onGarageViewTabChange,
  showPeriodFilter,
  periodFilter,
  onPeriodFilterChange,
  sourceFilter,
  onSourceFilterChange,
  ledgerCategory,
  onLedgerCategoryChange,
  onClearFilters,
  isAnyFilterActive,
  datePreset,
  auditedTotalIn,
  auditedTotalOut,
  onQuickCustomRange,
}: FinanceSummarySectionProps) {
  const { t } = useLanguage();
  const auditedIn = auditedTotalIn ?? totalIn;
  const auditedOut = auditedTotalOut ?? totalOut;
  const auditedNet = auditedIn - auditedOut;
  // Enable parity cards only on true desktop widths; keep mobile/tablet unchanged.
  const desktopParity = Platform.OS === "web" && screenWidth >= 1024;
  const desktopFourCardParity = Platform.OS === "web" && screenWidth >= 1024;
  const rangePills = [
    { id: "RANGE" as FinancePeriodFilter, label: "All" },
    { id: "TODAY" as FinancePeriodFilter, label: "Today" },
    { id: "WEEK" as FinancePeriodFilter, label: "Last 7 Days" },
    { id: "MONTH" as FinancePeriodFilter, label: "This Month" },
  ];

  if (!desktopParity) {
    return (
      <>
        <View style={[styles.darkBlock, { paddingTop: 0 }]}>
          <View style={styles.darkBlockContent}>
            <TreasurySummaryCard
              fullWidth
              topContent={
                <FinanceTabRow
                  activeTab={activeTab}
                  onTabPress={onTabPress}
                  screenWidth={screenWidth}
                />
              }
              totalIn={totalIn}
              totalOut={totalOut}
              labelIn={labelIn}
              labelOut={labelOut}
              cashDirectionFilter={cashDirectionFilter}
              onCashInPress={onCashInPress}
              onCashOutPress={onCashOutPress}
              ledgerCategory={ledgerCategory}
              onLedgerCategoryChange={onLedgerCategoryChange}
              searchQuery={searchQuery}
              onSearchChange={onSearchChange}
              searchPlaceholder={searchPlaceholder}
              onReportPress={onReportPress}
              entityFilter={entityFilter}
              onEntityFilterChange={onEntityFilterChange}
              entityFilterLabels={entityFilterLabels}
              garagePeriodOptions={garagePeriodOptions}
              garagePeriod={garagePeriod}
              onGaragePeriodChange={onGaragePeriodChange}
              garageViewTab={garageViewTab}
              onGarageViewTabChange={onGarageViewTabChange}
              showPeriodFilter={showPeriodFilter}
              periodFilter={periodFilter}
              onPeriodFilterChange={onPeriodFilterChange}
              sourceFilter={sourceFilter}
              onSourceFilterChange={onSourceFilterChange}
              amountAnimationResetKey={activeTab}
              cashNetworkLayout
              onClearFilters={onClearFilters}
              isAnyFilterActive={isAnyFilterActive}
            />
          </View>
        </View>
        {datePreset != null && (
          <View style={styles.financeDatePresetOutsideWrap}>
            <DatePresetPillBar
              variant="onLight"
              period={datePreset.period}
              onPeriodChange={datePreset.onPeriodChange}
              onCustomRangePress={datePreset.onCustomRangePress}
              customFrom={datePreset.customFrom}
              customTo={datePreset.customTo}
            />
          </View>
        )}
      </>
    );
  }

  return (
    <>
      <View style={styles.financeCardsBlock}>
        <View style={styles.financeCardsGrid}>
          <Pressable
            onPress={() => onTabPress("cash")}
            style={styles.financeBalanceCard}
          >
            <View style={styles.financeBalanceDecorIconWrap}>
              <FontAwesome
                name="book"
                size={desktopParity ? 132 : 92}
                color={Theme.textOnDark}
                style={styles.financeBalanceDecorIcon}
              />
            </View>
            <View style={styles.financeBalanceTopRow}>
              <Text style={styles.financeBalanceEyebrow}>
                Audited Operating Balance
              </Text>
              {datePreset != null && (
                <View style={styles.financeRangeDesktopWrap}>
                  <Text style={styles.financeRangeLabel}>Range</Text>
                  <View style={styles.financeRangeDesktopPillRow}>
                    {rangePills.map((pill) => {
                      const active = datePreset.period === pill.id;
                      return (
                        <Pressable
                          key={pill.id}
                          onPress={() => datePreset.onPeriodChange(pill.id)}
                          style={[
                            styles.financeRangePill,
                            styles.financeRangePillDesktop,
                            active && styles.financeRangePillActive,
                          ]}
                        >
                          <Text
                            style={[
                              styles.financeRangePillText,
                              active && styles.financeRangePillTextActive,
                            ]}
                          >
                            {pill.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                    <Pressable
                      onPress={() => {
                        if (onQuickCustomRange) {
                          const now = new Date();
                          const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                          const to = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
                          onQuickCustomRange(from.toISOString(), to.toISOString());
                        }
                      }}
                      style={[
                        styles.financeRangePill,
                        styles.financeRangePillDesktop,
                        datePreset.period === "CUSTOM" && styles.financeRangePillActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.financeRangePillText,
                          datePreset.period === "CUSTOM" && styles.financeRangePillTextActive,
                        ]}
                      >
                        Last Month
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => datePreset.onCustomRangePress()}
                      style={[
                        styles.financeRangePill,
                        styles.financeRangePillDesktop,
                        styles.financeRangePillCustom,
                      ]}
                    >
                      <FontAwesome name="calendar" size={11} color={Theme.textOnDarkMuted} />
                      <Text style={styles.financeRangePillText}>Custom</Text>
                    </Pressable>
                  </View>
                </View>
              )}
            </View>
            <Text style={styles.financeBalanceValue}>
              {formatAmount(auditedNet)}
            </Text>
            <View style={styles.financeBalanceStatsRow}>
              <View style={styles.financeBalanceStat}>
                <View style={styles.financeBalanceStatIconIn}>
                  <FontAwesome
                    name="arrow-circle-down"
                    size={desktopParity ? 15 : 13}
                    color={Theme.textOnDark}
                  />
                </View>
                <View>
                  <Text style={styles.financeBalanceStatLabel}>Incoming</Text>
                  <Text style={styles.financeBalanceStatValue}>
                    {formatAmount(auditedIn)}
                  </Text>
                </View>
              </View>
              <View style={styles.financeBalanceStat}>
                <View style={styles.financeBalanceStatIconOut}>
                  <FontAwesome
                    name="arrow-circle-up"
                    size={desktopParity ? 15 : 13}
                    color={Theme.textOnDark}
                  />
                </View>
                <View>
                  <Text style={styles.financeBalanceStatLabel}>Outgoing</Text>
                  <Text style={styles.financeBalanceStatValue}>
                    {formatAmount(auditedOut)}
                  </Text>
                </View>
              </View>
            </View>
          </Pressable>
        </View>

        <View
          style={[
            styles.financeCategoryCardsRow,
            desktopFourCardParity && styles.financeCategoryCardsRowDesktopGrid,
          ]}
        >
          {[
            {
              id: "customers" as FinanceSubTab,
              label: "Client Revenue",
              value: "₹45k",
              icon: "building",
              gradient: [
                Theme.financeCardBlueFrom,
                Theme.financeCardBlueTo,
              ] as const,
            },
            {
              id: "suppliers" as FinanceSubTab,
              label: "Supplier Payables",
              value: "₹14k",
              icon: "industry",
              gradient: [
                Theme.financeCardOrangeFrom,
                Theme.financeCardOrangeTo,
              ] as const,
            },
            {
              id: "garage" as FinanceSubTab,
              label: "Vehicle Opex",
              value: "₹22.0k",
              icon: "truck",
              gradient: [
                Theme.financeCardSlateFrom,
                Theme.financeCardSlateTo,
              ] as const,
            },
            {
              id: "drivers" as FinanceSubTab,
              label: "Fleet Payroll",
              value: "₹0.0k",
              icon: "user",
              gradient: [
                Theme.financeCardGreenFrom,
                Theme.financeCardGreenTo,
              ] as const,
            },
          ].map((card) => (
            <AnimatedFinanceCategoryCard
              key={card.id}
              label={card.label}
              value={card.value}
              icon={card.icon}
              gradient={card.gradient}
              onPress={() => onTabPress(card.id)}
              desktop={desktopParity}
              style={[
                styles.financeCategoryCard,
                desktopFourCardParity && styles.financeCategoryCardDesktop,
              ]}
            />
          ))}
        </View>
      </View>

    </>
  );
}
