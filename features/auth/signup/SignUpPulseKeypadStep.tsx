import { memo, useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';

import { DecimalKeypad } from '@/components/mobile-input/DecimalKeypad';
import { applyKeypadPress, type KeypadKey } from '@/components/mobile-input/keypad';

import { SignUpPulsePrimaryButton } from './SignUpPulsePrimaryButton';
import { SignUpPulseTitle } from './SignUpPulseTitle';
import { PULSE_SIGNUP, PULSE_SIGNUP_RADIUS, type SignUpTheme } from './signUpPulseTheme';

export interface SignUpPulseKeypadStepProps {
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
  errorMessage?: string | null;
  hintMessage?: string | null;
  fieldLabel?: string;
  customDisplay?: ReactNode;
  footerAccessory?: ReactNode;
  showGoogle?: boolean;
  onGoogle?: () => void;
  googleLoading?: boolean;
  googleDisabled?: boolean;
  theme?: SignUpTheme;
}

export const SignUpPulseKeypadStep = memo(function SignUpPulseKeypadStep({
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
  primaryLabel = 'Continue',
  errorMessage,
  hintMessage,
  fieldLabel = 'Mobile Number',
  customDisplay,
  footerAccessory,
  showGoogle = false,
  onGoogle,
  googleLoading = false,
  googleDisabled = false,
  theme = PULSE_SIGNUP,
}: SignUpPulseKeypadStepProps) {
  const styles = useMemo(() => createStyles(theme), [theme]);
  const blink = useRef(new Animated.Value(1)).current;
  const digits = value.replace(/\D/g, '').slice(0, maxDigits);
  const display = digits.length > 0 ? formatDisplay(digits) : emptyPlaceholder;
  const isEmpty = digits.length === 0;
  const ready = digits.length >= maxDigits && !primaryDisabled && !primaryLoading;

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

  return (
    <View style={styles.root}>
      <View style={styles.main}>
        <View style={styles.content}>
          <SignUpPulseTitle title={title} subtitle={subtitle} />

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
              {digits.length < maxDigits ? (
                <Animated.View style={[styles.cursor, { opacity: blink }]} />
              ) : null}
            </View>
          )}

          {errorMessage ? (
            <Text style={styles.error} accessibilityRole="alert">
              {errorMessage}
            </Text>
          ) : hintMessage ? (
            <Text style={styles.hint}>{hintMessage}</Text>
          ) : null}

          <SignUpPulsePrimaryButton
            label={primaryLabel}
            onPress={onPrimary}
            disabled={!ready}
            loading={primaryLoading}
            variant={ready ? 'ready' : 'solid'}
            style={styles.primaryBtn}
            theme={theme}
          />

          {showGoogle ? (
            <>
              <View style={styles.orRow}>
                <View style={styles.orLine} />
                <Text style={styles.orText}>or</Text>
                <View style={styles.orLine} />
              </View>
              <Pressable
                onPress={onGoogle}
                disabled={googleDisabled || googleLoading}
                style={({ pressed }) => [
                  styles.googleBtn,
                  (googleDisabled || googleLoading) && styles.googleBtnDisabled,
                  pressed && styles.googleBtnPressed,
                ]}
              >
                <FontAwesome name="google" size={18} color="#4285F4" />
                <Text style={styles.googleText}>Continue with Google</Text>
              </Pressable>
            </>
          ) : null}

          {footerAccessory}
        </View>
      </View>

      <View style={styles.keypadDock}>
        <DecimalKeypad onKey={handleKey} showDecimal={false} variant="pay" size="compact" />
      </View>
    </View>
  );
});

function createStyles(theme: SignUpTheme) {
  return StyleSheet.create({
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
      paddingHorizontal: 24,
      paddingTop: 8,
    },
    fieldLabel: {
      fontSize: 10,
      fontWeight: '900',
      letterSpacing: 1,
      color: theme.muted,
      marginBottom: 8,
      paddingLeft: 4,
      textTransform: 'uppercase',
    },
    customDisplay: {
      width: '100%',
      marginBottom: 16,
    },
    displayRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 16,
      minHeight: 56,
      backgroundColor: theme.bg,
      borderRadius: PULSE_SIGNUP_RADIUS.input,
      borderWidth: 1,
      borderColor: theme.border,
      marginBottom: 24,
    },
    displayError: {
      borderColor: '#ef4444',
      backgroundColor: '#fef2f2',
    },
    flag: {
      fontSize: 18,
      marginRight: 8,
    },
    prefix: {
      fontSize: 16,
      fontWeight: '900',
      color: theme.text,
      marginRight: 8,
    },
    displayValue: {
      flex: 1,
      fontSize: 18,
      fontWeight: '700',
      letterSpacing: 2.4,
      color: theme.text,
      minWidth: 0,
    },
    placeholder: {
      color: theme.placeholder,
      fontWeight: '500',
      letterSpacing: 2,
    },
    cursor: {
      width: 2,
      height: 20,
      borderRadius: 1,
      backgroundColor: theme.primary,
      marginLeft: 4,
    },
    error: {
      fontSize: 12,
      color: '#ef4444',
      marginTop: -16,
      marginBottom: 16,
      fontWeight: '600',
    },
    hint: {
      fontSize: 12,
      color: theme.muted,
      marginTop: -16,
      marginBottom: 16,
      fontWeight: '600',
    },
    primaryBtn: {
      marginBottom: 8,
    },
    orRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginVertical: 16,
      gap: 12,
    },
    orLine: {
      flex: 1,
      height: StyleSheet.hairlineWidth,
      backgroundColor: theme.border,
    },
    orText: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.muted,
    },
    googleBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      paddingVertical: 16,
      borderRadius: PULSE_SIGNUP_RADIUS.button,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.bg,
      marginBottom: 8,
    },
    googleBtnDisabled: {
      opacity: 0.5,
    },
    googleBtnPressed: {
      backgroundColor: theme.surface,
    },
    googleText: {
      fontSize: 13,
      fontWeight: '900',
      color: '#374151',
    },
    keypadDock: {
      flexShrink: 0,
      backgroundColor: theme.keypadTray,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.border,
      borderTopLeftRadius: PULSE_SIGNUP_RADIUS.keypadTray,
      borderTopRightRadius: PULSE_SIGNUP_RADIUS.keypadTray,
      paddingTop: 24,
      paddingHorizontal: 24,
      paddingBottom: 8,
    },
  });
}
