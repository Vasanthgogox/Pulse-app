import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Text, TouchableOpacity, View } from 'react-native';

import { C, styles } from '../businessSignUp.styles';
import { MockOtpNotice } from '../components/MockOtpNotice';
import { OtpInput } from '../components/OtpInput';
import type { SignUpFlow } from '../hooks/useBusinessSignUpFlow';
import { OTP_LENGTH } from '../signUpConstants';

export function OtpStep({ flow }: { flow: SignUpFlow }) {
  return (
    <>
      <View style={styles.otpIconWrap}>
        <FontAwesome name="mobile" size={36} color={C.accent} />
      </View>
      <Text style={styles.pageTitle}>Verify your number</Text>
      <Text style={styles.pageSub}>
        We would send a code to{'\n'}
        <Text style={styles.phoneHighlight}>+91 {flow.phone}</Text>
        {' '}— use mock verification below.
      </Text>

      <MockOtpNotice />

      <OtpInput value={flow.otp} onChange={flow.setOtp} />

      <TouchableOpacity
        style={[styles.primaryBtn, flow.otp.replace(/\s/g, '').length < OTP_LENGTH && styles.primaryBtnDisabled]}
        onPress={flow.verifyOtp}
        disabled={flow.otp.replace(/\s/g, '').length < OTP_LENGTH}
      >
        <Text style={styles.primaryBtnText}>Verify OTP</Text>
      </TouchableOpacity>

      <View style={styles.resendRow}>
        {flow.otpResendSecs > 0 ? (
          <Text style={styles.resendCountdown}>Resend in {flow.otpResendSecs}s</Text>
        ) : (
          <TouchableOpacity onPress={() => { flow.setOtp(''); flow.startOtpCountdown(); }}>
            <Text style={styles.altLink}>Resend OTP</Text>
          </TouchableOpacity>
        )}
      </View>
    </>
  );
}
