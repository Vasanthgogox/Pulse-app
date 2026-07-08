/**
 * Trips hub filter sheet — light bottom sheet with MMT-style header (reference).
 */
import Theme from "@/constants/Theme";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type SortBy =
  | "date_desc"
  | "date_asc"
  | "revenue_desc"
  | "revenue_asc"
  | "client_asc"
  | "client_desc";

type PaymentFilter = "all" | "pending" | "partial" | "paid";

type AttributionFilter = "all" | "attributed";

type DateFilterChip = "all" | "today" | "tomorrow" | "this_week" | "this_month";

export type TripsFilterSortOption = {
  id: SortBy;
  label: string;
  icon: React.ComponentProps<typeof FontAwesome>["name"];
};

export type TripsFilterSupplyTab = {
  id: string;
  label: string;
  isActive: boolean;
  onPress: () => void;
};

export interface TripsFilterBottomSheetProps {
  visible: boolean;
  onClose: () => void;
  onClearAll: () => void;
  title: string;
  clearAllLabel: string;
  applyLabel: string;
  viewByLabel: string;
  tripTypeLabel: string;
  dateFilterLabel: string;
  paymentStatusLabel: string;
  loadTypeLabel: string;
  sortOptions: TripsFilterSortOption[];
  sortBy: SortBy;
  onSortByChange: (id: SortBy) => void;
  supplyTabs: TripsFilterSupplyTab[];
  dateFilters: readonly DateFilterChip[];
  dateRangeFilter: DateFilterChip | string;
  onDateFilterChange: (id: DateFilterChip) => void;
  dateFilterOptionLabel: (id: DateFilterChip) => string;
  paymentFilters: readonly PaymentFilter[];
  paymentFilter: PaymentFilter;
  onPaymentFilterChange: (id: PaymentFilter) => void;
  paymentFilterOptionLabel: (id: PaymentFilter) => string;
  attributionFilterLabel: string;
  attributionFilters: readonly AttributionFilter[];
  attributionFilter: AttributionFilter;
  onAttributionFilterChange: (id: AttributionFilter) => void;
  attributionFilterOptionLabel: (id: AttributionFilter) => string;
  loadTypeOptions: string[];
  loadTypeFilter: string;
  onLoadTypeFilterChange: (value: string) => void;
  allLabel: string;
  maxScrollHeight?: number;
}

function FilterSection({
  title,
  icon,
  children,
  style,
}: {
  title: string;
  icon: React.ComponentProps<typeof FontAwesome>["name"];
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.section, style]}>
      <View style={styles.sectionHeader}>
        <FontAwesome
          name={icon}
          size={11}
          color={Theme.pulseIndigo}
          style={styles.sectionIcon}
        />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      <View style={styles.chipRow}>{children}</View>
    </View>
  );
}

