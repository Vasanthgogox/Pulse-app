import { memo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import {
  PULSE_PILL_BUTTON_BORDER_WIDTH,
  PULSE_PILL_BUTTON_RADIUS,
  pulsePillButtonContainerFullWidth,
  pulsePillButtonContainerLarge,
  pulsePillButtonDisabled,
  pulsePillButtonLabelLarge,
  pulsePillButtonPressed,
} from '@/constants/PulsePillButtonChrome';
import Theme from '@/constants/Theme';
import { PULSE_SIGNUP, type SignUpTheme } from './signUpPulseTheme';

export interface SignUpPulsePrimaryButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'solid' | 'ready';
  style?: StyleProp<ViewStyle>;
  theme?: SignUpTheme;
  testID?: string;
}

export const SignUpPulsePrimaryButton = memo(function SignUpPulsePrimaryButton({
  label,
  onPress,
  disabled = false,
  loading = false,
  variant = 'solid',
  style,
  theme = PULSE_SIGNUP,
  testID,
}: SignUpPulsePrimaryButtonProps) {
  const inactive = disabled || loading;

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [
        styles.btn,
        pulsePillButtonContainerLarge,
        pulsePillButtonContainerFullWidth,
        inactive
          ? { backgroundColor: theme.disabledBg, borderColor: theme.disabledText }
          : variant === 'ready'
            ? {
                backgroundColor: theme.primaryLight,
                borderColor: theme.primaryDark,
              }
            : {
                backgroundColor: theme.primary,
                borderColor: theme.primaryDark,
              },
        pressed && !inactive && pulsePillButtonPressed,
        inactive && pulsePillButtonDisabled,
        style,
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy: loading }}
    >
      {loading ? (
        <ActivityIndicator color={Theme.buttonPrimaryText} size="small" />
      ) : (
        <Text
          style={[
            pulsePillButtonLabelLarge,
            inactive && { color: theme.disabledText },
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  btn: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: PULSE_PILL_BUTTON_RADIUS,
    borderWidth: PULSE_PILL_BUTTON_BORDER_WIDTH,
    minHeight: 52,
  },
});
