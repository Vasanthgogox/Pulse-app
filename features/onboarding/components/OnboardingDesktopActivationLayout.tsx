import { memo, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '@/design-system/colors';
import { layout } from '@/design-system/layout';
import { space } from '@/design-system/spacing';
import { typography } from '@/design-system/typography';
import { OnboardingProgressRail } from './OnboardingProgressRail';
import type { TrustIndicatorId } from './OnboardingTrustBar';
import { OnboardingTrustBar } from './OnboardingTrustBar';

export interface OnboardingDesktopActivationLayoutProps {
  contextTitle: string;
  contextSubtitle: string;
  contextTag?: string;
  stepLabels: readonly string[];
  currentStepIndex: number;
  trustActive?: TrustIndicatorId;
  trustCompleted?: readonly TrustIndicatorId[];
  children: ReactNode;
  pageWidth: number;
  bottomPad: number;
}

export const OnboardingDesktopActivationLayout = memo(function OnboardingDesktopActivationLayout({
  contextTitle,
  contextSubtitle,
  contextTag = 'Workspace activation',
  stepLabels,
  currentStepIndex,
  trustActive,
  trustCompleted,
  children,
  pageWidth,
  bottomPad,
}: OnboardingDesktopActivationLayoutProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.shell, { paddingTop: insets.top }]}>
      <View style={styles.panelShell}>
        <View style={styles.contextPanel}>
          <Text style={styles.brand}>
            PULSE<Text style={styles.dot}>.</Text>
          </Text>
          <Text style={styles.tag}>{contextTag}</Text>
          <Text style={styles.contextTitle}>{contextTitle}</Text>
          <Text style={styles.contextSub}>{contextSubtitle}</Text>
          {trustActive ? (
            <View style={styles.trustWrap}>
              <OnboardingTrustBar active={trustActive} completed={trustCompleted} />
            </View>
          ) : null}
        </View>

        <View style={styles.workPanel}>
          <ScrollView
            horizontal
            pagingEnabled
            scrollEnabled={false}
            showsHorizontalScrollIndicator={false}
            style={{ width: pageWidth, alignSelf: 'center' }}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>

          <View style={[styles.progress, { paddingBottom: insets.bottom + space[3] }]}>
            <OnboardingProgressRail stepLabels={stepLabels} currentIndex={currentStepIndex} />
          </View>
        </View>
      </View>
    </View>
  );
});

export const OnboardingDesktopPage = memo(function OnboardingDesktopPage({
  pageWidth,
  bottomPad,
  scrollRef,
  children,
}: {
  pageWidth: number;
  bottomPad: number;
  scrollRef?: (el: ScrollView | null) => void;
  children: ReactNode;
}) {
  return (
    <View style={{ width: pageWidth }}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ paddingBottom: bottomPad, paddingHorizontal: layout.screenPaddingX }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator
        nestedScrollEnabled
      >
        {children}
      </ScrollView>
    </View>
  );
});

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  panelShell: {
    flex: 1,
    flexDirection: 'row',
    maxWidth: 1200,
    alignSelf: 'center',
    width: '100%',
  },
  contextPanel: {
    flex: 1,
    maxWidth: 420,
    backgroundColor: colors.operational,
    paddingHorizontal: space[6],
    paddingVertical: space[8],
    justifyContent: 'center',
  },
  brand: {
    fontSize: 26,
    fontWeight: '900',
    fontStyle: 'italic',
    letterSpacing: -0.5,
    color: '#fff',
    marginBottom: space[5],
  },
  dot: {
    color: colors.brand,
  },
  tag: {
    ...typography.label,
    color: 'rgba(248,250,252,0.65)',
    marginBottom: space[3],
  },
  contextTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: -0.4,
    lineHeight: 34,
    marginBottom: space[3],
  },
  contextSub: {
    fontSize: 14,
    lineHeight: 21,
    color: 'rgba(248,250,252,0.72)',
    maxWidth: 320,
  },
  trustWrap: {
    marginTop: space[6],
  },
  workPanel: {
    flex: 1.2,
    backgroundColor: colors.canvas,
    minWidth: 0,
  },
  progress: {
    paddingHorizontal: layout.screenPaddingX,
    paddingTop: space[3],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
  },
});
