import { memo, useCallback, useEffect, useMemo, useRef, type ReactNode, type RefObject } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type View as RNView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  effectiveKeyboardInset,
  useKeyboardVisible,
} from '@/lib/hooks/useKeyboardVisible';
import { scrollFocusedFieldIntoView } from '@/lib/scrollFocusedFieldIntoView.util';

import { SignUpPulseFormStepProvider, type ScrollFieldIntoViewOptions } from './SignUpPulseFormStepContext';
import { SignUpPulsePrimaryButton } from './SignUpPulsePrimaryButton';
import { SignUpPulseTitle } from './SignUpPulseTitle';
import { DESKTOP_BREAKPOINT, SIGNUP_FORM_FOOTER_CLEARANCE, SIGNUP_MOBILE_PROGRESS_CLEARANCE, SIGNUP_STICKY_FOOTER_CLEARANCE } from './signUpConstants';
import { PULSE_SIGNUP, type SignUpTheme } from './signUpPulseTheme';
import { createPulseSignUpTextStyles } from './signUpTypography';

export interface SignUpPulseFormStepProps {
  title: string;
  subtitle?: string | ReactNode;
  children: ReactNode;
  primaryLabel: string;
  onPrimary: () => void;
  primaryDisabled?: boolean;
  primaryLoading?: boolean;
  footerAccessory?: ReactNode;
  inlinePrimary?: boolean;
  /** Vertically center scroll content (success / celebration steps). */
  centerContent?: boolean;
  /** Title alignment — desktop defaults to left. */
  titleCentered?: boolean;
  /** Extra bottom padding (e.g. clear fixed progress rail on Account step). */
  scrollPaddingBottom?: number;
  /** Adds keyboard height to scroll padding and KeyboardAvoidingView on native. */
  keyboardAware?: boolean;
  scrollRef?: RefObject<ScrollView | null>;
  theme?: SignUpTheme;
  secondaryAction?: {
    label: string;
    onPress: () => void;
  };
  /** Replaces the default primary + accessory footer (compact bespoke layouts). */
  customFooter?: ReactNode;
}

