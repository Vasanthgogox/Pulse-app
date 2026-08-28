/**
 * QWERTY letter keypad for person names / short notes (space + delete).
 * Full-width space bar, large thumb targets, works on phone / tablet / desktop.
 */
import { memo, useCallback, useRef } from "react";
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

const LONG_PRESS_DELETE_INTERVAL_MS = 60;
const LONG_PRESS_DELETE_DELAY_MS = 400;

export type PersonNameKeypadKey = string;

export interface PersonNameKeypadProps {
  onKey: (key: PersonNameKeypadKey) => void;
  disabled?: boolean;
  length?: number;
  maxLength?: number;
  /** Dense dock only when horizontal space is truly tight. Prefer default. */
  compact?: boolean;
}

type KeyCellProps = {
  label?: string;
  icon?: "delete";
  onPress?: () => void;
  onLongPress?: () => void;
  onPressOut?: () => void;
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
  onLongPress,
  onPressOut,
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
      onLongPress={disabled ? undefined : onLongPress}
      onPressOut={onPressOut}
      delayLongPress={LONG_PRESS_DELETE_DELAY_MS}
      disabled={disabled}
      hitSlop={compact ? 4 : 6}
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
          size={compact ? 22 : 26}
          color={disabled ? APPLE_DISABLED_TEXT : Theme.textPrimaryDark}
          strokeWidth={2.2}
        />
      ) : label ? (
        <Text
          style={[
            styles.keyText,
            compact && styles.keyTextCompact,
            textStyle === "utility" && styles.keyTextUtility,
            textStyle === "utility" && compact && styles.keyTextUtilityCompact,
            isSpecial && styles.keyTextSpecial,
            disabled && styles.keyTextInactive,
          ]}
          numberOfLines={1}
          allowFontScaling={false}
        >
          {label}
        </Text>
      ) : null}
    </Pressable>
  );
}

