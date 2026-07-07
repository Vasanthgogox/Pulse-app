import { StyleSheet, Text, View } from 'react-native';

import { SignUpPhotoPickerStep } from '../components/SignUpPhotoPickerStep';
import type { SignUpFlow } from '../hooks/useBusinessSignUpFlow';
import { SignUpPulseSubtitle } from '../SignUpPulseSubtitle';
import { PULSE_SIGNUP } from '../signUpPulseTheme';
import { SIGNUP_TEXT } from '../signUpTypography';

function orgInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

export function OrgLogoStep({ flow }: { flow: SignUpFlow }) {
  const initials = orgInitials(flow.orgName);
  // Workspace provisioning (background poll in useBusinessSignUpFlow) and logo upload are
  // two different waits; show which one is actually happening instead of one generic spinner.
  const isProvisioning = !flow.provisionedOrgId;

  return (
    <SignUpPhotoPickerStep
      title={isProvisioning ? 'Preparing your workspace' : 'Workspace logo'}
      subtitle={
        isProvisioning ? (
          <SignUpPulseSubtitle
            beforeHighlight="Setting up "
            highlight={flow.orgName}
            afterHighlight=". This usually takes a few seconds."
          />
        ) : (
          <SignUpPulseSubtitle
            beforeHighlight="Add a logo for "
            highlight={flow.orgName}
            afterHighlight=". You can change this later in workspace settings."
          />
        )
      }
      previewUri={flow.logoPreviewUri}
      previewFallback={
        <View style={styles.initialsWrap}>
          <Text style={SIGNUP_TEXT.avatarInitials}>{initials}</Text>
        </View>
      }
      onUpload={flow.uploadOrgLogo}
      uploading={isProvisioning || flow.logoUploading}
      uploadLabel={isProvisioning ? 'Preparing your workspace…' : 'Upload workspace logo'}
      primaryLabel="Continue"
      onPrimary={flow.continueFromLogo}
      onSkip={flow.skipOrgLogo}
      skipLabel="Skip for now"
      theme={PULSE_SIGNUP}
    />
  );
}

const styles = StyleSheet.create({
  initialsWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: PULSE_SIGNUP.primaryTint,
  },
});