function FilterChip({
  label,
  active,
  onPress,
  icon,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  icon?: React.ComponentProps<typeof FontAwesome>["name"];
}) {
  return (
    <TouchableOpacity
      style={[styles.chip, active && styles.chipActive]}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      {icon ? (
        <FontAwesome
          name={icon}
          size={10}
          color={active ? Theme.buttonPrimaryText : Theme.textRouteCard}
          style={styles.chipIcon}
        />
      ) : null}
      <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export function TripsFilterBottomSheet({
  visible,
  onClose,
  onClearAll,
  title,
  clearAllLabel,
  applyLabel,
  viewByLabel,
  tripTypeLabel,
  dateFilterLabel,
  paymentStatusLabel,
  loadTypeLabel,
  sortOptions,
  sortBy,
  onSortByChange,
  supplyTabs,
  dateFilters,
  dateRangeFilter,
  onDateFilterChange,
  dateFilterOptionLabel,
  paymentFilters,
  paymentFilter,
  onPaymentFilterChange,
  paymentFilterOptionLabel,
  attributionFilterLabel,
  attributionFilters,
  attributionFilter,
  onAttributionFilterChange,
  attributionFilterOptionLabel,
  loadTypeOptions,
  loadTypeFilter,
  onLoadTypeFilterChange,
  allLabel,
  maxScrollHeight = 480,
}: TripsFilterBottomSheetProps) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close filters"
        />
        <View
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}
          onStartShouldSetResponder={() => true}
        >
          <View style={styles.handle} />

          <View style={styles.headerRow}>
            <TouchableOpacity
              onPress={onClose}
              style={styles.headerSideBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Back"
            >
              <FontAwesome name="chevron-left" size={16} color={Theme.iconPrimary} />
            </TouchableOpacity>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {title}
            </Text>
            <TouchableOpacity
              onPress={onClearAll}
              style={styles.headerSideBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
            >
              <Text style={styles.clearAllText}>{clearAllLabel}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.headerDivider} />

          <ScrollView
            showsVerticalScrollIndicator={false}
            style={{ maxHeight: maxScrollHeight }}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <FilterSection title={viewByLabel} icon="sort">
              {sortOptions.map((opt) => (
                <FilterChip
                  key={opt.id}
                  label={opt.label}
                  icon={opt.icon}
                  active={sortBy === opt.id}
                  onPress={() => onSortByChange(opt.id)}
                />
              ))}
            </FilterSection>

            <View style={styles.sectionDivider} />

            <FilterSection title={tripTypeLabel} icon="sitemap">
              {supplyTabs.map((tab) => (
                <FilterChip
                  key={tab.id}
                  label={tab.label}
                  active={tab.isActive}
                  onPress={tab.onPress}
                />
              ))}
            </FilterSection>

            <View style={styles.sectionDivider} />

            <FilterSection title={dateFilterLabel} icon="calendar">
              {dateFilters.map((f) => (
                <FilterChip
                  key={f}
                  label={dateFilterOptionLabel(f)}
                  active={dateRangeFilter === f}
                  onPress={() => onDateFilterChange(f)}
                />
              ))}
            </FilterSection>

            <View style={styles.sectionDivider} />

            <FilterSection title={paymentStatusLabel} icon="money">
              {paymentFilters.map((f) => (
                <FilterChip
                  key={f}
                  label={paymentFilterOptionLabel(f)}
                  active={paymentFilter === f}
                  onPress={() => onPaymentFilterChange(f)}
                />
              ))}
            </FilterSection>

            <View style={styles.sectionDivider} />

            <FilterSection title={attributionFilterLabel} icon="exchange">
              {attributionFilters.map((f) => (
                <FilterChip
                  key={f}
                  label={attributionFilterOptionLabel(f)}
                  active={attributionFilter === f}
                  onPress={() => onAttributionFilterChange(f)}
                />
              ))}
            </FilterSection>

            {loadTypeOptions.length > 0 ? (
              <>
                <View style={styles.sectionDivider} />
                <FilterSection title={loadTypeLabel} icon="cube">
                  <FilterChip
                    label={allLabel}
                    active={loadTypeFilter === "all"}
                    onPress={() => onLoadTypeFilterChange("all")}
                  />
                  {loadTypeOptions.map((lt) => (
                    <FilterChip
                      key={lt}
                      label={lt}
                      active={loadTypeFilter === lt}
                      onPress={() => onLoadTypeFilterChange(lt)}
                    />
                  ))}
                </FilterSection>
              </>
            ) : null}
          </ScrollView>

          <TouchableOpacity
            style={styles.applyBtn}
            onPress={onClose}
            activeOpacity={0.9}
            accessibilityRole="button"
          >
            <Text style={styles.applyBtnText}>{applyLabel}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: Theme.overlayBackdrop,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    backgroundColor: Theme.screenBackground,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
    paddingTop: 8,
    paddingHorizontal: 20,
    maxHeight: "92%",
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 16,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: Theme.borderInput,
    alignSelf: "center",
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    gap: 8,
  },
  headerSideBtn: {
    minWidth: 72,
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    textAlign: "center",
    letterSpacing: -0.3,
  },
  clearAllText: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textRouteCard,
    textAlign: "right",
  },
  headerDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Theme.borderLight,
    marginBottom: 4,
  },
  scrollContent: {
    paddingTop: 12,
    paddingBottom: 8,
  },
  section: {
    marginBottom: 4,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionIcon: {
    marginRight: 6,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.pulseIndigo,
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  sectionDivider: {
    height: 1,
    backgroundColor: Theme.borderLight,
    marginVertical: 16,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 9,
    paddingHorizontal: 14,
    backgroundColor: Theme.surface,
    maxWidth: "100%",
  },
  chipActive: {
    backgroundColor: Theme.buttonPrimary,
  },
  chipIcon: {
    marginRight: 5,
  },
  chipText: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.1,
  },
  chipTextActive: {
    color: Theme.buttonPrimaryText,
    fontWeight: "700",
  },
  applyBtn: {
    marginTop: 12,
    backgroundColor: Theme.buttonPrimary,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  applyBtnText: {
    color: Theme.buttonPrimaryText,
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
});
