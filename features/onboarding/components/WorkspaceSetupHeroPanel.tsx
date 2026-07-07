import { StyleSheet, Text, View } from 'react-native';

import Theme from '@/constants/Theme';
import { PULSE_SIGNUP_TYPO } from '@/features/auth/signup/signUpTypography';
import { WORKSPACE_SETUP_COPY } from '@/lib/onboarding/workspaceSetupContent';

import { ONBOARDING_BRAND } from './onboardingPersonaAssets';
import { WorkspaceOutcomeTypewriter } from './WorkspaceOutcomeTypewriter';

const PANEL_CONTENT_MAX = 400;

/** Desktop hub left panel — aligned with signup / sign-in marketing rail. */
export function WorkspaceSetupHeroPanel() {
  return (
    <View style={styles.panel}>
      <View style={styles.inner}>
        <Text style={styles.logo}>
          PULSE<Text style={styles.logoDot}>.</Text>
        </Text>
        <Text style={styles.tag}>{WORKSPACE_SETUP_COPY.tag}</Text>
        <Text style={styles.headline}>{WORKSPACE_SETUP_COPY.headline}</Text>

        <WorkspaceOutcomeTypewriter />

        <View style={styles.footerCopy}>
          <Text style={styles.closing}>{WORKSPACE_SETUP_COPY.closing}</Text>
          <Text style={styles.trust}>{WORKSPACE_SETUP_COPY.trust}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    flex: 1,
    width: '100%',
    minWidth: 0,
    minHeight: 0,
    backgroundColor: Theme.screenBackground,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inner: {
    width: '100%',
    maxWidth: PANEL_CONTENT_MAX,
    paddingHorizontal: 40,
    paddingVertical: 36,
  },
  logo: {
    ...PULSE_SIGNUP_TYPO.brand,
    fontSize: 22,
    lineHeight: 28,
    color: ONBOARDING_BRAND.ink,
    letterSpacing: -0.6,
    marginBottom: 12,
  },
  logoDot: {
    color: ONBOARDING_BRAND.yellow,
  },
  tag: {
    ...PULSE_SIGNUP_TYPO.label,
    color: Theme.textMuted,
    marginBottom: 10,
  },
  headline: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '600',
    color: ONBOARDING_BRAND.ink,
    letterSpacing: -0.45,
    marginBottom: 12,
    maxWidth: 340,
  },
  closing: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '400',
    color: Theme.textSecondary,
    marginBottom: 8,
  },
  footerCopy: {
    marginTop: 12,
  },
  trust: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '400',
    color: Theme.textSecondary,
    maxWidth: 320,
    opacity: 0.92,
  },
});
