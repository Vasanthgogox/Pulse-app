import { memo, type ReactNode, type RefObject } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useKeyboardVisible } from '@/lib/hooks/useKeyboardVisible';

import { SignUpPulsePrimaryButton } from './SignUpPulsePrimaryButton';
import { SignUpPulseTitle } from './SignUpPulseTitle';
import { PULSE_SIGNUP, type SignUpTheme } from './signUpPulseTheme';

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
  /** Adds keyboard height to scroll padding and KeyboardAvoidingView on native. */
  keyboardAware?: boolean;
  scrollRef?: RefObject<ScrollView | null>;
  theme?: SignUpTheme;
  secondaryAction?: {
    label: string;
    onPress: () => void;
  };
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
  keyboardAware = false,
  scrollRef,
  theme = PULSE_SIGNUP,
  secondaryAction,
}: SignUpPulseFormStepProps) {
  const { keyboardVisible, keyboardHeight } = useKeyboardVisible();
  const bottomPad =
    scrollPaddingBottom +
    (keyboardAware && keyboardVisible ? Math.max(keyboardHeight, 0) : 0);

  const cta = (
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
          <Text style={[styles.secondaryLinkText, { color: theme.primary }]}>
            {secondaryAction.label}
          </Text>
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
        { paddingBottom: 16 + bottomPad },
        centerContent && styles.scrollContentCentered,
      ]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      keyboardDismissMode="on-drag"
    >
      <SignUpPulseTitle title={title} subtitle={subtitle} />
      {children}
      {inlinePrimary ? cta : null}
    </ScrollView>
  );

  return (
    <View style={styles.root}>
      {keyboardAware && Platform.OS !== 'web' ? (
        <KeyboardAvoidingView
          style={styles.keyboardAvoid}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={8}
        >
          {scroll}
        </KeyboardAvoidingView>
      ) : (
        scroll
      )}
      {!inlinePrimary ? (
        <View style={[styles.footer, { borderTopColor: theme.border, backgroundColor: theme.bg }]}>
          {cta}
        </View>
      ) : null}
    </View>
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
    paddingTop: 8,
  },
  scrollContentCentered: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  ctaBlock: {
    gap: 12,
    width: '100%',
  },
  secondaryLink: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  secondaryLinkText: {
    fontSize: 13,
    fontWeight: '700',
  },
});
