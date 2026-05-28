import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors } from "@/design-system/colors";
import { radius } from "@/design-system/radius";
import { space } from "@/design-system/spacing";

export type OperationalChipOption<T extends string> = {
  value: T;
  label: string;
};

export interface OperationalChipSelectProps<T extends string> {
  label: string;
  hint?: string;
  options: ReadonlyArray<OperationalChipOption<T>>;
  value: T;
  onChange: (value: T) => void;
  /** When true, chips use a denser 3-column wrap grid (default on mobile-friendly forms). */
  compact?: boolean;
}

function OperationalChipSelectInner<T extends string>({
  label,
  hint,
  options,
  value,
  onChange,
  compact = true,
}: OperationalChipSelectProps<T>) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      <View style={[styles.grid, compact && styles.gridCompact]}>
        {options.map((option) => {
          const active = option.value === value;
          return (
            <Pressable
              key={option.value}
              onPress={() => onChange(option.value)}
              style={({ pressed }) => [
                styles.chip,
                compact && styles.chipCompact,
                active && styles.chipActive,
                pressed && !active && styles.chipPressed,
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={option.label}
            >
              <Text
                style={[styles.chipText, active && styles.chipTextActive]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.85}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export const OperationalChipSelect = memo(
  OperationalChipSelectInner,
) as typeof OperationalChipSelectInner;

const styles = StyleSheet.create({
  wrap: {
    gap: space[1],
  },
  label: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  hint: {
    fontSize: 9,
    fontWeight: "500",
    color: colors.textMuted,
    lineHeight: 12,
    marginBottom: 2,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space[2],
  },
  gridCompact: {
    gap: 6,
  },
  chip: {
    flexGrow: 1,
    flexBasis: "30%",
    minWidth: 76,
    maxWidth: "48%",
    minHeight: 34,
    paddingHorizontal: space[2],
    paddingVertical: 6,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  chipCompact: {
    flexBasis: "31%",
    minWidth: 72,
    minHeight: 32,
    paddingVertical: 5,
    paddingHorizontal: 6,
  },
  chipActive: {
    backgroundColor: "#eef2ff",
    borderColor: colors.brand,
  },
  chipPressed: {
    opacity: 0.9,
  },
  chipText: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.textPrimary,
    textAlign: "center",
  },
  chipTextActive: {
    color: colors.brand,
    fontWeight: "800",
  },
});
