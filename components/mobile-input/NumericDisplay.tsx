import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import Theme from '@/constants/Theme';
import { formatDisplayValue } from './keypad';
import type { SmartInputType } from './types';

export type DisplayType = SmartInputType;

interface NumericDisplayProps {
  rawValue: string;
  type?: DisplayType;
  /** Override the default prefix (currency → '₹'). Pass '' to suppress. */
  prefix?: string;
  /** Override the default suffix (percentage → '%'). Pass '' to suppress. */
  suffix?: string;
  placeholder?: string;
  /** Larger centered amount (mobile pay-style sheet). */
  variant?: "default" | "hero";
}

export function NumericDisplay({
  rawValue,
  type = 'currency',
  prefix,
  suffix,
  placeholder = '0',
  variant = 'default',
}: NumericDisplayProps) {
  const isHero = variant === 'hero';
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
    <View style={[styles.root, isHero && styles.rootHero]}>
      <View style={styles.row}>
        {resolvedPrefix ? (
          <Text
            style={[
              styles.prefix,
              isHero && styles.prefixHero,
              isEmpty && styles.dim,
            ]}
            allowFontScaling={false}
          >
            {resolvedPrefix}
          </Text>
        ) : null}

        <Text
          style={[
            styles.amount,
            isHero && styles.amountHero,
            isEmpty && styles.amountPlaceholder,
            isEmpty && isHero && styles.amountPlaceholderHero,
          ]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.4}
          allowFontScaling={false}
        >
          {display}
        </Text>

        {resolvedSuffix ? (
          <Text
            style={[styles.suffix, isHero && styles.suffixHero, isEmpty && styles.dim]}
            allowFontScaling={false}
          >
            {resolvedSuffix}
          </Text>
        ) : null}

        <Animated.View
          style={[
            styles.cursor,
            isHero && styles.cursorHero,
            { opacity: blink },
          ]}
        />
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
  rootHero: {
    flex: 0,
    flexGrow: 0,
    paddingVertical: 16,
    minHeight: 88,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: '100%',
  },
  prefix: {
    fontSize: 22,
    fontWeight: '500',
    color: Theme.textPrimary,
    marginRight: 4,
  },
  prefixHero: {
    fontSize: 36,
    fontWeight: '400',
    letterSpacing: 0,
  },
  amount: {
    fontSize: 44,
    fontWeight: '600',
    color: Theme.textPrimary,
    // @ts-ignore — fontVariant is valid in RN 0.64+
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.5,
    lineHeight: 48,
    flexShrink: 1,
  },
  amountHero: {
    fontSize: 52,
    fontWeight: '600',
    lineHeight: 56,
    letterSpacing: -1,
  },
  amountPlaceholder: {
    color: Theme.textMuted,
    fontWeight: '400',
  },
  amountPlaceholderHero: {
    fontWeight: '500',
  },
  suffix: {
    fontSize: 20,
    fontWeight: '500',
    color: Theme.textSecondary,
    marginLeft: 4,
  },
  suffixHero: {
    fontSize: 28,
  },
  dim: {
    color: Theme.textMuted,
  },
  cursor: {
    width: 2,
    height: 36,
    backgroundColor: Theme.primary,
    borderRadius: 2,
    marginLeft: 3,
  },
  cursorHero: {
    height: 44,
    width: 2.5,
  },
});
