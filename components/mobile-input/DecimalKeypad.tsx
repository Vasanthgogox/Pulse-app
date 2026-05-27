import React, { memo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import Theme from '@/constants/Theme';
import type { KeypadKey } from './keypad';

const ROWS: KeypadKey[][] = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['.', '0', '⌫'],
];

interface DecimalKeypadProps {
  onKey: (key: KeypadKey) => void;
  showDecimal?: boolean;
}

export const DecimalKeypad = memo(function DecimalKeypad({
  onKey,
  showDecimal = true,
}: DecimalKeypadProps) {
  return (
    <View style={styles.grid}>
      {ROWS.map((row, rowIdx) => (
        <View key={rowIdx} style={styles.row}>
          {row.map((key) => {
            if (key === '.' && !showDecimal) {
              return <View key="dot-spacer" style={styles.keySpacer} />;
            }
            const isBackspace = key === '⌫';
            const isSpecial = key === '.' || isBackspace;
            return (
              <TouchableOpacity
                key={key}
                style={[styles.key, isSpecial && styles.keySpecial]}
                onPress={() => onKey(key)}
                activeOpacity={0.55}
                accessibilityRole="button"
                accessibilityLabel={isBackspace ? 'Delete last digit' : `Key ${key}`}
              >
                <Text
                  style={[
                    styles.keyText,
                    isSpecial && styles.keyTextSpecial,
                    isBackspace && styles.keyTextBackspace,
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

const KEY_H = 64;

const styles = StyleSheet.create({
  grid: {
    width: '100%',
    paddingHorizontal: 12,
    gap: 4,
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
  },
  keySpecial: {
    backgroundColor: Theme.surfaceGray,
  },
  keySpacer: {
    flex: 1,
    height: KEY_H,
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
  },
});
