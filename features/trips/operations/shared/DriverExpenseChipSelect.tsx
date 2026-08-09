import { useCallback, useEffect, useMemo, useState } from "react";
import {
  LayoutChangeEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import Theme from "@/constants/Theme";
import Typography from "@/constants/Typography";

import {
  resolveDriverChipVisual,
  type DriverChipVisual,
} from "./driverExpenseChipVisuals.util";

export type DriverExpenseChipOption<T extends string> = {
  value: T;
  label: string;
  visual?: DriverChipVisual;
};

export type DriverExpenseChipGroup =
  | "other_category"
  | "driver_expense_category"
  | "payment_mode"
  | "payment_owner"
  | "fuel_type"
  | "toll_entry"
  | "generic";

type Props<T extends string> = {
  label: string;
  hint?: string;
  options: ReadonlyArray<DriverExpenseChipOption<T>>;
  value: T;
  onChange: (value: T) => void;
  /** Equal-width tile columns (2 for categories, 3 for payment). */
  columns?: 2 | 3;
  /** Auto-resolve Lucide icons + tints from value. */
  visualGroup?: DriverExpenseChipGroup;
  /**
   * After a pick, collapse to a single selected summary (Add Trip pattern).
   * Tap summary / Change to expand and pick again. Default on.
   */
  collapseAfterSelect?: boolean;
  /** Locked selection — summary only, no Change. */
  disabled?: boolean;
};

const GRID_GAP = 8;

/**
 * Equal-width icon tiles + minimize-after-select summary.
 * Shared by driver and business trip expense entry.
 */
export function DriverExpenseChipSelect<T extends string>({
  label,
  hint,
  options,
  value,
  onChange,
  columns = 3,
  visualGroup = "generic",
  collapseAfterSelect = true,
  disabled = false,
}: Props<T>) {
  const [expanded, setExpanded] = useState(true);
  const [gridWidth, setGridWidth] = useState(0);

  useEffect(() => {
    if (!collapseAfterSelect) setExpanded(true);
  }, [collapseAfterSelect]);

  const selected = useMemo(
    () => options.find((option) => option.value === value) ?? options[0] ?? null,
    [options, value],
  );

  const resolveVisual = useCallback(
    (option: DriverExpenseChipOption<T> | null): DriverChipVisual | null => {
      if (!option) return null;
      if (option.visual) return option.visual;
      if (visualGroup === "generic") return null;
      return resolveDriverChipVisual(option.value, visualGroup);
    },
    [visualGroup],
  );

  const handleSelect = useCallback(
    (next: T) => {
      if (disabled) return;
      onChange(next);
      if (collapseAfterSelect) setExpanded(false);
    },
    [collapseAfterSelect, disabled, onChange],
  );

  const onGridLayout = useCallback((event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width);
    setGridWidth((prev) => (prev === next ? prev : next));
  }, []);

  const tileWidth =
    gridWidth > 0
      ? Math.floor((gridWidth - GRID_GAP * (columns - 1)) / columns)
      : undefined;

  const selectedVisual = resolveVisual(selected);
  const SelectedIcon = selectedVisual?.Icon;
  const showCollapsed =
    collapseAfterSelect && selected != null && (disabled || !expanded);

  return (
    <View style={styles.wrap}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        <View style={styles.labelRule} />
      </View>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}

      {showCollapsed ? (
        <Pressable
          onPress={() => {
            if (!disabled) setExpanded(true);
          }}
          style={({ pressed }) => [
            styles.summaryRow,
            pressed && !disabled && styles.summaryPressed,
            disabled && styles.disabled,
          ]}
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${selected?.label ?? ""}. Change`}
          disabled={disabled}
        >
          {SelectedIcon ? (
            <View
              style={[
                styles.summaryIconBadge,
                {
                  backgroundColor:
                    selectedVisual?.tintBg ?? "rgba(148,163,184,0.14)",
                },
              ]}
            >
              <SelectedIcon
                size={16}
                color={selectedVisual?.tint ?? Theme.textSecondary}
                strokeWidth={2.1}
              />
            </View>
          ) : null}
          <View style={styles.summaryCopy}>
            <Text style={styles.summaryTitle} numberOfLines={1}>
              {selected?.label ?? "—"}
            </Text>
          </View>
          {!disabled ? (
            <View style={styles.changePill}>
              <Text style={styles.changePillText}>Change</Text>
            </View>
          ) : null}
        </Pressable>
      ) : (
        <View style={styles.grid} onLayout={onGridLayout}>
          {options.map((option) => {
            const active = option.value === value;
            const visual = resolveVisual(option);
            const Icon = visual?.Icon;
            const iconColor = active
              ? Theme.driverEmeraldDark
              : visual?.tint ?? Theme.textSecondary;
            const iconBg = active
              ? Theme.driverEmeraldMuted
              : visual?.tintBg ?? "rgba(148,163,184,0.12)";

            return (
              <Pressable
                key={option.value}
                onPress={() => handleSelect(option.value)}
                style={({ pressed }) => [
                  styles.tile,
                  tileWidth != null
                    ? { width: tileWidth }
                    : columns === 2
                      ? styles.tileFallbackHalf
                      : styles.tileFallback,
                  columns === 2 ? styles.tileTall : null,
                  active && styles.tileActive,
                  pressed && !active && styles.tilePressed,
                  disabled && styles.disabled,
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: active, disabled }}
                disabled={disabled}
              >
                {Icon ? (
                  <View style={[styles.iconBadge, { backgroundColor: iconBg }]}>
                    <Icon size={15} color={iconColor} strokeWidth={2.1} />
                  </View>
                ) : null}
                <Text
                  style={[styles.tileText, active && styles.tileTextActive]}
                  numberOfLines={1}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  label: {
    ...Typography.headerTitle,
    fontSize: 11,
    letterSpacing: 0.55,
    color: Theme.textMuted,
    textTransform: "uppercase",
    fontWeight: "700",
  },
  labelRule: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: Theme.borderLight,
  },
  hint: {
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textSecondary,
    lineHeight: 16,
    marginTop: -2,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 52,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.28)",
    backgroundColor: Theme.cardWhite,
    ...Platform.select({
      ios: {
        shadowColor: "#0f172a",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 6,
      },
      android: { elevation: 1 },
      default: {},
    }),
  },
  summaryPressed: {
    backgroundColor: "rgba(248,250,252,1)",
  },
  summaryIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  summaryCopy: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  summaryKicker: {
    display: "none",
  },
  summaryTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.1,
  },
  changePill: {
    flexShrink: 0,
    minHeight: 34,
    paddingHorizontal: 14,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(148,163,184,0.12)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(148,163,184,0.28)",
  },
  changePillText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textSecondary,
    letterSpacing: 0.15,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: GRID_GAP,
  },
  tile: {
    minHeight: 68,
    paddingHorizontal: 8,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.26)",
    backgroundColor: Theme.cardWhite,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    ...Platform.select({
      ios: {
        shadowColor: "#0f172a",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.03,
        shadowRadius: 4,
      },
      android: { elevation: 1 },
      default: {},
    }),
  },
  /** Before first layout measure — keep roughly equal widths. */
  tileFallback: {
    flexGrow: 1,
    flexBasis: "30%",
    maxWidth: "32%",
  },
  tileFallbackHalf: {
    flexGrow: 1,
    flexBasis: "47%",
    maxWidth: "48.5%",
  },
  tileTall: {
    minHeight: 72,
  },
  tileActive: {
    backgroundColor: Theme.driverEmeraldMuted,
    borderColor: Theme.driverEmerald,
    borderWidth: 1.5,
  },
  tilePressed: {
    opacity: 0.92,
    transform: [{ scale: 0.985 }],
  },
  iconBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  tileText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    textAlign: "center",
    lineHeight: 15,
    letterSpacing: 0.1,
    width: "100%",
  },
  tileTextActive: {
    color: Theme.driverEmeraldDark,
    fontWeight: "800",
  },
  disabled: {
    opacity: 0.55,
  },
});
