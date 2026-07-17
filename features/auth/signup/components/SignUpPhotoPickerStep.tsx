import { memo, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
} from 'react-native';
import { UploadCloud } from 'lucide-react-native';

import type { PresetAvatar } from '@/constants/DriverLevels';
import { SignUpBrandingStepLayout } from './SignUpBrandingStepLayout';
import { PULSE_SIGNUP_RADIUS, type SignUpTheme } from '../signUpPulseTheme';
import { PULSE_SIGNUP } from '../signUpPulseTheme';
import { createPulseSignUpTextStyles } from '../signUpTypography';

export interface SignUpPhotoPickerStepProps {
  title: string;
  subtitle?: string | ReactNode;
  previewUri?: string | null;
  previewImage?: ImageSourcePropType;
  previewFallback?: ReactNode;
  presetAvatars?: readonly PresetAvatar[];
  selectedPresetSeed?: string | null;
  onPresetSelect?: (seed: string) => void;
  onUpload: () => void;
  uploading?: boolean;
  uploadLabel?: string;
  primaryLabel?: string;
  onPrimary: () => void;
  primaryLoading?: boolean;
  onSkip?: () => void;
  skipLabel?: string;
  theme?: SignUpTheme;
}

export const SignUpPhotoPickerStep = memo(function SignUpPhotoPickerStep({
  title,
  subtitle,
  previewUri,
  previewImage,
  previewFallback,
  presetAvatars,
  selectedPresetSeed,
  onPresetSelect,
  onUpload,
  uploading = false,
  uploadLabel = 'Upload from gallery',
  primaryLabel = 'Continue',
  onPrimary,
  primaryLoading = false,
  onSkip,
  skipLabel = 'Skip for now',
  theme = PULSE_SIGNUP,
}: SignUpPhotoPickerStepProps) {
  const styles = createStyles(theme);

  return (
    <SignUpBrandingStepLayout
      title={title}
      subtitle={subtitle}
      primaryLabel={primaryLabel}
      onPrimary={onPrimary}
      primaryLoading={primaryLoading}
      onSkip={onSkip}
      skipLabel={skipLabel}
      theme={theme}
    >
      <View style={styles.previewWrap}>
        {previewUri ? (
          <Image
            key={previewUri}
            source={{ uri: previewUri }}
            style={styles.previewImage}
            resizeMode="cover"
          />
        ) : previewImage ? (
          <Image source={previewImage} style={styles.previewImage} resizeMode="contain" />
        ) : (
          previewFallback ?? <View style={styles.previewPlaceholder} />
        )}
      </View>

      <Pressable
        onPress={onUpload}
        disabled={uploading}
        style={({ pressed }) => [
          styles.uploadBtn,
          uploading && styles.uploadBtnDisabled,
          pressed && !uploading && styles.uploadBtnPressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel={uploadLabel}
      >
        {uploading ? (
          <ActivityIndicator color={theme.primary} size="small" />
        ) : (
          <>
            <UploadCloud size={18} color={theme.primary} strokeWidth={2.5} />
            <Text style={styles.uploadText}>{uploadLabel}</Text>
          </>
        )}
      </Pressable>

      {presetAvatars && presetAvatars.length > 0 && onPresetSelect ? (
        <>
          <Text style={styles.gridLabel}>Or choose a preset</Text>
          <View style={styles.gridWrap}>
            {presetAvatars.map((av) => {
              const selected = selectedPresetSeed === av.seed;
              return (
                <Pressable
                  key={av.seed}
                  onPress={() => onPresetSelect(av.seed)}
                  style={[styles.gridItem, selected && styles.gridItemSelected]}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                >
                  <Image source={av.image} style={styles.gridImage} resizeMode="cover" />
                </Pressable>
              );
            })}
          </View>
        </>
      ) : null}
    </SignUpBrandingStepLayout>
  );
});

/** Body-only picker for driver signup scroll pages. */
export const SignUpPhotoPickerBody = memo(function SignUpPhotoPickerBody({
  previewUri,
  previewImage,
  previewFallback,
  presetAvatars,
  selectedPresetSeed,
  onPresetSelect,
  onUpload,
  uploading = false,
  uploadLabel = 'Upload photo',
  theme = PULSE_SIGNUP,
}: Omit<
  SignUpPhotoPickerStepProps,
  'onPrimary' | 'primaryLabel' | 'primaryLoading' | 'onSkip' | 'skipLabel'
>) {
  const styles = createStyles(theme);

  return (
    <View style={styles.body}>
      <View style={styles.previewWrap}>
        {previewUri ? (
          <Image
            key={previewUri}
            source={{ uri: previewUri }}
            style={styles.previewImage}
            resizeMode="cover"
          />
        ) : previewImage ? (
          <Image source={previewImage} style={styles.previewImage} resizeMode="contain" />
        ) : (
          previewFallback ?? <View style={styles.previewPlaceholder} />
        )}
      </View>
      <Pressable
        onPress={onUpload}
        disabled={uploading}
        style={({ pressed }) => [
          styles.uploadBtn,
          uploading && styles.uploadBtnDisabled,
          pressed && !uploading && styles.uploadBtnPressed,
        ]}
      >
        {uploading ? (
          <ActivityIndicator color={theme.primary} size="small" />
        ) : (
          <>
            <UploadCloud size={18} color={theme.primary} strokeWidth={2.5} />
            <Text style={styles.uploadText}>{uploadLabel}</Text>
          </>
        )}
      </Pressable>
      {presetAvatars && presetAvatars.length > 0 && onPresetSelect ? (
        <>
          <Text style={styles.gridLabel}>Or choose a preset</Text>
          <View style={styles.gridWrap}>
            {presetAvatars.map((av) => {
              const selected = selectedPresetSeed === av.seed;
              return (
                <Pressable
                  key={av.seed}
                  onPress={() => onPresetSelect(av.seed)}
                  style={[styles.gridItem, selected && styles.gridItemSelected]}
                >
                  <Image source={av.image} style={styles.gridImage} resizeMode="cover" />
                </Pressable>
              );
            })}
          </View>
        </>
      ) : null}
    </View>
  );
});

function createStyles(theme: SignUpTheme) {
  const text = createPulseSignUpTextStyles(theme);

  return StyleSheet.create({
    body: {
      width: '100%',
    },
    previewWrap: {
      alignSelf: 'center',
      width: Platform.OS === 'web' ? 96 : 128,
      height: Platform.OS === 'web' ? 96 : 128,
      borderRadius: PULSE_SIGNUP_RADIUS.card,
      overflow: 'hidden',
      borderWidth: 2,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      marginBottom: Platform.OS === 'web' ? 12 : 20,
    },
    previewImage: {
      width: '100%',
      height: '100%',
    },
    previewPlaceholder: {
      flex: 1,
      backgroundColor: theme.primaryTint,
    },
    uploadBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      paddingVertical: Platform.OS === 'web' ? 10 : 14,
      borderRadius: PULSE_SIGNUP_RADIUS.button,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.bg,
      marginBottom: Platform.OS === 'web' ? 12 : 20,
    },
    uploadBtnDisabled: {
      opacity: 0.6,
    },
    uploadBtnPressed: {
      backgroundColor: theme.surface,
    },
    uploadText: {
      ...text.linkSmall,
      color: theme.primaryDark,
      fontWeight: '600',
    },
    gridLabel: {
      ...text.fieldLabel,
      marginBottom: 12,
    },
    gridWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Platform.OS === 'web' ? 8 : 10,
      marginBottom: 8,
    },
    gridItem: {
      width: Platform.OS === 'web' ? 56 : 56,
      height: Platform.OS === 'web' ? 56 : 56,
      borderRadius: Platform.OS === 'web' ? 14 : 14,
      overflow: 'hidden',
      borderWidth: 2,
      borderColor: theme.border,
      backgroundColor: theme.surface,
    },
    gridItemSelected: {
      borderColor: theme.primaryDark,
      borderWidth: 3,
    },
    gridImage: {
      width: '100%',
      height: '100%',
    },
  });
}
