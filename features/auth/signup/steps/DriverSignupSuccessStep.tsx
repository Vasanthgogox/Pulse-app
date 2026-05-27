import { StyleSheet, View, type ImageSourcePropType } from 'react-native';
import { useRouter } from 'expo-router';

import { ROUTES } from '@/lib/routes';
import { clearDriverSignupSuccess } from '@/lib/onboarding/businessSignupBranding.util';
import { SignUpPulseFormStep } from '../SignUpPulseFormStep';
import { SignUpWorkspaceReadyCard } from '../components/SignUpWorkspaceReadyCard';
import { DRIVER_SIGNUP } from '../signUpDriverTheme';
import Theme from '@/constants/Theme';
import type { SignUpWorkspaceReadyCheckpoint } from '../components/SignUpWorkspaceReadyCard';

export interface DriverSignupSuccessStepProps {
  displayName: string;
  onEnterApp: () => void;
  profilePreviewUri?: string | null;
  profileImage?: ImageSourcePropType;
  licenseUploaded: boolean;
  aadhaarUploaded: boolean;
  panUploaded: boolean;
  licenseSkipped: boolean;
  aadhaarSkipped: boolean;
  panSkipped: boolean;
}

function buildDriverCheckpoints({
  licenseUploaded,
  aadhaarUploaded,
  panUploaded,
  licenseSkipped,
  aadhaarSkipped,
  panSkipped,
}: Omit<DriverSignupSuccessStepProps, 'displayName' | 'onEnterApp'>): SignUpWorkspaceReadyCheckpoint[] {
  const docResolved = (uploaded: boolean, skipped: boolean) => uploaded || skipped;
  const docsDone =
    docResolved(licenseUploaded, licenseSkipped) &&
    docResolved(aadhaarUploaded, aadhaarSkipped) &&
    docResolved(panUploaded, panSkipped);
  const uploadedCount = [licenseUploaded, aadhaarUploaded, panUploaded].filter(Boolean).length;
  const skippedCount = [licenseSkipped, aadhaarSkipped, panSkipped].filter(Boolean).length;

  let docsDetail = `${uploadedCount} of 3 documents uploaded`;
  if (skippedCount > 0) {
    docsDetail = `${uploadedCount} uploaded · ${skippedCount} skipped — add later in profile`;
  }

  return [
    { id: 'account', label: 'Driver account created', status: 'complete' },
    {
      id: 'docs',
      label: 'Compliance documents',
      status: docsDone ? 'complete' : 'in_progress',
      detail: docsDetail,
    },
    { id: 'photo', label: 'Profile photo configured', status: 'complete' },
    {
      id: 'trips',
      label: 'Trip access',
      status: docsDone ? 'complete' : 'in_progress',
      detail: docsDone ? 'Ready to run trips' : 'Finish documents to unlock all trips',
    },
  ];
}

export function DriverSignupSuccessStep({
  displayName,
  onEnterApp,
  profilePreviewUri,
  profileImage,
  licenseUploaded,
  aadhaarUploaded,
  panUploaded,
  licenseSkipped,
  aadhaarSkipped,
  panSkipped,
}: DriverSignupSuccessStepProps) {
  const router = useRouter();
  const trimmedName = displayName.trim() || 'Driver';

  const handleEnterApp = () => {
    clearDriverSignupSuccess();
    onEnterApp();
  };

  return (
    <SignUpPulseFormStep
      title="You're in"
      subtitle={`${trimmedName} is ready on the Pulse driver network.`}
      primaryLabel="Go to app"
      onPrimary={handleEnterApp}
      theme={DRIVER_SIGNUP}
      centerContent
      secondaryAction={{
        label: 'Sign in on another device',
        onPress: () => {
          clearDriverSignupSuccess();
          router.replace(ROUTES.SIGN_IN);
        },
      }}
    >
      <View style={styles.cardWrap}>
        <SignUpWorkspaceReadyCard
          entityName={trimmedName}
          entityIcon="truck"
          theme={DRIVER_SIGNUP}
          liveLabel="Ready"
          profilePreviewUri={profilePreviewUri}
          profileImage={profileImage}
          profilePhotoLabel="Profile photo selected"
          gradientColors={['#f8fafc', '#f1f5f9', DRIVER_SIGNUP.bg]}
          progressEndColor={DRIVER_SIGNUP.primary}
          entityPillBorderColor={Theme.driverEmeraldBorderSoft}
          checkpoints={buildDriverCheckpoints({
            licenseUploaded,
            aadhaarUploaded,
            panUploaded,
            licenseSkipped,
            aadhaarSkipped,
            panSkipped,
          })}
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
