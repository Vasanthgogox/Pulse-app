import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

import { ROUTES } from '@/lib/routes';
import type { SignUpFlow } from '../hooks/useBusinessSignUpFlow';
import { SignUpPulseKeypadStep } from '../SignUpPulseKeypadStep';
import { formatSignupPhoneDisplay } from '../signUpKeypad.util';
import { PULSE_SIGNUP } from '../signUpPulseTheme';

export function PhoneStep({ flow }: { flow: SignUpFlow }) {
  const router = useRouter();

  const hint = flow.phoneExistsCheck?.loading
    ? 'Checking number…'
    : !flow.phoneExistsCheck?.loading && flow.phoneExistsCheck?.exists
      ? flow.isTeamInviteEntry
        ? 'Account found — verify OTP to sign in and accept your invite.'
        : 'Account found — verify OTP to continue.'
      : null;

  return (
    <SignUpPulseKeypadStep
      title={flow.isTeamInviteEntry ? 'Join your team' : 'Welcome aboard for business'}
      subtitle={
        flow.isTeamInviteEntry
          ? 'Verify your mobile number. We will match your admin invitation — no new workspace.'
          : 'Enter your Indian mobile number to get started.'
      }
      value={flow.phone}
      onChange={flow.setPhone}
      maxDigits={10}
      formatDisplay={formatSignupPhoneDisplay}
      displayFlag="🇮🇳"
      displayPrefix="+91"
      emptyPlaceholder="000 000 0000"
      onPrimary={flow.continuePhone}
      primaryDisabled={!flow.phoneValid || !!flow.phoneExistsCheck?.loading}
      primaryLoading={flow.loading || !!flow.phoneExistsCheck?.loading}
      primaryLabel="Send OTP"
      errorMessage={flow.phoneInlineError}
      hintMessage={hint}
      showGoogle={!flow.isTeamInviteEntry}
      onGoogle={flow.continueWithGoogleFromWelcome}
      googleDisabled={flow.loading || flow.googleLoading || !flow.isOnline}
      googleLoading={flow.googleLoading}
      footerAccessory={
        <Pressable onPress={() => router.replace(ROUTES.SIGN_IN)} style={styles.signIn}>
          <Text style={styles.signInText}>
            Already activated? <Text style={styles.signInLink}>Sign in</Text>
          </Text>
        </Pressable>
      }
    />
  );
}

const styles = StyleSheet.create({
  signIn: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  signInText: {
    fontSize: 13,
    fontWeight: '600',
    color: PULSE_SIGNUP.muted,
  },
  signInLink: {
    color: PULSE_SIGNUP.primary,
    fontWeight: '800',
  },
});