function RowSpacer({ flex = 0.5 }: { flex?: number }) {
  return (
    <View
      style={{ flex }}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
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
  /** Letters / space lock at max; delete stays available. */
  const lettersLocked = disabled || atMax;
  /**
   * Space is usable after the first character until max length.
   * Keep the bar enabled even when the value already ends with a space so
   * the control never looks “dead” mid-word (handler still no-ops duplicates).
   */
  const spaceLocked = disabled || atMax || length === 0;

  const deleteIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const deleteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopRapidDelete = useCallback(() => {
    if (deleteIntervalRef.current != null) {
      clearInterval(deleteIntervalRef.current);
      deleteIntervalRef.current = null;
    }
    if (deleteTimeoutRef.current != null) {
      clearTimeout(deleteTimeoutRef.current);
      deleteTimeoutRef.current = null;
    }
  }, []);

  const emitKey = useCallback(
    (key: string) => {
      if (disabled) return;
      if (key === "⌫") {
        if (!canDelete) return;
        triggerFeedback("delete");
        onKey("⌫");
        return;
      }
      if (lettersLocked) return;
      if (key === " " && length === 0) return;
      triggerFeedback("keyPress");
      onKey(key);
    },
    [canDelete, disabled, length, lettersLocked, onKey],
  );

  const handleDeleteLongPress = useCallback(() => {
    if (!canDelete) return;
    triggerFeedback("delete");
    onKey("⌫");
    stopRapidDelete();
    deleteTimeoutRef.current = setTimeout(() => {
      deleteIntervalRef.current = setInterval(() => {
        onKey("⌫");
        triggerFeedback("delete");
      }, LONG_PRESS_DELETE_INTERVAL_MS);
    }, 0);
  }, [canDelete, onKey, stopRapidDelete]);

  return (
    <View
      style={[styles.wrap, compact && styles.wrapCompact]}
      collapsable={false}
    >
      <View style={[styles.grid, compact && styles.gridCompact]}>
        <View style={[styles.row, compact && styles.rowCompact]}>
          {LETTER_ROW_1.map((letter) => (
            <KeyCell
              key={letter}
              label={letter}
              onPress={() => emitKey(letter)}
              disabled={lettersLocked}
              compact={compact}
              accessibilityLabel={`Letter ${letter}`}
            />
          ))}
        </View>

        <View
          style={[styles.row, styles.rowInset, compact && styles.rowCompact]}
        >
          <RowSpacer flex={0.55} />
          {LETTER_ROW_2.map((letter) => (
            <KeyCell
              key={letter}
              label={letter}
              onPress={() => emitKey(letter)}
              disabled={lettersLocked}
              compact={compact}
              accessibilityLabel={`Letter ${letter}`}
            />
          ))}
          <RowSpacer flex={0.55} />
        </View>

        <View style={[styles.row, compact && styles.rowCompact]}>
          <View
            style={{ flex: 1.35 }}
            pointerEvents="none"
            accessibilityElementsHidden
          />
          {LETTER_ROW_3.map((letter) => (
            <KeyCell
              key={letter}
              label={letter}
              onPress={() => emitKey(letter)}
              disabled={lettersLocked}
              compact={compact}
              accessibilityLabel={`Letter ${letter}`}
            />
          ))}
          <KeyCell
            icon="delete"
            onPress={() => emitKey("⌫")}
            onLongPress={handleDeleteLongPress}
            onPressOut={stopRapidDelete}
            disabled={!canDelete}
            variant="special"
            flex={1.35}
            compact={compact}
            accessibilityLabel="Delete"
          />
        </View>

        {/* Dedicated full-width space bar — do not rely on flex:5 alone (breaks on web). */}
        <View style={[styles.spaceRow, compact && styles.spaceRowCompact]}>
          <Pressable
            onPress={spaceLocked ? undefined : () => emitKey(" ")}
            disabled={spaceLocked}
            hitSlop={8}
            style={({ pressed }) => [
              styles.spaceBar,
              compact && styles.spaceBarCompact,
              spaceLocked && styles.keyInactive,
              pressed && !spaceLocked && styles.keyPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Space"
            accessibilityState={{ disabled: spaceLocked }}
            accessibilityHint={
              length === 0
                ? "Type a letter first"
                : "Insert a space between words"
            }
          >
            <Text
              style={[
                styles.spaceBarLabel,
                compact && styles.spaceBarLabelCompact,
                spaceLocked && styles.keyTextInactive,
              ]}
              allowFontScaling={false}
            >
              space
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    alignSelf: "stretch",
    backgroundColor: APPLE_KEYPAD_BG,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingTop: 12,
    paddingBottom: Platform.OS === "ios" ? 14 : 12,
    ...Platform.select({
      web: { userSelect: "none" as const },
      default: {},
    }),
  },
  wrapCompact: {
    borderRadius: 14,
    paddingHorizontal: 8,
    paddingTop: 10,
    paddingBottom: 10,
  },
  grid: {
    width: "100%",
    gap: 10,
  },
  gridCompact: {
    gap: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "stretch",
    width: "100%",
    gap: 7,
  },
  rowCompact: {
    gap: 6,
  },
  rowInset: {
    paddingHorizontal: 2,
  },
  key: {
    minWidth: 0,
    minHeight: 54,
    borderRadius: 9,
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
    minHeight: 48,
    borderRadius: 8,
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
    opacity: 0.5,
  },
  keyPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.98 }],
  },
  keyText: {
    fontSize: 22,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.15,
    textAlign: "center",
    includeFontPadding: false,
  },
  keyTextCompact: {
    fontSize: 18,
  },
  keyTextUtility: {
    fontSize: 16,
    fontWeight: "600",
    textTransform: "lowercase",
    letterSpacing: 0.5,
  },
  keyTextUtilityCompact: {
    fontSize: 14,
  },
  keyTextSpecial: {
    color: Theme.textPrimaryDark,
  },
  keyTextInactive: {
    color: APPLE_DISABLED_TEXT,
  },
  spaceRow: {
    width: "100%",
    alignSelf: "stretch",
    paddingHorizontal: 2,
    marginTop: 2,
  },
  spaceRowCompact: {
    marginTop: 0,
  },
  spaceBar: {
    width: "100%",
    alignSelf: "stretch",
    minHeight: 52,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: APPLE_SPECIAL_BG,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.18,
        shadowRadius: 0,
      },
      android: { elevation: 2 },
      web: {
        boxShadow: "0 1px 0 rgba(0,0,0,0.28)",
        cursor: "pointer" as const,
      },
      default: {},
    }),
  },
  spaceBarCompact: {
    minHeight: 46,
    borderRadius: 8,
  },
  spaceBarLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.6,
    textTransform: "lowercase",
  },
  spaceBarLabelCompact: {
    fontSize: 14,
  },
});
