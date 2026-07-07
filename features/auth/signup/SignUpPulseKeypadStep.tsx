import { memo, useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GoogleBrandIcon } from '@/features/auth/components/GoogleBrandIcon';

import { DecimalKeypad } from '@/components/mobile-input/DecimalKeypad';
import { applyKeypadPress, type KeypadKey } from '@/components/mobile-input/keypad';
import { effectiveKeyboardInset, useKeyboardVisible } from '@/lib/hooks/useKeyboardVisible';
import { useSignupKeypadInput } from '@/lib/onboarding/useSignupKeypadInput';

import { SignUpPulsePrimaryButton } from './SignUpPulsePrimaryButton';
import { SignUpPulseTitle } from './SignUpPulseTitle';
import { DESKTOP_BREAKPOINT, DESKTOP_SIGNUP_FORM_WIDTH } from './signUpConstants';
import { PULSE_SIGNUP, PULSE_SIGNUP_RADIUS, type SignUpTheme } from './signUpPulseTheme';
import { createPulseSignUpTextStyles, SIGNUP_ERROR_COLOR } from './signUpTypography';

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
  const { width } = useWindowDimensions();
  const isDesktop = width >= DESKTOP_BREAKPOINT;
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

  const phoneLead =
    displayFlag || displayPrefix ? (
      <>
        <View style={styles.phoneLead}>
          {displayFlag ? (
            <View style={styles.flagWrap}>
              <Text style={styles.flag}>{displayFlag}</Text>
            </View>
          ) : null}
          {displayPrefix ? <Text style={styles.prefix}>{displayPrefix}</Text> : null}
        </View>
        <View style={styles.phoneSep} />
      </>
    ) : null;

  const fieldInput = useKeypad ? (
    customDisplay ? (
      <View style={styles.customDisplay}>{customDisplay}</View>
    ) : (
      <View style={[styles.displayRow, errorMessage ? styles.displayError : null]}>
        {phoneLead}
        <View style={styles.digitArea}>
          {showCursor && isEmpty ? (
            <Animated.View style={[styles.cursor, styles.cursorLeading, { opacity: blink }]} />
          ) : null}
          <Text
            style={[
              styles.displayValue,
              isEmpty ? styles.placeholder : styles.displayValueTyped,
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
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
    <View style={[styles.customDisplay, errorMessage ? styles.displayError : null]}>
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
      {phoneLead}
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
  );

  const actionBlock = (
    <>
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
            <GoogleBrandIcon size={18} />
            <Text style={styles.googleText}>Continue with Google</Text>
          </Pressable>
        </>
      ) : null}
    </>
  );

  const formBody = (
    <>
      <SignUpPulseTitle title={title} subtitle={subtitle} compact={useKeypad} />
      <Text style={styles.fieldLabel}>{fieldLabel}</Text>
      {fieldInput}
      {errorMessage ? (
        <Text style={styles.error} accessibilityRole="alert">
          {errorMessage}
        </Text>
      ) : hintMessage ? (
        <Text style={styles.hint}>{hintMessage}</Text>
      ) : null}
      {actionBlock}
    </>
  );

  const webKeyboardPad = !useKeypad
    ? effectiveKeyboardInset(keyboardVisible, keyboardHeight, 280)
    : 0;

  const contentScrollInner = [
    styles.contentScrollInner,
    isDesktop && styles.contentScrollInnerDesktop,
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
            bounces={false}
          >
            {formBody}
          </ScrollView>
        ) : (
          <ScrollView
            ref={scrollRef}
            style={styles.contentScroll}
            contentContainerStyle={contentScrollInner}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {formBody}
            {footerAccessory}
          </ScrollView>
        )}
      </View>

      {useKeypad && footerAccessory ? (
        <View style={styles.accessoryDock}>{footerAccessory}</View>
      ) : null}

      {useKeypad ? (
        <View
          style={[
            styles.keypadDock,
            { paddingBottom: Math.max(insets.bottom, Platform.OS === 'web' ? 6 : 10) },
          ]}
        >
          <DecimalKeypad
            onKey={handleKey}
            showDecimal={false}
            variant="pay"
            size="compact"
            layout="phone"
          />
        </View>
      ) : null}
    </View>
  );
});

