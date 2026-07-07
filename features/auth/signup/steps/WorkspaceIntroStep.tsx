import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Check } from 'lucide-react-native';

import Theme from '@/constants/Theme';
import type { SignUpFlow } from '../hooks/useBusinessSignUpFlow';
import { SignUpPulseFormStep } from '../SignUpPulseFormStep';
import { DESKTOP_BREAKPOINT } from '../signUpConstants';
import { PULSE_SIGNUP_TYPO, PULSE_SIGNUP_TYPO_MOBILE } from '../signUpTypography';
import { WORKSPACE_INTRO_COPY } from '@/lib/onboarding/workspaceSetupContent';

import { ONBOARDING_BRAND } from '@/features/onboarding/components/onboardingPersonaAssets';

export function WorkspaceIntroStep({ flow }: { flow: SignUpFlow }) {
  const { width } = useWindowDimensions();
  const isDesktop = width >= DESKTOP_BREAKPOINT;

  return (
    <SignUpPulseFormStep
      title={WORKSPACE_INTRO_COPY.title}
      subtitle={
        <View style={styles.subtitleBlock}>
          <Text style={[styles.subtitle, !isDesktop && styles.subtitleMobile]}>
            {WORKSPACE_INTRO_COPY.subtitle}
          </Text>
          <View style={styles.timeRow}>
            <Text style={[styles.timeLabel, !isDesktop && styles.timeLabelMobile]}>
              {WORKSPACE_INTRO_COPY.timeLabel}
            </Text>
            <Text style={[styles.timeValue, !isDesktop && styles.timeValueMobile]}>
              {WORKSPACE_INTRO_COPY.timeValue}
            </Text>
          </View>
        </View>
      }
      primaryLabel={WORKSPACE_INTRO_COPY.cta}
      onPrimary={flow.dismissIntro}
      titleCentered={!isDesktop}
      centerContent={!isDesktop}
      inlinePrimary
    >
      <View style={[styles.body, isDesktop && styles.bodyDesktop]}>
        <Text style={[styles.configureTitle, !isDesktop && styles.configureTitleMobile]}>
          {WORKSPACE_INTRO_COPY.configureTitle}
        </Text>
        <View style={styles.checklist}>
          {WORKSPACE_INTRO_COPY.items.map((item) => (
            <View key={item} style={styles.checkRow}>
              <Check size={isDesktop ? 14 : 16} color={ONBOARDING_BRAND.ink} strokeWidth={2.25} />
              <Text style={[styles.checkLabel, !isDesktop && styles.checkLabelMobile]}>{item}</Text>
            </View>
          ))}
        </View>
      </View>
    </SignUpPulseFormStep>
  );
}

const styles = StyleSheet.create({
  subtitleBlock: {
    gap: 0,
    alignItems: 'flex-start',
    width: '100%',
    marginTop: 4,
  },
  subtitle: {
    fontSize: PULSE_SIGNUP_TYPO.subtitle.fontSize,
    lineHeight: PULSE_SIGNUP_TYPO.subtitle.lineHeight,
    fontWeight: '400',
    color: Theme.textMuted,
    textAlign: 'left',
  },
  subtitleMobile: {
    fontSize: PULSE_SIGNUP_TYPO_MOBILE.subtitle.fontSize,
    lineHeight: PULSE_SIGNUP_TYPO_MOBILE.subtitle.lineHeight,
    marginTop: PULSE_SIGNUP_TYPO_MOBILE.subtitle.marginTop,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 8,
  },
  timeLabel: {
    fontSize: PULSE_SIGNUP_TYPO.caption.fontSize,
    lineHeight: PULSE_SIGNUP_TYPO.caption.lineHeight,
    fontWeight: '300',
    color: Theme.textSecondary,
  },
  timeLabelMobile: {
    fontSize: PULSE_SIGNUP_TYPO_MOBILE.caption.fontSize,
    lineHeight: PULSE_SIGNUP_TYPO_MOBILE.caption.lineHeight,
  },
  timeValue: {
    fontSize: PULSE_SIGNUP_TYPO.caption.fontSize,
    lineHeight: PULSE_SIGNUP_TYPO.caption.lineHeight,
    fontWeight: '400',
    color: Theme.textSecondary,
  },
  timeValueMobile: {
    fontSize: PULSE_SIGNUP_TYPO_MOBILE.caption.fontSize,
    lineHeight: PULSE_SIGNUP_TYPO_MOBILE.caption.lineHeight,
  },
  body: {
    width: '100%',
    marginTop: 2,
  },
  bodyDesktop: {
    marginTop: 6,
    width: '100%',
  },
  configureTitle: {
    fontSize: PULSE_SIGNUP_TYPO.label.fontSize,
    lineHeight: PULSE_SIGNUP_TYPO.label.lineHeight,
    fontWeight: '600',
    color: Theme.textMuted,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: PULSE_SIGNUP_TYPO.label.letterSpacing,
  },
  configureTitleMobile: {
    fontSize: PULSE_SIGNUP_TYPO_MOBILE.label.fontSize,
    lineHeight: PULSE_SIGNUP_TYPO_MOBILE.label.lineHeight,
    letterSpacing: PULSE_SIGNUP_TYPO_MOBILE.label.letterSpacing,
    marginBottom: 10,
  },
  checklist: {
    gap: 7,
    marginBottom: 16,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  checkLabel: {
    fontSize: PULSE_SIGNUP_TYPO.body.fontSize,
    lineHeight: PULSE_SIGNUP_TYPO.body.lineHeight,
    fontWeight: '400',
    color: ONBOARDING_BRAND.ink,
  },
  checkLabelMobile: {
    fontSize: PULSE_SIGNUP_TYPO_MOBILE.body.fontSize,
    lineHeight: PULSE_SIGNUP_TYPO_MOBILE.body.lineHeight,
  },
});
