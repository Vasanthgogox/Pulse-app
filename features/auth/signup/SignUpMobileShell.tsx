import { memo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { OnboardingFullPageShell } from '@/features/onboarding/components/OnboardingFullPageShell';

export interface SignUpMobileShellProps {
  brandLabel?: string;
  backLabel?: string;
  onBack: () => void;
  stepLabels: readonly string[];
  currentStepIndex: number;
  hideProgress?: boolean;
  bodyMode?: 'scroll' | 'keypad';
  children: ReactNode;
  scrollBottomPad?: number;
  headerTitle?: string;
  headerSubtitle?: string;
  trustMode?: 'business' | 'driver';
}

/**
 * Full-page mobile activation shell — minimal top chrome, maximum input area.
 */
export const SignUpMobileShell = memo(function SignUpMobileShell({
  backLabel = 'Back',
  onBack,
  stepLabels,
  currentStepIndex,
  hideProgress = false,
  children,
}: SignUpMobileShellProps) {
  return (
    <OnboardingFullPageShell
      onBack={onBack}
      backLabel={backLabel}
      currentStepIndex={currentStepIndex}
      stepLabels={stepLabels}
      hideProgress={hideProgress}
    >
      <View style={styles.body}>{children}</View>
    </OnboardingFullPageShell>
  );
});

const styles = StyleSheet.create({
  body: {
    flex: 1,
    minHeight: 0,
  },
});
