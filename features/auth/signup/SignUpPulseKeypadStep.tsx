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
import { DESKTOP_BREAKPOINT } from './signUpConstants';
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
  /** Center title, OTP row, and actions — used on verification step. */
  centeredLayout?: boolean;
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
  centeredLayout = false,
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
    <View style={styles.actionsWrap}>
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
            <GoogleBrandIcon size={16} />
            <Text style={styles.googleText}>Continue with Google</Text>
          </Pressable>
        </>
      ) : null}
    </View>
  );

  const formBody = (
    <View style={[styles.formBody, centeredLayout && styles.centeredStack]}>
      <SignUpPulseTitle
        title={title}
        subtitle={subtitle}
        compact={useKeypad}
        centered={centeredLayout}
      />
      <Text style={[styles.fieldLabel, centeredLayout && styles.fieldLabelCenter]}>
        {fieldLabel}
      </Text>
      <View style={styles.fieldBlock}>
        {fieldInput}
        {errorMessage ? (
          <Text style={styles.error} accessibilityRole="alert">
            {errorMessage}
          </Text>
        ) : hintMessage ? (
          <Text style={styles.hint}>{hintMessage}</Text>
        ) : null}
      </View>
      {actionBlock}
    </View>
  );

  const webKeyboardPad = !useKeypad
    ? effectiveKeyboardInset(keyboardVisible, keyboardHeight, 280)
    : 0;

  const contentScrollInner = [
    styles.contentScrollInner,
    isDesktop && styles.contentScrollInnerDesktop,
    centeredLayout && styles.contentScrollInnerCentered,
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
            {footerAccessory ? (
              <View style={centeredLayout ? styles.footerAccessoryCentered : undefined}>
                {footerAccessory}
              </View>
            ) : null}
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
      paddingHorizontal: 20,
      paddingTop: 8,
      width: '100%',
      maxWidth: '100%',
      alignSelf: 'center',
    },
    contentScrollInnerKeypad: {
      paddingHorizontal: 20,
      paddingTop: 4,
      paddingBottom: 4,
      flexGrow: 1,
      width: '100%',
      maxWidth: '100%',
      alignSelf: 'center',
    },
    contentScrollInnerDesktop: {
      paddingHorizontal: 0,
      paddingTop: 10,
      width: '100%',
      alignSelf: 'stretch',
      flexGrow: 1,
    },
    contentScrollInnerCentered: {
      alignItems: 'center',
    },
    centeredStack: {
      width: '100%',
      maxWidth: 360,
      alignSelf: 'center',
      alignItems: 'stretch',
    },
    formBody: {
      width: '100%',
      maxWidth: 360,
      alignSelf: 'center',
      minWidth: 0,
    },
    fieldLabelCenter: {
      textAlign: 'center',
    },
    fieldLabel: {
      ...text.fieldLabel,
      marginBottom: 8,
    },
    fieldBlock: {
      width: '100%',
      alignSelf: 'stretch',
      marginBottom: 12,
    },
    footerAccessoryCentered: {
      width: '100%',
      maxWidth: 360,
      alignSelf: 'center',
      alignItems: 'center',
    },
    customDisplay: {
      width: '100%',
      marginBottom: 0,
      overflow: 'hidden',
    },
    displayRow: {
      flexDirection: 'row',
      alignItems: 'center',
      width: '100%',
      maxWidth: '100%',
      alignSelf: 'stretch',
      paddingHorizontal: 14,
      minHeight: 44,
      backgroundColor: theme.bg,
      borderRadius: PULSE_SIGNUP_RADIUS.input,
      borderWidth: 1,
      borderColor: theme.border,
      marginBottom: 0,
      ...Platform.select({
        web: { boxSizing: 'border-box' } as object,
      }),
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
      width: 20,
      height: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    flag: {
      fontSize: 14,
      lineHeight: 18,
      ...Platform.select({
        android: { includeFontPadding: false, textAlignVertical: 'center' },
      }),
    },
    prefix: {
      ...text.displayPrefix,
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
      marginVertical: 12,
      marginHorizontal: 10,
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
      ...text.display,
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
      letterSpacing: 1,
    },
    cursor: {
      width: 2,
      height: 18,
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
      ...text.display,
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
      ...StyleSheet.absoluteFillObject,
      opacity: 0,
      borderWidth: 0,
      backgroundColor: 'transparent',
      ...Platform.select({
        default: { outlineStyle: 'none' } as object,
      }),
    },
    error: {
      ...text.error,
      marginTop: 6,
      marginBottom: 0,
      paddingLeft: 2,
      alignSelf: 'stretch',
    },
    hint: {
      ...text.hint,
      marginTop: 6,
      marginBottom: 0,
      paddingLeft: 2,
      alignSelf: 'stretch',
    },
    primaryBtn: {
      marginBottom: 0,
      alignSelf: 'stretch',
      maxWidth: '100%',
    },
    actionsWrap: {
      width: '100%',
      maxWidth: '100%',
      minWidth: 0,
      alignSelf: 'stretch',
      marginTop: 4,
      gap: 0,
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
      alignSelf: 'stretch',
      width: '100%',
      maxWidth: '100%',
      gap: 8,
      paddingVertical: 10,
      borderRadius: PULSE_SIGNUP_RADIUS.button,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.bg,
      marginBottom: 4,
      minHeight: 40,
      ...Platform.select({
        web: { boxSizing: 'border-box' } as object,
      }),
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
