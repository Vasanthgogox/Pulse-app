import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Clock } from 'lucide-react-native';

import { ROUTES } from '@/lib/routes';
import type { SignUpFlow } from '../hooks/useBusinessSignUpFlow';
import { SignUpPulseFormStep } from '../SignUpPulseFormStep';
import { PULSE_SIGNUP } from '../signUpPulseTheme';
import { PULSE_SIGNUP_TYPO } from '../signUpTypography';

export function JoinRequestSentStep({ flow }: { flow: SignUpFlow }) {
  const router = useRouter();
  const orgName = flow.domainJoinOrgName?.trim() || 'your company';

  return (
    <SignUpPulseFormStep
      title="Request sent"
      subtitle={`${orgName} already has a workspace on Pulse. We've asked their admin to approve you — you'll get access as soon as they do.`}
      primaryLabel="Done"
      onPrimary={() => {
        flow.finishBusinessSignup();
        router.replace(ROUTES.SIGN_IN);
      }}
      centerContent
    >
      <View style={styles.iconWrap}>
        <Clock size={32} color={PULSE_SIGNUP.muted} strokeWidth={1.8} />
      </View>
      <Text style={[PULSE_SIGNUP_TYPO.bannerBody, styles.body]}>
        No action needed right now. Sign back in once you're approved to start
        working in {orgName}'s workspace.
      </Text>
    </SignUpPulseFormStep>
  );
}

const styles = StyleSheet.create({
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: PULSE_SIGNUP.surface,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 16,
  },
  body: {
    textAlign: 'center',
    color: PULSE_SIGNUP.muted,
  },
});
