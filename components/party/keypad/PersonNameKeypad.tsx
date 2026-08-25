/**
 * QWERTY letter keypad for person names (space + delete enabled).
 * Chrome matches IndianVehicleRegistrationKeypad / DecimalKeypad apple pad.
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
import { Delete } from "lucide-react-native";

import Theme from "@/constants/Theme";
import { triggerFeedback } from "@/components/mobile-input/feedback";
import { PERSON_NAME_MAX_LENGTH } from "@/lib/personNameKeypad.util";

const APPLE_KEYPAD_BG = "#D1D5DB";
const APPLE_KEY_BG = "#FFFFFF";
const APPLE_SPECIAL_BG = "#ACB3BC";
const APPLE_DISABLED_TEXT = "#8E95A3";

const LETTER_ROW_1 = ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"] as const;
const LETTER_ROW_2 = ["A", "S", "D", "F", "G", "H", "J", "K", "L"] as const;
const LETTER_ROW_3 = ["Z", "X", "C", "V", "B", "N", "M"] as const;

export type PersonNameKeypadKey = string;

export interface PersonNameKeypadProps {
  onKey: (key: PersonNameKeypadKey) => void;
  disabled?: boolean;
  length?: number;
  maxLength?: number;
  compact?: boolean;
}

type KeyCellProps = {
  label?: string;
  icon?: "delete";
  onPress?: () => void;
  disabled?: boolean;
  variant?: "char" | "special";
  flex?: number;
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
  textStyle?: "letter" | "utility";
  compact?: boolean;
};

function KeyCell({
  label,
  icon,
  onPress,
  disabled = false,
  variant = "char",
  flex = 1,
  accessibilityLabel,
  style,
  textStyle = "letter",
  compact = false,
}: KeyCellProps) {
  const isSpecial = variant === "special";

  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.key,
        compact && styles.keyCompact,
        { flex },
        isSpecial ? styles.keySpecial : styles.keyChar,
        disabled && styles.keyInactive,
        pressed && !disabled && styles.keyPressed,
        style,
      ]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
    >
      {icon === "delete" ? (
        <Delete
          size={compact ? 18 : 22}
          color={disabled ? APPLE_DISABLED_TEXT : Theme.textPrimaryDark}
          strokeWidth={2}
        />
      ) : label ? (
        <Text
          style={[
            styles.keyText,
            compact && styles.keyTextCompact,
            textStyle === "utility" && styles.keyTextUtility,
            isSpecial && styles.keyTextSpecial,
            disabled && styles.keyTextInactive,
          ]}
        >
          {label}
        </Text>
      ) : null}
    </Pressable>
  );
}

function RowSpacer({ flex = 0.5 }: { flex?: number }) {
  return <View style={{ flex }} pointerEvents="none" accessibilityElementsHidden />;
}

export const PersonNameKeypad = memo(function PersonNameKeypad({
  onKey,
  disabled = false,
  length = 0,
  maxLength = PERSON_NAME_MAX_LENGTH,
  compact = false,
}: PersonNameKeypadProps) {
  const atMax = length >= maxLength;
  const canDelete = length > 0 && !disabled;
  const inputLocked = disabled || atMax;

  const handlePress = useCallback(
    (key: string) => {
      if (disabled) return;
      if (key !== "⌫" && inputLocked) return;
      if (key === "⌫" && !canDelete) return;
      triggerFeedback(key === "⌫" ? "delete" : "keyPress");
      onKey(key);
    },
    [disabled, inputLocked, canDelete, onKey],
  );

  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      <View style={[styles.grid, compact && styles.gridCompact]}>
        <View style={[styles.row, compact && styles.rowCompact]}>
          {LETTER_ROW_1.map((letter) => (
            <KeyCell
              key={letter}
              label={letter}
              onPress={() => handlePress(letter)}
              disabled={inputLocked}
              compact={compact}
              accessibilityLabel={`Letter ${letter}`}
            />
          ))}
        </View>

        <View style={[styles.row, styles.rowInset, compact && styles.rowCompact]}>
          <RowSpacer flex={0.45} />
          {LETTER_ROW_2.map((letter) => (
            <KeyCell
              key={letter}
              label={letter}
              onPress={() => handlePress(letter)}
              disabled={inputLocked}
              compact={compact}
              accessibilityLabel={`Letter ${letter}`}
            />
          ))}
          <RowSpacer flex={0.45} />
        </View>

        <View style={[styles.row, compact && styles.rowCompact]}>
          <View style={{ flex: 1.35 }} pointerEvents="none" accessibilityElementsHidden />
          {LETTER_ROW_3.map((letter) => (
            <KeyCell
              key={letter}
              label={letter}
              onPress={() => handlePress(letter)}
              disabled={inputLocked}
              compact={compact}
              accessibilityLabel={`Letter ${letter}`}
            />
          ))}
          <KeyCell
            icon="delete"
            onPress={() => handlePress("⌫")}
            disabled={!canDelete}
            variant="special"
            flex={1.35}
            compact={compact}
            accessibilityLabel="Delete"
          />
        </View>

        <View style={[styles.row, compact && styles.rowCompact]}>
          <KeyCell
            label="space"
            variant="special"
            flex={5}
            textStyle="utility"
            compact={compact}
            onPress={() => handlePress(" ")}
            disabled={inputLocked || length === 0}
            accessibilityLabel="Space"
            style={styles.spaceKey}
          />
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    backgroundColor: APPLE_KEYPAD_BG,
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingTop: 8,
    paddingBottom: 8,
    ...Platform.select({
      web: { userSelect: "none" as const },
      default: {},
    }),
  },
  wrapCompact: {
    borderRadius: 10,
    paddingHorizontal: 5,
    paddingTop: 5,
    paddingBottom: 5,
  },
  grid: {
    width: "100%",
    gap: 7,
  },
  gridCompact: {
    gap: 5,
  },
  row: {
    flexDirection: "row",
    alignItems: "stretch",
    width: "100%",
    gap: 6,
  },
  rowCompact: {
    gap: 5,
  },
  rowInset: {
    paddingHorizontal: 2,
  },
  key: {
    minWidth: 0,
    minHeight: 44,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.28,
        shadowRadius: 0,
      },
      android: { elevation: 2 },
      web: {
        boxShadow: "0 1px 0 rgba(0,0,0,0.35)",
        cursor: "pointer" as const,
      },
      default: {},
    }),
  },
  keyCompact: {
    minHeight: 34,
    borderRadius: 7,
  },
  keyChar: {
    backgroundColor: APPLE_KEY_BG,
  },
  keySpecial: {
    backgroundColor: APPLE_SPECIAL_BG,
    ...Platform.select({
      ios: { shadowOpacity: 0.18 },
      default: {},
    }),
  },
  keyInactive: {
    opacity: 0.55,
  },
  keyPressed: {
    opacity: 0.85,
  },
  keyText: {
    fontSize: 16,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
  },
  keyTextCompact: {
    fontSize: 14,
  },
  keyTextUtility: {
    fontSize: 13,
    fontWeight: "600",
    textTransform: "lowercase",
  },
  keyTextSpecial: {
    color: Theme.textPrimaryDark,
  },
  keyTextInactive: {
    color: APPLE_DISABLED_TEXT,
  },
  spaceKey: {
    minHeight: 44,
  },
});
