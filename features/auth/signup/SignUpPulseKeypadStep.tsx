import { memo, useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import FontAwesome from '@expo/vector-icons/FontAwesome';

import { DecimalKeypad } from '@/components/mobile-input/DecimalKeypad';
import { applyKeypadPress, type KeypadKey } from '@/components/mobile-input/keypad';
import { effectiveKeyboardInset, useKeyboardVisible } from '@/lib/hooks/useKeyboardVisible';
import { useSignupKeypadInput } from '@/lib/onboarding/useSignupKeypadInput';

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
  const insets = useSafeAreaInsets();
  const useKeypad = useSignupKeypadInput();
  const { keyboardVisible, keyboardHeight } = useKeyboardVisible();
  const inputRef = useRef<TextInput>(null);
  const scrollRef = useRef<ScrollView>(null);
  const blink = useRef(new Animated.Value(1)).current;
  const digits = value.replace(/\D/g, '').slice(0, maxDigits);
  const isEmpty = digits.length === 0;
  const displayText = isEmpty ? emptyPlaceholder : formatDisplay(digits);
  const showCursor = digits.length < maxDigits;
  const ready = digits.length >= maxDigits && !primaryDisabled && !primaryLoading;

  useEffect(() => {
    if (!useKeypad) {
      const id = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
    return undefined;
  }, [useKeypad]);

  useEffect(() => {
    if (useKeypad || !keyboardVisible) return;
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, [keyboardVisible, useKeypad]);

  useEffect(() => {
    if (!useKeypad) return undefined;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(blink, { toValue: 0, duration: 520, useNativeDriver: true }),
        Animated.timing(blink, { toValue: 1, duration: 520, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [blink, useKeypad]);

  const handleDigitsChange = useCallback(
    (text: string) => {
      onChange(text.replace(/\D/g, '').slice(0, maxDigits));
    },
    [maxDigits, onChange],
  );

  const handleSubmitEditing = useCallback(() => {
    if (ready) onPrimary();
  }, [onPrimary, ready]);

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

  const content = (
    <>
      <SignUpPulseTitle title={title} subtitle={subtitle} />

          <Text style={styles.fieldLabel}>{fieldLabel}</Text>
          {useKeypad ? (
            customDisplay ? (
              <View style={styles.customDisplay}>{customDisplay}</View>
            ) : (
              <View style={[styles.displayRow, errorMessage ? styles.displayError : null]}>
                {displayFlag ? <Text style={styles.flag}>{displayFlag}</Text> : null}
                {displayPrefix ? <Text style={styles.prefix}>{displayPrefix}</Text> : null}
                <View style={styles.digitArea}>
                  {showCursor && isEmpty ? (
                    <Animated.View
                      style={[styles.cursor, styles.cursorLeading, { opacity: blink }]}
                    />
                  ) : null}
                  <Text
                    style={[
                      styles.displayValue,
                      isEmpty ? styles.placeholder : styles.displayValueTyped,
                    ]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.65}
                  >
                    {displayText}
                  </Text>
                  {showCursor && !isEmpty ? (
                    <Animated.View style={[styles.cursor, { opacity: blink }]} />
                  ) : null}
                </View>
              </View>
            )
          ) : customDisplay ? (
            <View
              style={[styles.customDisplay, errorMessage ? styles.displayError : null]}
            >
              <View style={styles.otpWebWrap}>
                {customDisplay}
                <TextInput
                  ref={inputRef}
                  value={digits}
                  onChangeText={handleDigitsChange}
                  onSubmitEditing={handleSubmitEditing}
                  returnKeyType="go"
                  keyboardType="number-pad"
                  inputMode="numeric"
                  maxLength={maxDigits}
                  autoComplete="one-time-code"
                  textContentType="oneTimeCode"
                  caretHidden
                  style={styles.otpWebOverlay}
                  accessibilityLabel={fieldLabel}
                />
              </View>
            </View>
          ) : (
            <View style={[styles.displayRow, errorMessage ? styles.displayError : null]}>
              <View style={styles.webInputRow}>
                {displayFlag ? <Text style={styles.flag}>{displayFlag}</Text> : null}
                {displayPrefix ? <Text style={styles.prefix}>{displayPrefix}</Text> : null}
                <TextInput
                  ref={inputRef}
                  value={digits}
                  onChangeText={handleDigitsChange}
                  onSubmitEditing={handleSubmitEditing}
                  returnKeyType="go"
                  keyboardType="number-pad"
                  inputMode="numeric"
                  maxLength={maxDigits}
                  placeholder={emptyPlaceholder}
                  placeholderTextColor={theme.placeholder}
                  autoComplete="tel"
                  textContentType="telephoneNumber"
                  selection={{ start: digits.length, end: digits.length }}
                  style={styles.webInput}
                  accessibilityLabel={fieldLabel}
                />
              </View>
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
    </>
  );

  const webKeyboardPad = !useKeypad
    ? effectiveKeyboardInset(keyboardVisible, keyboardHeight, 280)
    : 0;

  const contentScrollInner = [
    styles.contentScrollInner,
    { paddingBottom: 24 + webKeyboardPad },
  ];

  return (
    <View style={[styles.root, !useKeypad && styles.rootWeb]}>
      <View style={[styles.main, !useKeypad && styles.mainWeb]}>
        {useKeypad ? (
          <ScrollView
            style={styles.contentScroll}
            contentContainerStyle={styles.contentScrollInnerKeypad}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {content}
          </ScrollView>
        ) : (
          <ScrollView
            ref={scrollRef}
            style={styles.contentScroll}
            contentContainerStyle={contentScrollInner}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {content}
          </ScrollView>
        )}
      </View>

      {useKeypad ? (
        <View
          style={[
            styles.keypadDock,
            { paddingBottom: Math.max(insets.bottom, Platform.OS === 'web' ? 6 : 8) },
          ]}
        >
          <DecimalKeypad onKey={handleKey} showDecimal={false} variant="pay" size="compact" />
        </View>
      ) : null}
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
    rootWeb: {
      flex: 1,
      minHeight: 0,
    },
    mainWeb: {
      flex: 1,
      minHeight: 0,
    },
    content: {
      flex: 1,
      paddingHorizontal: 24,
      paddingTop: 8,
    },
    contentScroll: {
      flex: 1,
    },
    contentScrollInner: {
      paddingHorizontal: 24,
      paddingTop: 8,
    },
    contentScrollInnerKeypad: {
      paddingHorizontal: 24,
      paddingTop: 8,
      paddingBottom: 8,
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
    digitArea: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      minWidth: 0,
    },
    displayValue: {
      fontSize: 18,
      fontWeight: '700',
      letterSpacing: 2.4,
      color: theme.text,
      minWidth: 0,
    },
    displayValueTyped: {
      flexShrink: 1,
    },
    placeholder: {
      flex: 1,
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
      flexShrink: 0,
    },
    cursorLeading: {
      marginLeft: 0,
      marginRight: 4,
    },
    webInputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
      minWidth: 0,
    },
    webInput: {
      flex: 1,
      fontSize: 18,
      fontWeight: '700',
      letterSpacing: 2.4,
      color: theme.text,
      minWidth: 0,
      paddingVertical: 0,
      ...Platform.select({
        web: { outlineStyle: 'none' } as object,
      }),
    },
    otpWebWrap: {
      position: 'relative',
      width: '100%',
    },
    otpWebOverlay: {
      // Invisible OTP capture field: holds focus for the physical keyboard while
      // the visible boxes show the digits. Fully transparent so its own value
      // never paints over the boxes (opacity:0 inputs stay focusable on web).
      ...StyleSheet.absoluteFillObject,
      opacity: 0,
      fontSize: 1,
      color: 'transparent',
      ...Platform.select({
        web: {
          caretColor: 'transparent',
          WebkitTextFillColor: 'transparent',
        } as object,
        default: {},
      }),
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
      paddingTop: Platform.OS === 'web' ? 8 : 24,
      paddingHorizontal: 24,
    },
  });
}
