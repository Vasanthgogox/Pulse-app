import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import Theme from '@/constants/Theme';
import { formatDisplayValue } from './keypad';

export type DisplayType = 'currency' | 'numeric' | 'percentage';

interface NumericDisplayProps {
  rawValue: string;
  type?: DisplayType;
  /** Override the default prefix (currency → '₹'). Pass '' to suppress. */
  prefix?: string;
  /** Override the default suffix (percentage → '%'). Pass '' to suppress. */
  suffix?: string;
  placeholder?: string;
}

export function NumericDisplay({
  rawValue,
  type = 'currency',
  prefix,
  suffix,
  placeholder = '0',
}: NumericDisplayProps) {
  const blink = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(blink, { toValue: 0, duration: 530, useNativeDriver: true }),
        Animated.timing(blink, { toValue: 1, duration: 530, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [blink]);

  const resolvedPrefix = prefix !== undefined ? prefix : type === 'currency' ? '₹' : '';
  const resolvedSuffix = suffix !== undefined ? suffix : type === 'percentage' ? '%' : '';
  const isEmpty = !rawValue;
  const display = isEmpty ? placeholder : formatDisplayValue(rawValue, type);

  return (
    <View style={styles.root}>
      <View style={styles.row}>
        {resolvedPrefix ? (
          <Text style={[styles.prefix, isEmpty && styles.dim]} allowFontScaling={false}>
            {resolvedPrefix}
          </Text>
        ) : null}

        <Text
          style={[styles.amount, isEmpty && styles.amountPlaceholder]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.45}
          allowFontScaling={false}
        >
          {display}
        </Text>

        {resolvedSuffix ? (
          <Text style={[styles.suffix, isEmpty && styles.dim]} allowFontScaling={false}>
            {resolvedSuffix}
          </Text>
        ) : null}

        <Animated.View style={[styles.cursor, { opacity: blink }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    maxWidth: '100%',
  },
  prefix: {
    fontSize: 28,
    fontWeight: '400',
    color: Theme.textPrimary,
    marginBottom: 10,
    marginRight: 4,
  },
  amount: {
    fontSize: 64,
    fontWeight: '600',
    color: Theme.textPrimary,
    // @ts-ignore — fontVariant is valid in RN 0.64+
    fontVariant: ['tabular-nums'],
    letterSpacing: -1.5,
    flexShrink: 1,
  },
  amountPlaceholder: {
    color: Theme.textMuted,
    fontWeight: '300',
  },
  suffix: {
    fontSize: 26,
    fontWeight: '400',
    color: Theme.textSecondary,
    marginBottom: 10,
    marginLeft: 4,
  },
  dim: {
    color: Theme.textMuted,
  },
  cursor: {
    width: 3,
    height: 52,
    backgroundColor: Theme.primary,
    borderRadius: 2,
    marginLeft: 3,
    marginBottom: 4,
  },
});
