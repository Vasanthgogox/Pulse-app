import { StyleSheet, Text, View } from 'react-native';

import { MockOtpNotice } from '../components/MockOtpNotice';
import type { SignUpFlow } from '../hooks/useBusinessSignUpFlow';
import { SignUpOtpBoxes } from '../SignUpOtpBoxes';
import { SignUpPulseKeypadStep } from '../SignUpPulseKeypadStep';
import { OTP_LENGTH } from '../signUpConstants';
import { PULSE_SIGNUP } from '../signUpPulseTheme';

export function OtpStep({ flow }: { flow: SignUpFlow }) {
  const cleanOtp = flow.otp.replace(/\s/g, '');

  return (
    <SignUpPulseKeypadStep
      title="Verify your number"
      subtitle={`Enter the 6-digit code we sent to +91 ${flow.phone}`}
      value={cleanOtp}
      onChange={flow.setOtp}
      maxDigits={OTP_LENGTH}
      formatDisplay={(d) => d}
      fieldLabel="Verification Code"
      emptyPlaceholder=""
      customDisplay={<SignUpOtpBoxes digits={cleanOtp} length={OTP_LENGTH} />}
      onPrimary={flow.verifyOtp}
      primaryDisabled={cleanOtp.length < OTP_LENGTH}
      primaryLoading={flow.loading}
      primaryLabel="Verify OTP"
      footerAccessory={
        <View style={styles.footer}>
          <MockOtpNotice />
          <Text style={styles.resend}>
            {flow.otpResendSecs > 0
              ? `Resend in ${flow.otpResendSecs}s`
              : 'Tap resend on the previous screen if needed'}
          </Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  footer: {
    marginTop: 8,
    gap: 12,
  },
  resend: {
    fontSize: 12,
    fontWeight: '700',
    color: PULSE_SIGNUP.muted,
    textAlign: 'center',
  },
});
