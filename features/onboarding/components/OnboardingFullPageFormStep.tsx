import { memo, type ReactNode } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';

import {
  effectiveKeyboardInset,
  useKeyboardVisible,
} from '@/lib/hooks/useKeyboardVisible';
import { OperationalButton } from '@/components/operational';
import { OnboardingFullPageFooter } from './OnboardingFullPageFooter';
import { OnboardingFullPageTitle } from './OnboardingFullPageTitle';
import { onboardingLayout } from '../styles/onboardingLayout';
import { space } from '@/design-system/spacing';

export interface OnboardingFullPageFormStepProps {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  children: ReactNode;
  primaryLabel: string;
  onPrimary: () => void;
  primaryDisabled?: boolean;
  primaryLoading?: boolean;
  footerAccessory?: ReactNode;
  secondaryAction?: {
    label: string;
    onPress: () => void;
  };
}

/** Full-page form step: readable title + scroll fields + sticky primary action. */
export const OnboardingFullPageFormStep = memo(function OnboardingFullPageFormStep({
  title,
  subtitle,
  eyebrow,
  children,
  primaryLabel,
  onPrimary,
  primaryDisabled = false,
  primaryLoading = false,
  footerAccessory,
  secondaryAction,
}: OnboardingFullPageFormStepProps) {
  const { keyboardVisible, keyboardHeight } = useKeyboardVisible();
  const keyboardInset = effectiveKeyboardInset(keyboardVisible, keyboardHeight, 280);
  const footerKeyboardPad = Platform.OS === 'web' ? keyboardInset : 0;

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: space[4] + keyboardInset }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        keyboardDismissMode={Platform.OS === 'web' ? 'none' : 'on-drag'}
      >
        <OnboardingFullPageTitle title={title} subtitle={subtitle} eyebrow={eyebrow} />
        {children}
      </ScrollView>

      <View style={{ paddingBottom: footerKeyboardPad }}>
        <OnboardingFullPageFooter accessory={footerAccessory}>
        <OperationalButton
          intent="bottomSticky"
          label={primaryLabel}
          onPress={onPrimary}
          disabled={primaryDisabled}
          loading={primaryLoading}
          fullWidth
        />
        {secondaryAction ? (
          <OperationalButton
            intent="utility"
            label={secondaryAction.label}
            onPress={secondaryAction.onPress}
            fullWidth
          />
        ) : null}
      </OnboardingFullPageFooter>
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
    ...onboardingLayout.contentInner,
    paddingTop: space[2],
    flexGrow: 1,
  },
});