function createStyles(theme: SignUpTheme) {
  const text = createPulseSignUpTextStyles(theme);

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
      paddingHorizontal: 20,
      paddingTop: 4,
      paddingBottom: 4,
      flexGrow: 1,
    },
    contentScrollInnerDesktop: {
      paddingHorizontal: 36,
      paddingTop: 10,
      maxWidth: DESKTOP_SIGNUP_FORM_WIDTH,
      alignSelf: 'center',
      width: '100%',
    },
    fieldLabel: {
      ...text.fieldLabel,
      marginBottom: 8,
    },
    customDisplay: {
      width: '100%',
      marginBottom: 12,
    },
    displayRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      minHeight: 56,
      backgroundColor: theme.bg,
      borderRadius: PULSE_SIGNUP_RADIUS.input,
      borderWidth: 1,
      borderColor: theme.border,
      marginBottom: 16,
    },
    displayError: {
      borderColor: SIGNUP_ERROR_COLOR,
      backgroundColor: '#fef2f2',
    },
    phoneLead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flexShrink: 0,
    },
    flagWrap: {
      width: 24,
      height: 24,
      alignItems: 'center',
      justifyContent: 'center',
    },
    flag: {
      fontSize: 18,
      lineHeight: 22,
      ...Platform.select({
        android: { includeFontPadding: false, textAlignVertical: 'center' },
      }),
    },
    prefix: {
      fontSize: 17,
      lineHeight: 24,
      fontWeight: '500',
      color: theme.muted,
      letterSpacing: 0,
      ...Platform.select({
        android: { includeFontPadding: false, textAlignVertical: 'center' },
        ios: { fontVariant: ['tabular-nums'] as const },
        default: { fontVariant: ['tabular-nums'] as const },
      }),
    },
    phoneSep: {
      width: StyleSheet.hairlineWidth,
      alignSelf: 'stretch',
      marginVertical: 14,
      marginHorizontal: 12,
      backgroundColor: theme.border,
      flexShrink: 0,
    },
    digitArea: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      minWidth: 0,
      minHeight: 24,
    },
    displayValue: {
      fontSize: 17,
      lineHeight: 24,
      fontWeight: '500',
      letterSpacing: 2,
      color: theme.text,
      ...Platform.select({
        android: { includeFontPadding: false, textAlignVertical: 'center' },
        ios: { fontVariant: ['tabular-nums'] as const },
        default: { fontVariant: ['tabular-nums'] as const },
      }),
    },
    displayValueTyped: {
      flexShrink: 1,
    },
    placeholder: {
      flex: 1,
      color: theme.placeholder,
      fontWeight: '400',
      letterSpacing: 2,
    },
    cursor: {
      width: 2,
      height: 22,
      borderRadius: 1,
      backgroundColor: theme.primaryDark,
      marginLeft: 2,
      flexShrink: 0,
      alignSelf: 'center',
    },
    cursorLeading: {
      marginLeft: 0,
      marginRight: 2,
    },
    webInput: {
      flex: 1,
      fontSize: 17,
      lineHeight: 24,
      fontWeight: '500',
      letterSpacing: 2,
      color: theme.text,
      minWidth: 0,
      paddingVertical: 0,
      margin: 0,
      ...Platform.select({
        android: { includeFontPadding: false, textAlignVertical: 'center' },
        ios: { fontVariant: ['tabular-nums'] as const },
        default: { fontVariant: ['tabular-nums'] as const, outlineStyle: 'none' } as object,
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
      ...text.error,
      marginTop: -16,
      marginBottom: 16,
    },
    hint: {
      ...text.hint,
      marginTop: -16,
      marginBottom: 16,
    },
    primaryBtn: {
      marginBottom: 8,
    },
    orRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginVertical: 12,
      gap: 12,
    },
    orLine: {
      flex: 1,
      height: StyleSheet.hairlineWidth,
      backgroundColor: theme.border,
    },
    orText: {
      ...text.or,
    },
    googleBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      paddingVertical: 14,
      borderRadius: PULSE_SIGNUP_RADIUS.button,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.bg,
      marginBottom: 4,
    },
    googleBtnDisabled: {
      opacity: 0.5,
    },
    googleBtnPressed: {
      backgroundColor: theme.surface,
    },
    googleText: text.google,
    accessoryDock: {
      flexShrink: 0,
      paddingHorizontal: 20,
      paddingTop: 4,
      paddingBottom: 6,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.border,
      backgroundColor: theme.bg,
    },
    keypadDock: {
      flexShrink: 0,
      backgroundColor: theme.keypadTray,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.border,
      borderTopLeftRadius: PULSE_SIGNUP_RADIUS.keypadTray,
      borderTopRightRadius: PULSE_SIGNUP_RADIUS.keypadTray,
      paddingTop: 6,
      paddingHorizontal: 16,
    },
  });
}
