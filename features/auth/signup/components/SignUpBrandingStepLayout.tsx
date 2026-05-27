import { memo, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { SignUpPulsePrimaryButton } from '../SignUpPulsePrimaryButton';
import { SignUpPulseTitle } from '../SignUpPulseTitle';
import { PULSE_SIGNUP, type SignUpTheme } from '../signUpPulseTheme';

export interface SignUpBrandingStepLayoutProps {
  title: string;
  subtitle?: string | ReactNode;
  children: ReactNode;
  primaryLabel: string;
  onPrimary: () => void;
  primaryLoading?: boolean;
  primaryDisabled?: boolean;
  skipLabel?: string;
  onSkip?: () => void;
  theme?: SignUpTheme;
}

/** Full-page branding step — scroll body + sticky footer (logo / profile photo). */
export const SignUpBrandingStepLayout = memo(function SignUpBrandingStepLayout({
  title,
  subtitle,
  children,
  primaryLabel,
  onPrimary,
  primaryLoading = false,
  primaryDisabled = false,
  skipLabel = 'Skip for now',
  onSkip,
  theme = PULSE_SIGNUP,
}: SignUpBrandingStepLayoutProps) {
  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <SignUpPulseTitle title={title} subtitle={subtitle} />
        {children}
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: theme.border, backgroundColor: theme.bg }]}>
        <SignUpPulsePrimaryButton
          label={primaryLabel}
          onPress={onPrimary}
          loading={primaryLoading}
          disabled={primaryDisabled}
        />
        {onSkip ? (
          <Pressable onPress={onSkip} hitSlop={8} accessibilityRole="button">
            <Text style={[styles.skip, { color: theme.muted }]}>{skipLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 0,
  },
  scroll: {
    flex: 1,
    minHeight: 0,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 24,
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 12,
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  skip: {
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '700',
    paddingVertical: 8,
  },
});
