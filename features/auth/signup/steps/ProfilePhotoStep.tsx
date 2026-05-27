import type { SignUpFlow } from '../hooks/useBusinessSignUpFlow';
import { SignUpPhotoPickerStep } from '../components/SignUpPhotoPickerStep';
import { USER_2D_AVATARS } from '@/constants/UserAvatars';
import { PULSE_SIGNUP } from '../signUpPulseTheme';

export function ProfilePhotoStep({ flow }: { flow: SignUpFlow }) {
  const preset =
    !flow.profilePreviewUri && flow.profileAvatarSeed
      ? USER_2D_AVATARS.find((a) => a.seed === flow.profileAvatarSeed)
      : undefined;

  return (
    <SignUpPhotoPickerStep
      title="Your profile photo"
      subtitle="Add a photo so your team recognizes you in Pulse."
      previewUri={flow.profilePreviewUri}
      previewImage={preset?.image}
      presetAvatars={USER_2D_AVATARS}
      selectedPresetSeed={flow.profilePreviewUri ? null : flow.profileAvatarSeed}
      onPresetSelect={flow.selectProfileAvatarSeed}
      onUpload={flow.uploadProfilePhoto}
      uploading={flow.profileUploading}
      uploadLabel="Upload profile photo"
      primaryLabel="Finish setup"
      onPrimary={flow.continueFromProfilePhoto}
      primaryLoading={flow.profileSaving}
      onSkip={flow.skipProfilePhoto}
      skipLabel="Skip for now"
      theme={PULSE_SIGNUP}
    />
  );
}
