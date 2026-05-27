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

/** How fast successive deletes fire during long-press (ms between each). */
const LONG_PRESS_DELETE_INTERVAL_MS = 60;
/** Initial delay before rapid-delete kicks in (ms). */
const LONG_PRESS_DELETE_DELAY_MS = 400;

interface DecimalKeypadProps {
  onKey: (key: KeypadKey) => void;
  showDecimal?: boolean;
  /** Light tray + white keys (GPay-style). */
  variant?: 'default' | 'pay';
}

export const DecimalKeypad = memo(function DecimalKeypad({
  onKey,
  showDecimal = true,
  variant = 'default',
}: DecimalKeypadProps) {
  const isPay = variant === 'pay';
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
    // After initial delay, fire deletes rapidly
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

  return (
    <View style={[styles.grid, isPay && styles.gridPay]}>
      {ROWS.map((row, rowIdx) => (
        <View key={rowIdx} style={styles.row}>
          {row.map((key) => {
            if (key === '.' && !showDecimal) {
              return (
                <View
                  key="dot-spacer"
                  style={[styles.keySpacer, isPay && styles.keySpacerPay]}
                />
              );
            }

            const isBackspace = key === '⌫';
            const isSpecial = key === '.' || isBackspace;

            if (isBackspace) {
              return (
                <TouchableOpacity
                  key={key}
                  style={[
                    styles.key,
                    isPay && styles.keyPay,
                    isPay && styles.keyPaySpecial,
                    !isPay && styles.keySpecial,
                  ]}
                  onPress={() => handleKey('⌫')}
                  onLongPress={handleDeleteLongPress}
                  onPressOut={stopRapidDelete}
                  delayLongPress={LONG_PRESS_DELETE_DELAY_MS}
                  activeOpacity={0.55}
                  accessibilityRole="button"
                  accessibilityLabel="Delete last digit"
                  accessibilityHint="Hold to delete multiple digits"
                >
                  <Text style={[styles.keyText, styles.keyTextBackspace]}>⌫</Text>
                </TouchableOpacity>
              );
            }

            return (
              <TouchableOpacity
                key={key}
                style={[
                  styles.key,
                  isPay && styles.keyPay,
                  isPay && isSpecial && styles.keyPaySpecial,
                  !isPay && isSpecial && styles.keySpecial,
                ]}
                onPress={() => handleKey(key)}
                activeOpacity={0.55}
                accessibilityRole="button"
                accessibilityLabel={`Key ${key}`}
              >
                <Text style={[styles.keyText, isSpecial && styles.keyTextSpecial]}>
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

const KEY_H = 64;
const KEY_H_PAY = 56;

const styles = StyleSheet.create({
  grid: {
    width: '100%',
    paddingHorizontal: 12,
    gap: 4,
  },
  gridPay: {
    backgroundColor: Theme.surfaceGray,
    paddingTop: 10,
    paddingBottom: 8,
    paddingHorizontal: 10,
    gap: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.border,
  },
  row: {
    flexDirection: 'row',
    gap: 4,
  },
  key: {
    flex: 1,
    height: KEY_H,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Theme.surface,
    borderRadius: 14,
    minWidth: 44,
    minHeight: 44,
  },
  keyPay: {
    height: KEY_H_PAY,
    backgroundColor: Theme.cardWhite,
    borderRadius: 12,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  keyPaySpecial: {
    backgroundColor: Theme.cardWhite,
  },
  keySpecial: {
    backgroundColor: Theme.surfaceGray,
  },
  keySpacer: {
    flex: 1,
    height: KEY_H,
  },
  keySpacerPay: {
    height: KEY_H_PAY,
  },
  keyText: {
    fontSize: 26,
    fontWeight: '500',
    color: Theme.textPrimary,
    lineHeight: 30,
  },
  keyTextSpecial: {
    fontSize: 22,
    color: Theme.textBody,
  },
  keyTextBackspace: {
    fontSize: 20,
    color: Theme.textSecondary,
  },
});
