/**
 * AnalyticsFilters — period picker + optional search/filter chips.
 * ============================================================================
 *
 * Replaces the duplicated period-picker pill row currently inline in
 * `VehicleAnalyticsTab` and `DriverAnalyticsTab`. Two stand-alone
 * exports:
 *
 *   • `<PeriodPicker />`      — Monthly / Quarterly / Yearly / Lifetime tabs
 *   • `<AnalyticsFilters />`  — period picker + search + filter chips
 *                                 (composes `PeriodPicker` internally)
 *
 * Use `PeriodPicker` directly when you only need the time-window control
 * (e.g. inside a `ChartCard` header). Use `AnalyticsFilters` for a full
 * dashboard toolbar.
 */

import { memo, type ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ViewStyle,
} from "react-native";

import { Theme } from "@/constants/Theme";
import type { AnalyticsPeriod } from "@/features/analytics";

// ─────────────────────────────────────────────────────────────────────────────
// PeriodPicker
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_PERIODS: ReadonlyArray<{
  id: AnalyticsPeriod;
  label: string;
}> = [
  { id: "monthly", label: "Monthly" },
  { id: "quarterly", label: "Quarterly" },
  { id: "yearly", label: "Yearly" },
  { id: "lifetime", label: "Lifetime" },
];

export interface PeriodPickerProps {
  value: AnalyticsPeriod;
  onChange: (period: AnalyticsPeriod) => void;
  /** Restrict to a subset of periods (e.g. omit `lifetime` for fleet tabs). */
  options?: ReadonlyArray<AnalyticsPeriod>;
  /** Compact pill style — used inside chart card headers. */
  size?: "sm" | "md";
}

export const PeriodPicker = memo(function PeriodPicker({
  value,
  onChange,
  options,
  size = "md",
}: PeriodPickerProps) {
  const items = options
    ? DEFAULT_PERIODS.filter((p) => options.includes(p.id))
    : DEFAULT_PERIODS;
  return (
    <View style={[styles.pickerRow, size === "sm" && styles.pickerRowSm]}>
      {items.map((p) => {
        const active = value === p.id;
        return (
          <Pressable
            key={p.id}
            onPress={() => onChange(p.id)}
            style={({ pressed }) => [
              styles.pickerPill,
              size === "sm" && styles.pickerPillSm,
              active && styles.pickerPillActive,
              pressed && styles.pickerPillPressed,
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={p.label}
          >
            <Text
              style={[
                styles.pickerText,
                size === "sm" && styles.pickerTextSm,
                active && styles.pickerTextActive,
              ]}
            >
              {p.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// FilterChip — single toggleable chip
// ─────────────────────────────────────────────────────────────────────────────

export interface FilterChipProps {
  id: string;
  label: string;
  active?: boolean;
  count?: number;
  onPress: (id: string) => void;
}

export const FilterChip = memo(function FilterChip({
  id,
  label,
  active,
  count,
  onPress,
}: FilterChipProps) {
  return (
    <Pressable
      onPress={() => onPress(id)}
      style={({ pressed }) => [
        styles.chip,
        active && styles.chipActive,
        pressed && styles.chipPressed,
      ]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>
        {label}
      </Text>
      {typeof count === "number" ? (
        <View style={[styles.chipCount, active && styles.chipCountActive]}>
          <Text style={[styles.chipCountText, active && styles.chipCountTextActive]}>
            {count}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// AnalyticsFilters
// ─────────────────────────────────────────────────────────────────────────────

export interface AnalyticsFiltersProps {
  period: AnalyticsPeriod;
  onPeriodChange: (period: AnalyticsPeriod) => void;
  periodOptions?: ReadonlyArray<AnalyticsPeriod>;
  search?: string;
  onSearchChange?: (text: string) => void;
  searchPlaceholder?: string;
  chips?: ReadonlyArray<FilterChipProps>;
  /** Slot for additional controls (sort dropdown, export button). */
  trailingSlot?: ReactNode;
  containerStyle?: ViewStyle;
}

export const AnalyticsFilters = memo(function AnalyticsFilters({
  period,
  onPeriodChange,
  periodOptions,
  search,
  onSearchChange,
  searchPlaceholder = "Search",
  chips,
  trailingSlot,
  containerStyle,
}: AnalyticsFiltersProps) {
  return (
    <View style={[styles.filtersContainer, containerStyle]}>
      <View style={styles.filtersTopRow}>
        <PeriodPicker
          value={period}
          onChange={onPeriodChange}
          options={periodOptions}
          size="sm"
        />
        {trailingSlot ? <View style={styles.trailing}>{trailingSlot}</View> : null}
      </View>
      {onSearchChange ? (
        <TextInput
          value={search ?? ""}
          onChangeText={onSearchChange}
          placeholder={searchPlaceholder}
          placeholderTextColor={Theme.textMuted}
          style={styles.search}
          underlineColorAndroid="transparent"
        />
      ) : null}
      {chips && chips.length > 0 ? (
        <View style={styles.chipsRow}>
          {chips.map((c) => (
            <FilterChip key={c.id} {...c} />
          ))}
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  pickerRow: {
    flexDirection: "row",
    gap: 6,
    flexWrap: "wrap",
  },
  pickerRowSm: {
    gap: 4,
  },
  pickerPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  pickerPillSm: {
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  pickerPillActive: {
    backgroundColor: Theme.primary,
    borderColor: Theme.primary,
  },
  pickerPillPressed: {
    opacity: 0.85,
  },
  pickerText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textRouteCard,
    letterSpacing: 0.2,
  },
  pickerTextSm: {
    fontSize: 11,
  },
  pickerTextActive: {
    color: Theme.cardWhite,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  chipActive: {
    backgroundColor: Theme.pulseIndigoWash,
    borderColor: Theme.primary,
  },
  chipPressed: {
    opacity: 0.85,
  },
  chipText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textRouteCard,
  },
  chipTextActive: {
    color: Theme.primary,
  },
  chipCount: {
    minWidth: 18,
    paddingHorizontal: 5,
    borderRadius: 999,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
  },
  chipCountActive: {
    backgroundColor: Theme.primary,
  },
  chipCountText: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textRouteCard,
  },
  chipCountTextActive: {
    color: Theme.cardWhite,
  },
  filtersContainer: {
    gap: 10,
  },
  filtersTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 8,
  },
  trailing: {
    marginLeft: 8,
  },
  search: {
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    color: Theme.textBody,
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
});
