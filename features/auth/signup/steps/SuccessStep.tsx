import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { USER_2D_AVATARS } from '@/constants/UserAvatars';
import { ROUTES } from '@/lib/routes';
import type { SignUpFlow } from '../hooks/useBusinessSignUpFlow';
import { SignUpPulseFormStep } from '../SignUpPulseFormStep';
import { SignUpWorkspaceReadyCard } from '../components/SignUpWorkspaceReadyCard';

export function SuccessStep({ flow }: { flow: SignUpFlow }) {
  const router = useRouter();
  const verifying = flow.emailVerificationRequired;
  const enteringOps = !verifying && flow.loading;
  const hasChosenProfilePhoto =
    !!flow.profilePreviewUri || !!flow.profileAvatarSeed?.trim();
  const profilePreset =
    !flow.profilePreviewUri && flow.profileAvatarSeed?.trim()
      ? USER_2D_AVATARS.find((a) => a.seed === flow.profileAvatarSeed)
      : undefined;

  return (
    <SignUpPulseFormStep
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
      onPrimary={
        verifying
          ? flow.resendVerification
          : () => {
              router.replace(ROUTES.TABS.TRIPS);
              flow.finishBusinessSignup();
            }
      }
      primaryDisabled={verifying && flow.resendingSecs > 0}
      primaryLoading={enteringOps}
      secondaryAction={{
        label: 'Sign in on another device',
        onPress: () => {
          flow.finishBusinessSignup();
          router.replace(ROUTES.SIGN_IN);
        },
      }}
      centerContent
    >
      <View style={styles.cardWrap}>
        <SignUpWorkspaceReadyCard
          entityName={flow.orgName}
          verifying={verifying}
          profilePreviewUri={hasChosenProfilePhoto ? flow.profilePreviewUri : null}
          profileImage={hasChosenProfilePhoto ? profilePreset?.image : undefined}
          profilePhotoLabel="Profile photo selected"
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
      </View>
    </SignUpPulseFormStep>
  );
}

const styles = StyleSheet.create({
  cardWrap: {
    width: '100%',
    alignItems: 'center',
    paddingTop: 4,
    paddingBottom: 8,
  },
});
