import { memo, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  OperationalHeader,
  type DensityTier,
} from '@/components/operational';
import type { TrustIndicatorId } from './OnboardingTrustBar';
import { OnboardingTrustBar } from './OnboardingTrustBar';
import { OnboardingProgressRail } from './OnboardingProgressRail';
import { colors } from '@/design-system/colors';
import { layout } from '@/design-system/layout';
import { space } from '@/design-system/spacing';
import { onboardingLayout } from '../styles/onboardingLayout';

export interface OnboardingActivationShellProps {
  title: string;
  subtitle?: string;
  breadcrumbs?: readonly string[];
  onBack: () => void;
  backLabel?: string;
  stepLabels: readonly string[];
  currentStepIndex: number;
  hideProgress?: boolean;
  bodyMode?: 'scroll' | 'keypad';
  trustActive?: TrustIndicatorId;
  trustCompleted?: readonly TrustIndicatorId[];
  density?: DensityTier;
  children: ReactNode;
  bottomAction?: ReactNode;
}

export const OnboardingActivationShell = memo(function OnboardingActivationShell({
  title,
  subtitle,
  breadcrumbs,
  onBack,
  backLabel = 'Back',
  stepLabels,
  currentStepIndex,
  hideProgress = false,
  bodyMode = 'scroll',
  trustActive,
  trustCompleted,
  density = 'medium',
  children,
  bottomAction,
}: OnboardingActivationShellProps) {
  const insets = useSafeAreaInsets();
  const isKeypad = bodyMode === 'keypad';

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={
        isKeypad ? undefined : Platform.OS === 'ios' ? 'padding' : 'height'
      }
      keyboardVerticalOffset={isKeypad ? 0 : Platform.OS === 'ios' ? insets.top + 12 : 0}
    >
      <OperationalHeader
        variant="onboarding"
        title={title}
        subtitle={isKeypad ? undefined : subtitle}
        breadcrumbs={isKeypad ? undefined : breadcrumbs}
        onBack={onBack}
        backLabel={backLabel}
        density={isKeypad ? 'high' : density}
        skipSafeAreaTop={false}
        metrics={
          trustActive ? (
            <OnboardingTrustBar active={trustActive} completed={trustCompleted} />
          ) : undefined
        }
      />

      <View style={isKeypad ? styles.bodyKeypad : styles.body}>{children}</View>

      {bottomAction ? (
        <View
          style={[
            styles.bottomSlot,
            { paddingBottom: reserveBottomInset(insets.bottom, hideProgress) },
          ]}
        >
          {bottomAction}
        </View>
      ) : null}

      {!hideProgress && stepLabels.length > 0 ? (
        <View
          style={[
            styles.progressFooter,
            {
              paddingBottom: Math.max(insets.bottom, space[3]),
              paddingHorizontal: layout.screenPaddingX,
            },
          ]}
        >
          <OnboardingProgressRail
            stepLabels={stepLabels}
            currentIndex={Math.min(currentStepIndex, stepLabels.length - 1)}
          />
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
});

function reserveBottomInset(safeBottom: number, hideProgress: boolean) {
  if (hideProgress) return Math.max(safeBottom, space[3]);
  return space[3];
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  body: {
    flex: 1,
    minHeight: 0,
  },
  bodyKeypad: {
    flex: 1,
    minHeight: 0,
  },
  bottomSlot: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
    backgroundColor: colors.canvas,
    paddingTop: space[2],
    paddingHorizontal: layout.screenPaddingX,
  },
  progressFooter: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
    backgroundColor: colors.canvas,
    paddingTop: space[2],
    maxWidth: onboardingLayout.activationMaxWidth,
    width: '100%',
    alignSelf: 'center',
  },
});
