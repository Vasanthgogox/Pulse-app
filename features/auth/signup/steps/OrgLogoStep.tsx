import { StyleSheet, Text, View } from 'react-native';

import { SignUpPhotoPickerStep } from '../components/SignUpPhotoPickerStep';
import type { SignUpFlow } from '../hooks/useBusinessSignUpFlow';
import { PULSE_SIGNUP } from '../signUpPulseTheme';

function orgInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

export function OrgLogoStep({ flow }: { flow: SignUpFlow }) {
  const initials = orgInitials(flow.orgName);

  return (
    <SignUpPhotoPickerStep
      title="Workspace logo"
      subtitle={
        <Text style={styles.subtitle}>
          Add a logo for <Text style={styles.highlight}>{flow.orgName}</Text>. You can change this
          later in workspace settings.
        </Text>
      }
      previewUri={flow.logoPreviewUri}
      previewFallback={
        <View style={styles.initialsWrap}>
          <Text style={styles.initials}>{initials}</Text>
        </View>
      }
      onUpload={flow.uploadOrgLogo}
      uploading={flow.logoUploading}
      uploadLabel="Upload workspace logo"
      primaryLabel="Continue"
      onPrimary={flow.continueFromLogo}
      onSkip={flow.skipOrgLogo}
      skipLabel="Skip for now"
      theme={PULSE_SIGNUP}
    />
  );
}

const styles = StyleSheet.create({
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: PULSE_SIGNUP.muted,
    fontWeight: '500',
    marginTop: 8,
    textAlign: 'center',
    maxWidth: 320,
  },
  highlight: {
    fontWeight: '900',
    color: PULSE_SIGNUP.primary,
  },
  initialsWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: PULSE_SIGNUP.primaryTint,
  },
  initials: {
    fontSize: 36,
    fontWeight: '900',
    color: PULSE_SIGNUP.primary,
    letterSpacing: -1,
  },
});
