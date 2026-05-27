import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useRouter } from 'expo-router';
import { Text, TouchableOpacity, View } from 'react-native';

import { styles } from '../businessSignUp.styles';
import type { SignUpFlow } from '../hooks/useBusinessSignUpFlow';

export function SuccessStep({ flow }: { flow: SignUpFlow }) {
  const router = useRouter();
  return (
    <View style={styles.successInner}>
      <View style={styles.successIcon}>
        <FontAwesome
          name={flow.emailVerificationRequired ? 'envelope' : 'check'}
          size={32}
          color="#fff"
        />
      </View>

      {flow.emailVerificationRequired ? (
        <>
          <Text style={styles.successTitle}>Check your email</Text>
          <Text style={styles.successSub}>
            We sent a verification link to{' '}
            <Text style={styles.successEmailBold}>{flow.email}</Text>.{'\n'}
            Click the link to activate your account.
          </Text>
          <TouchableOpacity
            style={[styles.primaryBtn, flow.resendingSecs > 0 && styles.primaryBtnDisabled]}
            disabled={flow.resendingSecs > 0}
            onPress={flow.resendVerification}
          >
            <Text style={styles.primaryBtnText}>
              {flow.resendingSecs > 0 ? `Resend in ${flow.resendingSecs}s` : 'Resend verification email'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.altRow} onPress={() => router.replace('/sign-in')}>
            <Text style={styles.altLink}>Already verified? Sign in</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Text style={styles.successTitle}>
            {flow.orgJoinMode ? 'Account created!' : "You're in!"}
          </Text>
          {flow.orgJoinMode ? (
            <Text style={styles.successSub}>
              Your account is ready. To join{' '}
              <Text style={styles.successEmailBold}>{flow.orgName}</Text>, ask their admin
              to invite you as a team member.
            </Text>
          ) : (
            <Text style={styles.successSub}>
              Your workspace <Text style={styles.successEmailBold}>{flow.orgName}</Text> is ready.
              Start managing your fleet.
            </Text>
          )}
          <TouchableOpacity style={styles.primaryBtn} onPress={() => router.replace('/')}>
            <Text style={styles.primaryBtnText}>Go to app</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.altRow} onPress={() => router.replace('/sign-in')}>
            <Text style={styles.altLink}>Already have an account? Sign in</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}
