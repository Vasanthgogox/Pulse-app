/**
 * Full-page phone / OTP step — owns viewport below slim shell chrome.
 */
import { memo, useCallback, useEffect, useRef, type ReactNode } from 'react';
import {
  Animated,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { DecimalKeypad } from '@/components/mobile-input/DecimalKeypad';
import { applyKeypadPress, type KeypadKey } from '@/components/mobile-input/keypad';
import { useInputPlatform } from '@/components/mobile-input/useInputPlatform';
import { OperationalButton } from '@/components/operational';
import { colors } from '@/design-system/colors';
import { layout } from '@/design-system/layout';
import { space } from '@/design-system/spacing';
import { OnboardingFullPageFooter } from './OnboardingFullPageFooter';
import { OnboardingFullPageTitle } from './OnboardingFullPageTitle';
import { onboardingLayout } from '../styles/onboardingLayout';

export interface OnboardingKeypadStepProps {
  title: string;
  subtitle?: string;
  value: string;
  onChange: (digits: string) => void;
  maxDigits: number;
  formatDisplay: (digits: string) => string;
  displayPrefix?: string;
  displayFlag?: string;
  emptyPlaceholder?: string;
  onPrimary: () => void;
  primaryDisabled?: boolean;
  primaryLoading?: boolean;
  primaryLabel?: string;
  primaryButtonLabel?: string;
  primaryAccessibilityLabel?: string;
  errorMessage?: string | null;
  hintMessage?: string | null;
  fieldLabel?: string;
  customDisplay?: ReactNode;
  /** Compact row above CTA (e.g. Google / sign-in links) */
  footerAccessory?: ReactNode;
  showDecimal?: boolean;
}

export const OnboardingKeypadStep = memo(function OnboardingKeypadStep({
  title,
  subtitle,
  value,
  onChange,
  maxDigits,
  formatDisplay,
  displayPrefix,
  displayFlag,
  emptyPlaceholder = '0',
  onPrimary,
  primaryDisabled = false,
  primaryLoading = false,
  primaryLabel,
  primaryButtonLabel,
  primaryAccessibilityLabel,
  errorMessage,
  hintMessage,
  fieldLabel = 'MOBILE NUMBER',
  customDisplay,
  footerAccessory,
  showDecimal = false,
}: OnboardingKeypadStepProps) {
  const blink = useRef(new Animated.Value(1)).current;
  const digits = value.replace(/\D/g, '').slice(0, maxDigits);
  const display = digits.length > 0 ? formatDisplay(digits) : emptyPlaceholder;
  const isEmpty = digits.length === 0;
  const canSubmit = digits.length >= maxDigits && !primaryDisabled && !primaryLoading;
  const ctaLabel =
    primaryLabel ?? primaryButtonLabel ?? primaryAccessibilityLabel ?? 'Continue';

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(blink, { toValue: 0, duration: 520, useNativeDriver: true }),
        Animated.timing(blink, { toValue: 1, duration: 520, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [blink]);

  const handleKey = useCallback(
    (key: KeypadKey) => {
      const next = applyKeypadPress(digits, key, {
        maxIntDigits: maxDigits,
        maxDecimalPlaces: 0,
      });
      onChange(next);
    },
    [digits, maxDigits, onChange],
  );

  const inputPlatform = useInputPlatform();
  const isDesktopWeb = Platform.OS === 'web' && inputPlatform === 'desktop';

  // Desktop web: type with the physical keyboard instead of the on-screen keypad.
  useEffect(() => {
    if (!isDesktopWeb) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      let mapped: KeypadKey | null = null;
      if (e.key >= '0' && e.key <= '9') mapped = e.key as KeypadKey;
      else if (showDecimal && (e.key === '.' || e.key === ',')) mapped = '.';
      else if (e.key === 'Backspace' || e.key === 'Delete') mapped = '⌫';
      else if (e.key === 'Enter' && canSubmit) {
        e.preventDefault();
        onPrimary();
        return;
      }
      if (!mapped) return;
      e.preventDefault();
      handleKey(mapped);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isDesktopWeb, showDecimal, handleKey, canSubmit, onPrimary]);

  return (
    <View style={styles.root}>
      <View style={styles.main}>
        <View style={styles.content}>
          <OnboardingFullPageTitle title={title} subtitle={subtitle} />

          <Text style={styles.fieldLabel}>{fieldLabel}</Text>
          {customDisplay ? (
            <View style={styles.customDisplay}>{customDisplay}</View>
          ) : (
            <View style={[styles.displayRow, errorMessage ? styles.displayError : null]}>
              {displayFlag ? <Text style={styles.flag}>{displayFlag}</Text> : null}
              {displayPrefix ? <Text style={styles.prefix}>{displayPrefix}</Text> : null}
              <Text
                style={[styles.displayValue, isEmpty && styles.placeholder]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.65}
              >
                {display}
              </Text>
              <Animated.View style={[styles.cursor, { opacity: blink }]} />
            </View>
          )}

          {errorMessage ? (
            <Text style={styles.error} accessibilityRole="alert">
              {errorMessage}
            </Text>
          ) : hintMessage ? (
            <Text style={styles.hint}>{hintMessage}</Text>
          ) : null}
        </View>

        <OnboardingFullPageFooter accessory={footerAccessory}>
          <OperationalButton
            intent="bottomSticky"
            label={ctaLabel}
            accessibilityLabel={primaryAccessibilityLabel ?? ctaLabel}
            onPress={onPrimary}
            disabled={!canSubmit}
            loading={primaryLoading}
            fullWidth
          />
        </OnboardingFullPageFooter>
      </View>

      {isDesktopWeb ? null : (
        <View style={styles.keypadDock}>
          <DecimalKeypad
            onKey={handleKey}
            showDecimal={showDecimal}
            variant="pay"
            size="compact"
          />
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 0,
  },
  main: {
    flex: 1,
    minHeight: 0,
  },
  content: {
    flex: 1,
    minHeight: 0,
    ...onboardingLayout.contentInner,
    paddingTop: space[2],
    justifyContent: 'flex-start',
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    color: colors.textMuted,
    marginBottom: space[2],
    textTransform: 'uppercase',
  },
  customDisplay: {
    width: '100%',
    marginBottom: space[2],
  },
  displayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    paddingVertical: space[4],
    paddingHorizontal: space[4],
    minHeight: 56,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
  },
  displayError: {
    borderColor: colors.cost,
    backgroundColor: '#fef2f2',
  },
  flag: { fontSize: 22, marginRight: space[2] },
  prefix: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    marginRight: space[2],
  },
  displayValue: {
    flex: 1,
    fontSize: 24,
    fontWeight: '600',
    letterSpacing: 0.8,
    color: colors.textPrimary,
    minWidth: 0,
  },
  placeholder: {
    color: colors.textMuted,
    fontWeight: '500',
  },
  cursor: {
    width: 2,
    height: 24,
    borderRadius: 1,
    backgroundColor: colors.brand,
    marginLeft: space[1],
  },
  error: {
    fontSize: 13,
    color: colors.cost,
    marginTop: space[2],
    lineHeight: 18,
  },
  hint: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: space[2],
    lineHeight: 18,
  },
  keypadDock: {
    flexShrink: 0,
    backgroundColor: '#f1f5f9',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
    paddingTop: space[1],
    paddingHorizontal: layout.screenPaddingX,
    paddingBottom: space[1],
  },
});
