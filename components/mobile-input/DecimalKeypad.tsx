import React, { memo, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import { Delete } from 'lucide-react-native';
import Theme from '@/constants/Theme';
import { triggerFeedback } from './feedback';
import type { KeypadKey } from './keypad';

const ROWS: KeypadKey[][] = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['.', '0', '⌫'],
];

const PHONE_ROWS: KeypadKey[][] = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
];

/** iOS Phone / Calculator keypad chrome */
const APPLE_KEYPAD_BG = '#D1D5DB';
const APPLE_KEY_BG = '#FFFFFF';

const LONG_PRESS_DELETE_INTERVAL_MS = 60;
const LONG_PRESS_DELETE_DELAY_MS = 400;

const KEY_H = 64;
const KEY_H_PAY = 56;
/** Dense wizard / signup pad — leaves room for Continue above the keys. */
const KEY_H_PAY_COMPACT = 40;

interface DecimalKeypadProps {
  onKey: (key: KeypadKey) => void;
  showDecimal?: boolean;
  variant?: 'default' | 'pay' | 'apple';
  size?: 'default' | 'compact';
  /** Phone dial: bottom row is blank · 0 · delete (no decimal column). */
  layout?: 'decimal' | 'phone';
}

export const DecimalKeypad = memo(function DecimalKeypad({
  onKey,
  showDecimal = true,
  variant = 'default',
  size = 'default',
  layout = 'decimal',
}: DecimalKeypadProps) {
  const isApple = variant === 'apple';
  const isPay = variant === 'pay';
  const isCompact = size === 'compact' && !isApple;
  const isPhoneLayout = layout === 'phone' || isApple;
  const keyHeight = isApple
    ? 52
    : isPay
      ? isCompact
        ? KEY_H_PAY_COMPACT
        : KEY_H_PAY
      : KEY_H;
  const keyTextSize = isApple ? 28 : isCompact ? 22 : 26;
  const deleteIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const deleteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopRapidDelete = useCallback(() => {
    if (deleteIntervalRef.current !== null) {
      clearInterval(deleteIntervalRef.current);
      deleteIntervalRef.current = null;
    }
    if (deleteTimeoutRef.current !== null) {
      clearTimeout(deleteTimeoutRef.current);
      deleteTimeoutRef.current = null;
    }
  }, []);

  const handleDeleteLongPress = useCallback(() => {
    triggerFeedback('delete');
    deleteTimeoutRef.current = setTimeout(() => {
      deleteIntervalRef.current = setInterval(() => {
        onKey('⌫');
        triggerFeedback('delete');
      }, LONG_PRESS_DELETE_INTERVAL_MS);
    }, LONG_PRESS_DELETE_DELAY_MS);
  }, [onKey]);

  const handleKey = useCallback(
    (key: KeypadKey) => {
      triggerFeedback(key === '⌫' ? 'delete' : 'keyPress');
      onKey(key);
    },
    [onKey],
  );

  const keyBase = (isSpecial: boolean) => [
    styles.key,
    { height: keyHeight, minHeight: Math.min(44, keyHeight) },
    isApple && styles.keyApple,
    isPay && styles.keyPay,
    isPay && isCompact && styles.keyPayCompact,
    isPay && isSpecial && styles.keyPaySpecial,
    !isPay && !isApple && isSpecial && styles.keySpecial,
  ];

  const rowGapStyle = [
    styles.row,
    isApple && styles.rowApple,
    isPay && styles.rowPay,
    isCompact && !isApple && !isPay && styles.rowCompact,
  ];

  const renderDigitKey = (key: KeypadKey, isSpecial: boolean) => {
    const isBackspace = key === '⌫';
    if (isBackspace) {
      return (
        <TouchableOpacity
          key={key}
          style={keyBase(true)}
          onPress={() => handleKey('⌫')}
          onLongPress={handleDeleteLongPress}
          onPressOut={stopRapidDelete}
          delayLongPress={LONG_PRESS_DELETE_DELAY_MS}
          activeOpacity={isApple ? 0.45 : 0.55}
          accessibilityRole="button"
          accessibilityLabel="Delete last digit"
          accessibilityHint="Hold to delete multiple digits"
        >
          {isApple ? (
            <Delete size={24} color={Theme.textPrimaryDark} strokeWidth={2} />
          ) : (
            <Text
              style={[
                styles.keyText,
                styles.keyTextBackspace,
                { fontSize: isCompact ? 18 : 20 },
              ]}
            >
              ⌫
            </Text>
          )}
        </TouchableOpacity>
      );
    }

    return (
      <TouchableOpacity
        key={key}
        style={keyBase(isSpecial)}
        onPress={() => handleKey(key)}
        activeOpacity={isApple ? 0.45 : 0.55}
        accessibilityRole="button"
        accessibilityLabel={`Key ${key}`}
      >
        <Text
          style={[
            styles.keyText,
            isApple && styles.keyTextApple,
            !isApple && isSpecial && styles.keyTextSpecial,
            { fontSize: isSpecial && !isApple ? keyTextSize - 4 : keyTextSize },
          ]}
        >
          {key}
        </Text>
      </TouchableOpacity>
    );
  };

  const rows = isPhoneLayout ? PHONE_ROWS : ROWS.slice(0, 3);

  return (
    <View
      style={[
        styles.grid,
        isApple && styles.gridApple,
        isPay && !isApple && styles.gridPay,
        isPay && isCompact && styles.gridPayCompact,
      ]}
    >
      {rows.map((row, rowIdx) => (
        <View key={rowIdx} style={rowGapStyle}>
          {row.map((key) => renderDigitKey(key, false))}
        </View>
      ))}

      {isPhoneLayout ? (
        <View style={rowGapStyle}>
          <View
            style={[keyBase(true), styles.keyAppleSpacer, { height: keyHeight }]}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />
          {renderDigitKey('0', false)}
          {renderDigitKey('⌫', true)}
        </View>
      ) : (
        <View style={rowGapStyle}>
          {ROWS[3]!.map((key) => {
            if (key === '.' && !showDecimal) {
              return (
                <View
                  key="dot-disabled"
                  style={[keyBase(true), styles.keyDisabled, { height: keyHeight }]}
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                />
              );
            }
            const isSpecial = key === '.' || key === '⌫';
            return renderDigitKey(key, isSpecial);
          })}
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  grid: {
    width: '100%',
    paddingHorizontal: 10,
    gap: 4,
  },
  gridApple: {
    width: '100%',
    paddingHorizontal: 6,
    paddingTop: 8,
    paddingBottom: 6,
    gap: 7,
    backgroundColor: APPLE_KEYPAD_BG,
  },
  gridPay: {
    backgroundColor: Theme.surfaceGray,
    paddingTop: 0,
    paddingBottom: 0,
    paddingHorizontal: 0,
    gap: 10,
    borderTopWidth: 0,
    width: '100%',
    alignSelf: 'stretch',
  },
  gridPayCompact: {
    paddingTop: 0,
    paddingBottom: 0,
    gap: 8,
    backgroundColor: 'transparent',
    borderTopWidth: 0,
  },
  row: {
    flexDirection: 'row',
    gap: 4,
    width: '100%',
    alignItems: 'stretch',
  },
  rowApple: {
    gap: 7,
  },
  rowPay: {
    gap: 10,
  },
  rowCompact: {
    gap: 8,
  },
  key: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Theme.surface,
    borderRadius: 12,
    minWidth: 0,
  },
  keyApple: {
    backgroundColor: APPLE_KEY_BG,
    borderRadius: 13,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.22,
        shadowRadius: 0,
      },
      android: { elevation: 2 },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.12,
        shadowRadius: 2,
      },
    }),
  },
  keyAppleSpacer: {
    backgroundColor: 'transparent',
    shadowOpacity: 0,
    elevation: 0,
  },
  keyPay: {
    flex: 1,
    minWidth: 0,
    backgroundColor: Theme.cardWhite,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  keyPayCompact: {
    borderRadius: 12,
  },
  keyPaySpecial: {
    backgroundColor: Theme.cardWhite,
  },
  keySpecial: {
    backgroundColor: Theme.surfaceGray,
  },
  keyDisabled: {
    backgroundColor: 'transparent',
    opacity: 0,
  },
  keyTextDisabled: {
    color: Theme.textMuted,
    fontWeight: '400',
  },
  keyText: {
    fontWeight: '500',
    color: Theme.textPrimary,
    textAlign: 'center',
    ...Platform.select({
      android: { includeFontPadding: false, textAlignVertical: 'center' },
      default: {},
    }),
  },
  keyTextApple: {
    fontWeight: '400',
    color: Theme.textPrimaryDark,
    letterSpacing: 0.5,
    ...Platform.select({
      ios: { fontVariant: ['tabular-nums'] },
      default: {},
    }),
  },
  keyTextSpecial: {
    color: Theme.textBody,
  },
  keyTextBackspace: {
    color: Theme.textSecondary,
  },
});
