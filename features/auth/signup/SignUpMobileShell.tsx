import { memo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { SignUpPulseShell } from './SignUpPulseShell';
import { DRIVER_SIGNUP } from './signUpDriverTheme';
import { PULSE_SIGNUP } from './signUpPulseTheme';

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
  isDesktop?: boolean;
}

/**
 * Full-page mobile activation shell — business (purple) or driver (green).
 */
export const SignUpMobileShell = memo(function SignUpMobileShell({
  backLabel = 'Back',
  onBack,
  stepLabels,
  currentStepIndex,
  hideProgress = false,
  children,
  trustMode = 'business',
  isDesktop = false,
}: SignUpMobileShellProps) {
  const theme = trustMode === 'driver' ? DRIVER_SIGNUP : PULSE_SIGNUP;

  return (
    <SignUpPulseShell
      onBack={onBack}
      backLabel={backLabel}
      currentStepIndex={currentStepIndex}
      stepLabels={stepLabels}
      hideProgress={hideProgress}
      isDesktop={isDesktop}
      theme={theme}
    >
      <View style={styles.body}>{children}</View>
    </SignUpPulseShell>
  );
});

const styles = StyleSheet.create({
  body: {
    flex: 1,
    minHeight: 0,
  },
});
