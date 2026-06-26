import { memo, type ReactNode, type RefObject } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';

import {
  effectiveKeyboardInset,
  useKeyboardVisible,
} from '@/lib/hooks/useKeyboardVisible';

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
  scrollRef?: RefObject<ScrollView | null>;
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
  scrollRef,
  bodyMode = 'scroll',
  scrollBottomPad = 24,
}: SignUpMobileShellProps) {
  const theme = trustMode === 'driver' ? DRIVER_SIGNUP : PULSE_SIGNUP;
  const { keyboardVisible, keyboardHeight } = useKeyboardVisible();
  const keyboardInset =
    bodyMode === 'scroll'
      ? effectiveKeyboardInset(keyboardVisible, keyboardHeight, 280)
      : 0;

  const body =
    bodyMode === 'scroll' ? (
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: scrollBottomPad + keyboardInset },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'web' ? 'none' : 'on-drag'}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    ) : (
      children
    );

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
      <View style={styles.body}>{body}</View>
    </SignUpPulseShell>
  );
});

const styles = StyleSheet.create({
  body: {
    flex: 1,
    minHeight: 0,
  },
  scroll: {
    flex: 1,
    minHeight: 0,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'web' ? 4 : 8,
  },
});
