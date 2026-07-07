import { memo, useMemo, type ReactNode, type RefObject } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { useMobileWebStepLayout } from '@/lib/hooks/useMobileWebStepLayout';

import { SignUpPulseFormStepProvider } from './SignUpPulseFormStepContext';
import { SignUpPulsePrimaryButton } from './SignUpPulsePrimaryButton';
import { SignUpPulseTitle } from './SignUpPulseTitle';
import { DESKTOP_BREAKPOINT, DESKTOP_SIGNUP_FORM_WIDTH } from './signUpConstants';
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
  /** Extra bottom padding (e.g. clear fixed progress rail on Account step). */
  scrollPaddingBottom?: number;
  /**
   * @deprecated All form steps are keyboard-aware by default on mobile web and native.
   */
  keyboardAware?: boolean;
  scrollRef?: RefObject<ScrollView | null>;
  theme?: SignUpTheme;
  secondaryAction?: {
    label: string;
    onPress: () => void;
  };
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
  scrollPaddingBottom = 0,
  scrollRef,
  theme = PULSE_SIGNUP,
  secondaryAction,
  customFooter,
}: SignUpPulseFormStepProps) {
  const { width } = useWindowDimensions();
  const isDesktop = width >= DESKTOP_BREAKPOINT;
  const textStyles = useMemo(() => createPulseSignUpTextStyles(theme), [theme]);

  const layout = useMobileWebStepLayout({
    extraScrollPadding: scrollPaddingBottom,
    inlinePrimary,
  });

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
        isDesktop && styles.scrollContentDesktop,
        { paddingBottom: layout.scrollPaddingBottom },
        centerContent && styles.scrollContentCentered,
      ]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      keyboardDismissMode={Platform.OS === 'web' ? 'none' : 'on-drag'}
    >
      <SignUpPulseTitle title={title} subtitle={subtitle} />
      {children}
      {layout.showCtaInScroll ? cta : null}
    </ScrollView>
  );

  const useNativeKeyboardAvoid = Platform.OS !== 'web';

  return (
    <SignUpPulseFormStepProvider
      onPrimary={onPrimary}
      primaryDisabled={primaryDisabled}
      primaryLoading={primaryLoading}
    >
      <View style={[styles.root, layout.rootStyle]}>
        {useNativeKeyboardAvoid ? (
          <KeyboardAvoidingView
            style={styles.keyboardAvoid}
            behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 72 : 0}
          >
            {scroll}
          </KeyboardAvoidingView>
        ) : (
          scroll
        )}
        {!layout.showCtaInScroll ? (
          <View
            style={[
              styles.footer,
              isDesktop && styles.footerDesktop,
              !isDesktop && styles.footerMobile,
              layout.footerStyle,
              {
                borderTopColor: theme.border,
                backgroundColor: theme.bg,
              },
            ]}
          >
            {cta}
          </View>
        ) : null}
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
    paddingTop: Platform.OS === 'web' ? 12 : 8,
  },
  scrollContentDesktop: {
    paddingHorizontal: 36,
    paddingTop: 12,
    maxWidth: DESKTOP_SIGNUP_FORM_WIDTH,
    alignSelf: 'center',
    width: '100%',
  },
  scrollContentCentered: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerDesktop: {
    paddingHorizontal: 36,
    maxWidth: DESKTOP_SIGNUP_FORM_WIDTH,
    alignSelf: 'center',
    width: '100%',
  },
  footerMobile: {
    paddingHorizontal: 20,
  },
  ctaBlock: {
    gap: 12,
    width: '100%',
  },
  secondaryLink: {
    alignItems: 'center',
    paddingVertical: 8,
  },
});
