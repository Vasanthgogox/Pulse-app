import { StyleSheet, Text } from 'react-native';

import {
  OnboardingFullPageFormStep,
  OnboardingKeypadLinkRow,
  OnboardingKeypadStep,
} from '@/features/onboarding';
import { MockOtpNotice } from '../components/MockOtpNotice';
import { OtpInput } from '../components/OtpInput';
import { SignUpOtpBoxes } from '../SignUpOtpBoxes';
import type { SignUpFlow } from '../hooks/useBusinessSignUpFlow';
import { OTP_LENGTH } from '../signUpConstants';
import { colors } from '@/design-system/colors';
import { space } from '@/design-system/spacing';

export function OtpStep({ flow }: { flow: SignUpFlow }) {
  const cleanOtp = flow.otp.replace(/\s/g, '');

  if (flow.useMobileLayout) {
    return (
      <OnboardingKeypadStep
        title="Enter verification code"
        subtitle={`6-digit code sent to +91 ${flow.phone}`}
        value={cleanOtp}
        onChange={flow.setOtp}
        maxDigits={OTP_LENGTH}
        formatDisplay={(d) => d}
        fieldLabel="VERIFICATION CODE"
        emptyPlaceholder=""
        customDisplay={<SignUpOtpBoxes digits={cleanOtp} length={OTP_LENGTH} />}
        onPrimary={flow.verifyOtp}
        primaryDisabled={cleanOtp.length < OTP_LENGTH}
        primaryLoading={flow.loading}
        primaryButtonLabel="Confirm code"
        footerAccessory={
          <OnboardingKeypadLinkRow
            links={[
              {
                label:
                  flow.otpResendSecs > 0
                    ? `Resend in ${flow.otpResendSecs}s`
                    : 'Resend code',
                onPress: () => {
                  if (flow.otpResendSecs > 0) return;
                  flow.setOtp('');
                  flow.startOtpCountdown();
                },
                disabled: flow.otpResendSecs > 0,
              },
            ]}
          />
        }
      />
    );
  }

  return (
    <OnboardingFullPageFormStep
      title="Enter verification code"
      subtitle={`6-digit code sent to +91 ${flow.phone}`}
      primaryLabel="Confirm code"
      onPrimary={flow.verifyOtp}
      primaryDisabled={cleanOtp.length < OTP_LENGTH || flow.loading}
      primaryLoading={flow.loading}
      secondaryAction={
        flow.otpResendSecs > 0
          ? undefined
          : {
              label: 'Resend code',
              onPress: () => {
                flow.setOtp('');
                flow.startOtpCountdown();
              },
            }
      }
    >
      <MockOtpNotice />
      <OtpInput value={flow.otp} onChange={flow.setOtp} />
      {flow.otpResendSecs > 0 ? (
        <Text style={styles.hint}>Resend in {flow.otpResendSecs}s</Text>
      ) : null}
    </OnboardingFullPageFormStep>
  );
}

const styles = StyleSheet.create({
  hint: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: space[3],
    textAlign: 'center',
  },
});
