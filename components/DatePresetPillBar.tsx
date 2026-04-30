/**
 * Horizontal date preset pills (Treasury / Finance / detail trip lists).
 */
import Theme from "@/constants/Theme";
import type { FinancePeriodFilter } from "@/features/finance/types";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useMemo } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const PRESETS: { id: FinancePeriodFilter; label: string }[] = [
  { id: "TODAY", label: "Today" },
  { id: "YESTERDAY", label: "Yesterday" },
  { id: "WEEK", label: "This week" },
  { id: "MONTH", label: "This month" },
  { id: "RANGE", label: "All" },
  { id: "CUSTOM", label: "Custom" },
];

export interface DatePresetPillBarProps {
  period: FinancePeriodFilter;
  onPeriodChange: (p: FinancePeriodFilter) => void;
  /** Opens custom range picker (parent owns modal). */
  onCustomRangePress: () => void;
  customFrom?: string | null;
  customTo?: string | null;
  /** Dark background (Finance header) vs light card. */
  variant?: "onDark" | "onLight";
}

function formatShortRange(from: string, to: string): string {
  const a = from.slice(0, 10);
  const b = to.slice(0, 10);
  if (!a || !b) return "Custom";
  try {
    const da = new Date(a + "T12:00:00");
    const db = new Date(b + "T12:00:00");
    const fa = da.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
    const fb = db.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
    return fa === fb ? fa : `${fa}–${fb}`;
  } catch {
    return "Custom";
  }
}

export function DatePresetPillBar({
  period,
  onPeriodChange,
  onCustomRangePress,
  customFrom,
  customTo,
  variant = "onDark",
}: DatePresetPillBarProps) {
  const onDark = variant === "onDark";
  const customSummary = useMemo(() => {
    if (period !== "CUSTOM" || !customFrom || !customTo) return null;
    return formatShortRange(customFrom, customTo);
  }, [period, customFrom, customTo]);

  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {PRESETS.map(({ id, label }) => {
          const isCustom = id === "CUSTOM";
          const active =
            period === id ||
            (isCustom && period === "CUSTOM" && !!customFrom && !!customTo);
          const displayLabel =
            isCustom && customSummary ? customSummary : label;
          return (
            <TouchableOpacity
              key={id}
              style={[
                styles.pill,
                onDark ? styles.pillDark : styles.pillLight,
                active &&
                  (onDark ? styles.pillActiveDark : styles.pillActiveLight),
              ]}
              onPress={() => {
                if (isCustom) {
                  onCustomRangePress();
                  return;
                }
                onPeriodChange(id);
              }}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={displayLabel}
            >
              <Text
                style={[
                  styles.pillText,
                  onDark ? styles.pillTextDark : styles.pillTextLight,
                  active &&
                    (onDark
                      ? styles.pillTextActiveDark
                      : styles.pillTextActiveLight),
                ]}
                numberOfLines={1}
              >
                {displayLabel}
              </Text>
            </TouchableOpacity>
          );
        })}
        <TouchableOpacity
          style={[
            styles.iconPill,
            onDark ? styles.pillDark : styles.pillLight,
          ]}
          onPress={onCustomRangePress}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Pick date range"
        >
          <FontAwesome
            name="calendar"
            size={14}
            color={onDark ? Theme.textOnDark : Theme.textSecondary}
          />
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: -2,
    marginBottom: 0,
  },
  scrollContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 6,
    paddingHorizontal: 2,
  },
  pill: {
    minHeight: 40,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  iconPill: {
    width: 42,
    height: 40,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  pillDark: {
    backgroundColor: "#17191f",
    borderColor: "rgba(255,255,255,0.14)",
  },
  pillLight: {
    backgroundColor: Theme.screenBackground,
    borderColor: Theme.surfaceBorder,
  },
  pillActiveDark: {
    backgroundColor: Theme.textOnDark,
    borderColor: Theme.textOnDark,
  },
  pillActiveLight: {
    backgroundColor: Theme.iconPrimary,
    borderColor: Theme.iconPrimary,
  },
  pillText: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.1,
  },
  pillTextDark: {
    color: Theme.textOnDarkMuted,
  },
  pillTextLight: {
    color: Theme.textSecondary,
  },
  pillTextActiveDark: {
    color: Theme.darkBackground,
  },
  pillTextActiveLight: {
    color: Theme.screenBackground,
  },
});
