import React, { memo, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import Theme from '@/constants/Theme';
import { triggerFeedback } from './feedback';
import type { KeypadKey } from './keypad';

const ROWS: KeypadKey[][] = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['.', '0', '⌫'],
];

const LONG_PRESS_DELETE_INTERVAL_MS = 60;
const LONG_PRESS_DELETE_DELAY_MS = 400;

const KEY_H = 64;
const KEY_H_PAY = 56;
const KEY_H_PAY_COMPACT = 46;

interface DecimalKeypadProps {
  onKey: (key: KeypadKey) => void;
  showDecimal?: boolean;
  variant?: 'default' | 'pay';
  size?: 'default' | 'compact';
}

export const DecimalKeypad = memo(function DecimalKeypad({
  onKey,
  showDecimal = true,
  variant = 'default',
  size = 'default',
}: DecimalKeypadProps) {
  const isPay = variant === 'pay';
  const isCompact = size === 'compact';
  const keyHeight = isPay ? (isCompact ? KEY_H_PAY_COMPACT : KEY_H_PAY) : KEY_H;
  const keyTextSize = isCompact ? 22 : 26;
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
    isPay && styles.keyPay,
    isPay && isCompact && styles.keyPayCompact,
    isPay && isSpecial && styles.keyPaySpecial,
    !isPay && isSpecial && styles.keySpecial,
  ];

  return (
    <View
      style={[
        styles.grid,
        isPay && styles.gridPay,
        isPay && isCompact && styles.gridPayCompact,
      ]}
    >
      {ROWS.map((row, rowIdx) => (
        <View key={rowIdx} style={[styles.row, isCompact && styles.rowCompact]}>
          {row.map((key) => {
            if (key === '.' && !showDecimal) {
              return (
                <View
                  key="dot-disabled"
                  style={[keyBase(true), styles.keyDisabled, { height: keyHeight }]}
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                >
                  <Text style={[styles.keyText, styles.keyTextDisabled]}>.</Text>
                </View>
              );
            }

            const isBackspace = key === '⌫';
            const isSpecial = key === '.' || isBackspace;

            if (isBackspace) {
              return (
                <TouchableOpacity
                  key={key}
                  style={keyBase(true)}
                  onPress={() => handleKey('⌫')}
                  onLongPress={handleDeleteLongPress}
                  onPressOut={stopRapidDelete}
                  delayLongPress={LONG_PRESS_DELETE_DELAY_MS}
                  activeOpacity={0.55}
                  accessibilityRole="button"
                  accessibilityLabel="Delete last digit"
                  accessibilityHint="Hold to delete multiple digits"
                >
                  <Text
                    style={[
                      styles.keyText,
                      styles.keyTextBackspace,
                      { fontSize: isCompact ? 18 : 20 },
                    ]}
                  >
                    ⌫
                  </Text>
                </TouchableOpacity>
              );
            }

            return (
              <TouchableOpacity
                key={key}
                style={keyBase(isSpecial)}
                onPress={() => handleKey(key)}
                activeOpacity={0.55}
                accessibilityRole="button"
                accessibilityLabel={`Key ${key}`}
              >
                <Text
                  style={[
                    styles.keyText,
                    isSpecial && styles.keyTextSpecial,
                    { fontSize: isSpecial ? keyTextSize - 4 : keyTextSize },
                  ]}
                >
                  {key}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  grid: {
    width: '100%',
    paddingHorizontal: 10,
    gap: 4,
  },
  gridPay: {
    backgroundColor: Theme.surfaceGray,
    paddingTop: 8,
    paddingBottom: 6,
    paddingHorizontal: 8,
    gap: 5,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.border,
  },
  gridPayCompact: {
    paddingTop: 4,
    paddingBottom: 4,
    gap: 4,
    backgroundColor: 'transparent',
    borderTopWidth: 0,
  },
  row: {
    flexDirection: 'row',
    gap: 4,
  },
  rowCompact: {
    gap: 3,
  },
  key: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Theme.surface,
    borderRadius: 12,
    minWidth: 40,
  },
  keyPay: {
    backgroundColor: Theme.cardWhite,
    borderRadius: 10,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  keyPayCompact: {
    borderRadius: 8,
  },
  keyPaySpecial: {
    backgroundColor: Theme.cardWhite,
  },
  keySpecial: {
    backgroundColor: Theme.surfaceGray,
  },
  keyDisabled: {
    backgroundColor: Theme.surfaceGray,
    opacity: 0.45,
  },
  keyTextDisabled: {
    color: Theme.textMuted,
    fontWeight: '400',
  },
  keyText: {
    fontWeight: '500',
    color: Theme.textPrimary,
  },
  keyTextSpecial: {
    color: Theme.textBody,
  },
  keyTextBackspace: {
    color: Theme.textSecondary,
  },
});
