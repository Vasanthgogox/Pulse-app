import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, useWindowDimensions } from 'react-native';

import { ROUTES } from '@/lib/routes';
import type { SignUpFlow } from '../hooks/useBusinessSignUpFlow';
import { SignUpPulseKeypadStep } from '../SignUpPulseKeypadStep';
import { formatSignupPhoneDisplay } from '../signUpKeypad.util';
import { DESKTOP_BREAKPOINT } from '../signUpConstants';
import { createPulseSignUpTextStyles } from '../signUpTypography';
import { PULSE_SIGNUP } from '../signUpPulseTheme';

export function PhoneStep({ flow }: { flow: SignUpFlow }) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isMobile = width < DESKTOP_BREAKPOINT;
  const text = createPulseSignUpTextStyles(PULSE_SIGNUP);

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
      primaryDisabled={!flow.phoneValid || flow.loading}
      primaryLoading={flow.loading}
      primaryLabel="Send OTP"
      errorMessage={flow.phoneInlineError}
      hintMessage={hint}
      showGoogle={!flow.isTeamInviteEntry}
      onGoogle={flow.continueWithGoogleFromWelcome}
      googleDisabled={flow.loading || flow.googleLoading || !flow.isOnline}
      googleLoading={flow.googleLoading}
      footerAccessory={
        <Pressable onPress={() => router.replace(ROUTES.SIGN_IN)} style={styles.signIn}>
          <Text style={isMobile ? text.linkSmallMobile : text.linkSmall}>
            Already activated? <Text style={text.linkEmphasis}>Sign in</Text>
          </Text>
        </Pressable>
      }
    />
  );
}

const styles = StyleSheet.create({
  signIn: {
    alignItems: 'center',
    paddingVertical: 8,
  },
});
