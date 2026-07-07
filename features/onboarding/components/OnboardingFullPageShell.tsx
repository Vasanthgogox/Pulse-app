import { memo, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';

import { useKeyboardVisible } from '@/lib/hooks/useKeyboardVisible';

import { colors } from '@/design-system/colors';
import { layout } from '@/design-system/layout';
import { space } from '@/design-system/spacing';
import { onboardingLayout } from '../styles/onboardingLayout';

export interface OnboardingFullPageShellProps {
  onBack: () => void;
  backLabel?: string;
  currentStepIndex: number;
  stepLabels: readonly string[];
  hideProgress?: boolean;
  children: ReactNode;
}

/**
 * Full-viewport activation shell — minimal chrome, maximum space for input.
 * One slim top bar + progress; step content owns title/copy.
 */
export const OnboardingFullPageShell = memo(function OnboardingFullPageShell({
  onBack,
  backLabel = 'Back',
  currentStepIndex,
  stepLabels,
  hideProgress = false,
  children,
}: OnboardingFullPageShellProps) {
  const insets = useSafeAreaInsets();
  const { keyboardVisible } = useKeyboardVisible();
  const total = stepLabels.length;
  const index = Math.min(Math.max(currentStepIndex, 0), Math.max(total - 1, 0));
  const currentLabel = stepLabels[index] ?? '';
  const progress = total > 0 ? (index + 1) / total : 0;
  const showProgress = !hideProgress && total > 0 && !keyboardVisible;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <Pressable
          onPress={onBack}
          style={styles.backBtn}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={backLabel}
        >
          <ChevronLeft size={20} color={colors.textPrimary} strokeWidth={2.5} />
          <Text style={styles.backText}>{backLabel}</Text>
        </Pressable>
        <Text style={styles.brand}>PULSE.</Text>
        <View style={styles.topSpacer} />
      </View>

      {!showProgress ? null : (
        <View style={styles.progressBlock}>
          <Text style={styles.stepMeta}>
            Step {index + 1} of {total}
            {currentLabel ? ` · ${currentLabel}` : ''}
          </Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
          </View>
        </View>
      ) : null}

      <View style={[styles.body, { paddingBottom: Math.max(insets.bottom, space[2]) }]}>
        {children}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: layout.screenPaddingX,
    paddingBottom: space[2],
    minHeight: 44,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    minWidth: 72,
  },
  backText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  brand: {
    fontSize: 18,
    fontWeight: '900',
    fontStyle: 'italic',
    letterSpacing: -0.4,
    color: colors.brand,
  },
  topSpacer: {
    minWidth: 72,
  },
  progressBlock: {
    paddingHorizontal: layout.screenPaddingX,
    paddingBottom: space[3],
    maxWidth: onboardingLayout.activationMaxWidth,
    width: '100%',
    alignSelf: 'center',
  },
  stepMeta: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
    marginBottom: space[2],
  },
  progressTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.borderSubtle,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.brand,
    borderRadius: 2,
  },
  body: {
    flex: 1,
    minHeight: 0,
  },
});
