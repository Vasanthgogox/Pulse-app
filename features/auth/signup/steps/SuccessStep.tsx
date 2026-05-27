import { StyleSheet, View } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useRouter } from 'expo-router';

import { Surface } from '@/components/operational';
import { ActivationCheckpointList, OnboardingFullPageFormStep } from '@/features/onboarding';
import { ROUTES } from '@/lib/routes';
import { colors } from '@/design-system/colors';
import { space } from '@/design-system/spacing';
import type { SignUpFlow } from '../hooks/useBusinessSignUpFlow';

export function SuccessStep({ flow }: { flow: SignUpFlow }) {
  const router = useRouter();
  const verifying = flow.emailVerificationRequired;

  return (
    <OnboardingFullPageFormStep
      title={verifying ? 'Verify to activate' : 'Workspace ready'}
      subtitle={
        verifying
          ? `Check ${flow.email} to unlock operations.`
          : `${flow.orgName} is live on the Pulse network.`
      }
      primaryLabel={
        verifying
          ? flow.resendingSecs > 0
            ? `Resend in ${flow.resendingSecs}s`
            : 'Resend verification'
          : 'Enter operations'
      }
      onPrimary={verifying ? flow.resendVerification : () => router.replace(ROUTES.INDEX)}
      primaryDisabled={verifying && flow.resendingSecs > 0}
      secondaryAction={{
        label: 'Sign in on another device',
        onPress: () => router.replace(ROUTES.SIGN_IN),
      }}
    >
      <Surface elevation={1} density="low">
        <View style={styles.iconWrap}>
          <FontAwesome
            name={verifying ? 'envelope' : 'check-circle'}
            size={32}
            color={verifying ? colors.pending : colors.revenue}
          />
        </View>
        <ActivationCheckpointList
          density="high"
          checkpoints={[
            { id: 'org', label: 'Organization created', status: 'complete' },
            {
              id: 'verify',
              label: verifying ? 'Email verification' : 'Identity verified',
              status: verifying ? 'in_progress' : 'complete',
            },
            {
              id: 'ops',
              label: 'Operational access',
              status: verifying ? 'pending' : 'complete',
              detail: verifying ? 'Blocked until email confirmed' : 'Unlocked',
            },
          ]}
        />
      </Surface>
    </OnboardingFullPageFormStep>
  );
}

const styles = StyleSheet.create({
  iconWrap: {
    alignSelf: 'center',
    marginBottom: space[4],
  },
});
