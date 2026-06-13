import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import Theme from "@/constants/Theme";
import Typography from "@/constants/Typography";

import { DriverOpsEntryIcon } from "./driverOpsEntry.styles";

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
  | "fuel_type"
  | "toll_entry"
  | "generic";

type Props<T extends string> = {
  label: string;
  hint?: string;
  options: ReadonlyArray<DriverExpenseChipOption<T>>;
  value: T;
  onChange: (value: T) => void;
  /** Tile columns — 2 for categories, 3 for payment modes. Ignored for pill variant. */
  columns?: 2 | 3;
  /** Auto-resolve Lucide icons + tints from value. */
  visualGroup?: DriverExpenseChipGroup;
  /** Compact pill chips (default for driver expense log). */
  variant?: "tile" | "pill";
  density?: "default" | "compact";
};

export function DriverExpenseChipSelect<T extends string>({
  label,
  hint,
  options,
  value,
  onChange,
  columns = 3,
  visualGroup = "generic",
  variant = "pill",
  density = "compact",
}: Props<T>) {
  const isPill = variant === "pill";
  const isCompact = density === "compact" || isPill;
  const columnStyle = columns === 2 ? styles.tileHalf : styles.tileThird;
  const iconSize = isPill ? DriverOpsEntryIcon.chipPill : isCompact ? 12 : DriverOpsEntryIcon.chip;

  return (
    <View style={[styles.wrap, isCompact && styles.wrapCompact]}>
      <View style={styles.labelRow}>
        <Text style={[styles.label, isCompact && styles.labelCompact]}>{label}</Text>
        <View style={styles.labelRule} />
      </View>
      {hint ? <Text style={[styles.hint, isCompact && styles.hintCompact]}>{hint}</Text> : null}
      <View style={[styles.grid, isPill && styles.gridPill, isCompact && !isPill && styles.gridCompact]}>
        {options.map((option) => {
          const active = option.value === value;
          const visual =
            option.visual ??
            (visualGroup !== "generic"
              ? resolveDriverChipVisual(option.value, visualGroup)
              : null);
          const Icon = visual?.Icon;
          const iconColor = active ? Theme.driverEmeraldDark : visual?.tint ?? Theme.textSecondary;
          const iconBg = active
            ? visual?.activeTintBg ?? Theme.driverEmeraldMuted
            : visual?.tintBg ?? "rgba(148,163,184,0.12)";

          return (
            <Pressable
              key={option.value}
              onPress={() => onChange(option.value)}
              style={({ pressed }) => [
                isPill ? styles.pill : styles.tile,
                !isPill && columnStyle,
                isCompact && !isPill && styles.tileCompact,
                active && (isPill ? styles.pillActive : styles.tileActive),
                pressed && !active && (isPill ? styles.pillPressed : styles.tilePressed),
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              {active && !isPill ? <View style={styles.activeRing} pointerEvents="none" /> : null}
              {Icon ? (
                <View
                  style={[
                    isPill ? styles.pillIconBadge : styles.iconBadge,
                    isCompact && !isPill && styles.iconBadgeCompact,
                    { backgroundColor: iconBg },
                  ]}
                >
                  <Icon size={iconSize} color={iconColor} strokeWidth={2} />
                </View>
              ) : null}
              <Text
                style={[
                  isPill ? styles.pillText : styles.tileText,
                  isCompact && !isPill && styles.tileTextCompact,
                  active && (isPill ? styles.pillTextActive : styles.tileTextActive),
                ]}
                numberOfLines={1}
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

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
  },
  wrapCompact: {
    gap: 5,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  label: {
    ...Typography.headerTitle,
    fontSize: 9,
    letterSpacing: 0.65,
    color: Theme.textMuted,
  },
  labelCompact: {
    fontSize: 8,
    letterSpacing: 0.55,
  },
  labelRule: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: Theme.borderLight,
  },
  hint: {
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textSecondary,
    lineHeight: 14,
    marginTop: -2,
  },
  hintCompact: {
    fontSize: 9,
    lineHeight: 12,
    marginTop: -4,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  gridCompact: {
    gap: 6,
  },
  gridPill: {
    gap: 5,
  },
  tile: {
    position: "relative",
    minHeight: 56,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.28)",
    backgroundColor: Theme.cardWhite,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    overflow: "hidden",
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
  tileCompact: {
    minHeight: 44,
    paddingHorizontal: 6,
    paddingVertical: 6,
    borderRadius: 10,
    gap: 4,
  },
  tileHalf: {
    flexBasis: "47%",
    flexGrow: 1,
    maxWidth: "48%",
  },
  tileThird: {
    flexBasis: "30%",
    flexGrow: 1,
    minWidth: 96,
  },
  tileActive: {
    backgroundColor: Theme.driverEmeraldMuted,
    borderColor: Theme.driverEmeraldDark,
    ...Platform.select({
      ios: {
        shadowColor: Theme.driverEmeraldDark,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 10,
      },
      android: { elevation: 2 },
      default: {},
    }),
  },
  tilePressed: {
    opacity: 0.92,
    transform: [{ scale: 0.985 }],
  },
  activeRing: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(4,120,87,0.22)",
  },
  iconBadge: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  iconBadgeCompact: {
    width: 22,
    height: 22,
    borderRadius: 7,
  },
  tileText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    textAlign: "center",
    lineHeight: 13,
    letterSpacing: 0.05,
  },
  tileTextCompact: {
    fontSize: 9,
    lineHeight: 11,
  },
  tileTextActive: {
    color: Theme.driverEmeraldDark,
    fontWeight: "800",
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.32)",
    backgroundColor: Theme.cardWhite,
    maxWidth: "100%",
  },
  pillActive: {
    backgroundColor: Theme.driverEmeraldMuted,
    borderColor: Theme.driverEmeraldDark,
  },
  pillPressed: {
    opacity: 0.9,
  },
  pillIconBadge: {
    width: 18,
    height: 18,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  pillText: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    lineHeight: 12,
    flexShrink: 1,
  },
  pillTextActive: {
    color: Theme.driverEmeraldDark,
    fontWeight: "800",
  },
});
