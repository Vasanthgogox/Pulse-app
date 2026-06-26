/**
 * Segment-aware Indian plate keypad — letters or digits only, no system keyboard.
 */
import { memo, useCallback } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import Theme from "@/constants/Theme";
import { triggerFeedback } from "@/components/mobile-input/feedback";
import type { IndianVehicleKeyboardKind } from "@/lib/indianVehicleInput.util";

/** Ten columns on the top QWERTY row; shorter rows pad with trailing spacers. */
const LETTER_COLS = 10;

const LETTER_ROWS: readonly (readonly (string | null)[])[] = [
  ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L", null],
  ["Z", "X", "C", "V", "B", "N", "M", null, null, null],
];

const NUMBER_ROWS: readonly (readonly (string | null)[])[] = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  [null, "0", "⌫"],
];

export type IndianVehicleKeypadKey = string;

export interface IndianVehicleRegistrationKeypadProps {
  kind: IndianVehicleKeyboardKind;
  onKey: (key: IndianVehicleKeypadKey) => void;
  disabled?: boolean;
}

type KeyCellProps = {
  label: string;
  onPress: () => void;
  disabled: boolean;
  variant?: "default" | "special";
  style?: StyleProp<ViewStyle>;
};

function KeyCell({
  label,
  onPress,
  disabled,
  variant = "default",
  style,
}: KeyCellProps) {
  const isSpecial = variant === "special";
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.key,
        isSpecial && styles.keySpecial,
        pressed && styles.keyPressed,
        disabled && styles.keyDisabled,
        style,
      ]}
      accessibilityRole="button"
      accessibilityLabel={label === "⌫" ? "Delete" : `Key ${label}`}
    >
      <Text style={[styles.keyText, isSpecial && styles.keySpecialText]}>
        {label}
      </Text>
    </Pressable>
  );
}

function EmptySlot() {
  return <View style={styles.slot} pointerEvents="none" accessibilityElementsHidden />;
}

function KeyRow({
  cells,
  columns,
  onKey,
  disabled,
}: {
  cells: readonly (string | null)[];
  columns: number;
  onKey: (key: string) => void;
  disabled: boolean;
}) {
  const padded: (string | null)[] = [...cells];
  while (padded.length < columns) {
    padded.push(null);
  }

  const nonEmptyCount = cells.filter((cell) => cell != null).length;
  const shouldCenterLikeKeyboard = columns === LETTER_COLS;
  const rowWidthPercent = shouldCenterLikeKeyboard
    ? Math.max(52, Math.round((nonEmptyCount / columns) * 100))
    : 100;

  return (
    <View
      style={[
        styles.row,
        shouldCenterLikeKeyboard && {
          width: `${rowWidthPercent}%`,
          alignSelf: "center",
        },
      ]}
    >
      {padded.map((cell, colIdx) => {
        if (cell === null) {
          return <EmptySlot key={`empty-${colIdx}`} />;
        }
        const isDelete = cell === "⌫";
        return (
          <KeyCell
            key={`${colIdx}-${cell}`}
            label={cell}
            onPress={() => onKey(cell)}
            disabled={disabled}
            variant={isDelete ? "special" : "default"}
          />
        );
      })}
    </View>
  );
}

export const IndianVehicleRegistrationKeypad = memo(
  function IndianVehicleRegistrationKeypad({
    kind,
    onKey,
    disabled = false,
  }: IndianVehicleRegistrationKeypadProps) {
    const modeLabel = kind === "letters" ? "QWERTY" : "Numbers 0–9";

    const handlePress = useCallback(
      (key: string) => {
        if (disabled) return;
        triggerFeedback(key === "⌫" ? "delete" : "keyPress");
        onKey(key);
      },
      [disabled, onKey],
    );

    return (
      <View style={styles.wrap}>
        <Text style={styles.modeLabel}>{modeLabel}</Text>
        <View style={styles.grid}>
          {kind === "letters" ? (
            <>
              {LETTER_ROWS.map((row, rowIdx) => (
                <KeyRow
                  key={`letter-row-${rowIdx}`}
                  cells={row}
                  columns={LETTER_COLS}
                  onKey={handlePress}
                  disabled={disabled}
                />
              ))}
              <View style={styles.row}>
                <KeyCell
                  label="⌫"
                  onPress={() => handlePress("⌫")}
                  disabled={disabled}
                  variant="special"
                  style={styles.backspaceFull}
                />
              </View>
            </>
          ) : (
            NUMBER_ROWS.map((row, rowIdx) => (
              <KeyRow
                key={`number-row-${rowIdx}`}
                cells={row}
                columns={3}
                onKey={handlePress}
                disabled={disabled}
              />
            ))
          )}
        </View>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    gap: 10,
  },
  modeLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.6,
    color: Theme.textMuted,
    textTransform: "uppercase",
    textAlign: "center",
  },
  grid: {
    width: "100%",
    gap: 6,
  },
  row: {
    flexDirection: "row",
    alignItems: "stretch",
    width: "100%",
    gap: 6,
  },
  slot: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
  },
  key: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surfaceForm,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    ...Platform.select({
      web: { cursor: "pointer" as const },
    }),
  },
  backspaceFull: {
    flex: 1,
    minWidth: 0,
    backgroundColor: Theme.surface,
  },
  keySpecial: {
    backgroundColor: Theme.surface,
  },
  keyPressed: {
    backgroundColor: Theme.borderLight,
    transform: [{ scale: 0.98 }],
  },
  keyDisabled: {
    opacity: 0.45,
  },
  keyText: {
    fontSize: 20,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  keySpecialText: {
    fontSize: 22,
    fontWeight: "600",
    color: Theme.textMuted,
  },
});