export const SignUpPulseFormStep = memo(function SignUpPulseFormStep({
  title,
  subtitle,
  children,
  primaryLabel,
  onPrimary,
  primaryDisabled = false,
  primaryLoading = false,
  footerAccessory,
  inlinePrimary = false,
  centerContent = false,
  titleCentered = false,
  scrollPaddingBottom = 0,
  keyboardAware = false,
  scrollRef,
  theme = PULSE_SIGNUP,
  secondaryAction,
  customFooter,
}: SignUpPulseFormStepProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isDesktop = width >= DESKTOP_BREAKPOINT;
  const textStyles = useMemo(() => createPulseSignUpTextStyles(theme), [theme]);
  const { keyboardVisible, keyboardHeight } = useKeyboardVisible();
  // On web, --app-vh is frozen while the keyboard overlays content (Android Chrome).
  // Use a fallback inset when focus opens the keyboard before visualViewport reports height.
  const keyboardInset = keyboardAware
    ? effectiveKeyboardInset(keyboardVisible, keyboardHeight, 280)
    : 0;
  const mobileProgressPad =
    !isDesktop && inlinePrimary ? SIGNUP_MOBILE_PROGRESS_CLEARANCE : 0;
  const footerClearance = inlinePrimary
    ? SIGNUP_FORM_FOOTER_CLEARANCE
    : SIGNUP_STICKY_FOOTER_CLEARANCE;
  const bottomPad =
    scrollPaddingBottom + keyboardInset + footerClearance + mobileProgressPad;

  const lastFocusedFieldRef = useRef<RefObject<RNView | null> | null>(null);
  const lastScrollPadRef = useRef<number | undefined>(undefined);

  const scrollFieldIntoView = useCallback(
    (fieldRef: RefObject<RNView | null>, options?: ScrollFieldIntoViewOptions) => {
      if (!keyboardAware || !scrollRef) return;
      lastFocusedFieldRef.current = fieldRef;
      const extraBottomPad = options?.extraBottomPad ?? (isDesktop ? 16 : 48);
      lastScrollPadRef.current = extraBottomPad;
      scrollFocusedFieldIntoView(scrollRef, fieldRef, {
        keyboardHeight: keyboardInset,
        headerOffset: isDesktop ? 20 : 72,
        extraBottomPad,
        animated: true,
      });
    },
    [keyboardAware, scrollRef, keyboardInset, isDesktop],
  );

  useEffect(() => {
    if (!keyboardAware || !keyboardVisible || !scrollRef || !lastFocusedFieldRef.current) {
      return;
    }
    scrollFocusedFieldIntoView(scrollRef, lastFocusedFieldRef.current, {
      keyboardHeight: keyboardInset,
      headerOffset: isDesktop ? 20 : 72,
      extraBottomPad: lastScrollPadRef.current ?? (isDesktop ? 16 : 48),
      animated: true,
    });
  }, [keyboardAware, keyboardVisible, keyboardInset, scrollRef, isDesktop]);

  const cta = customFooter ?? (
    <View style={styles.ctaBlock}>
      {footerAccessory}
      <SignUpPulsePrimaryButton
        label={primaryLabel}
        onPress={onPrimary}
        disabled={primaryDisabled}
        loading={primaryLoading}
        theme={theme}
      />
      {secondaryAction ? (
        <Pressable onPress={secondaryAction.onPress} style={styles.secondaryLink}>
          <Text style={textStyles.secondaryLink}>{secondaryAction.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );

  const scroll = (
    <ScrollView
      ref={scrollRef}
      style={styles.scroll}
      contentContainerStyle={[
        styles.scrollContent,
        !isDesktop && styles.scrollContentMobile,
        isDesktop && styles.scrollContentDesktop,
        { paddingBottom: 16 + bottomPad },
        centerContent && styles.scrollContentCentered,
      ]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      keyboardDismissMode={Platform.OS === 'web' ? 'none' : 'on-drag'}
    >
      <View style={!isDesktop ? styles.stepInner : undefined}>
        <SignUpPulseTitle title={title} subtitle={subtitle} centered={titleCentered} />
        {children}
        {inlinePrimary ? cta : null}
      </View>
    </ScrollView>
  );

  const footer = !inlinePrimary ? (
    <View
      style={[
        styles.footer,
        isDesktop && styles.footerDesktop,
        !isDesktop && styles.footerMobile,
        {
          borderTopColor: theme.border,
          backgroundColor: theme.bg,
          paddingBottom:
            Math.max(insets.bottom, !isDesktop ? 4 : 8) +
            (keyboardAware && Platform.OS === 'web' ? keyboardInset : 0),
        },
      ]}
    >
      {cta}
    </View>
  ) : null;

  const body = (
    <>
      {scroll}
      {footer}
    </>
  );

  return (
    <SignUpPulseFormStepProvider
      onPrimary={onPrimary}
      primaryDisabled={primaryDisabled}
      primaryLoading={primaryLoading}
      scrollFieldIntoView={keyboardAware ? scrollFieldIntoView : undefined}
    >
      <View style={styles.root}>
        {keyboardAware && Platform.OS !== 'web' ? (
          <KeyboardAvoidingView
            style={styles.keyboardAvoid}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 52 : 0}
          >
            {body}
          </KeyboardAvoidingView>
        ) : (
          body
        )}
      </View>
    </SignUpPulseFormStepProvider>
  );
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 0,
  },
  keyboardAvoid: {
    flex: 1,
    minHeight: 0,
  },
  scroll: {
    flex: 1,
    minHeight: 0,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'web' ? 4 : 2,
  },
  scrollContentMobile: {
    alignItems: 'center',
  },
  stepInner: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
  },
  scrollContentDesktop: {
    paddingHorizontal: 0,
    paddingTop: 10,
    width: '100%',
    alignSelf: 'stretch',
    flexGrow: 1,
  },
  footerDesktop: {
    paddingHorizontal: 0,
    width: '100%',
    alignSelf: 'stretch',
  },
  scrollContentCentered: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerMobile: {
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  ctaBlock: {
    gap: 8,
    width: '100%',
    maxWidth: 360,
    minWidth: 0,
    alignSelf: 'center',
  },
  secondaryLink: {
    alignItems: 'center',
    paddingVertical: 8,
  },
});
