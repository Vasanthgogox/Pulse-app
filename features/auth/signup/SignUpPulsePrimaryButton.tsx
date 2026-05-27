import { memo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { PULSE_SIGNUP, PULSE_SIGNUP_RADIUS, type SignUpTheme } from './signUpPulseTheme';

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
        inactive
          ? { backgroundColor: theme.disabledBg }
          : variant === 'ready'
            ? { backgroundColor: theme.primaryLight }
            : { backgroundColor: theme.primary },
        pressed && !inactive && styles.btnPressed,
        style,
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy: loading }}
    >
      {loading ? (
        <ActivityIndicator color="#fff" size="small" />
      ) : (
        <Text style={[styles.label, inactive && { color: theme.disabledText }]}>{label}</Text>
      )}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  btn: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: PULSE_SIGNUP_RADIUS.button,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  btnPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.98 }],
  },
  label: {
    fontSize: 13,
    fontWeight: '900',
    color: '#ffffff',
  },
});
