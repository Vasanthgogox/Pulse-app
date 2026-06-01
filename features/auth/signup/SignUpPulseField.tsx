import { memo, useMemo, type ReactNode } from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';

import { signUpPasswordInputProps, type SignUpPasswordFieldRole } from '@/lib/signupPasswordInput.util';

import { PULSE_SIGNUP, PULSE_SIGNUP_RADIUS, type SignUpTheme } from './signUpPulseTheme';

export interface SignUpPulseFieldProps extends TextInputProps {
  label: string;
  required?: boolean;
  errorMessage?: string | null;
  hintMessage?: string | null;
  trailing?: ReactNode;
  theme?: SignUpTheme;
  /** Applies iOS-safe autofill props so Strong Password UI does not block typing. */
  passwordField?: SignUpPasswordFieldRole;
  /** Tighter vertical spacing (Account step with keyboard). */
  dense?: boolean;
}

export const SignUpPulseField = memo(function SignUpPulseField({
  label,
  required,
  errorMessage,
  hintMessage,
  trailing,
  theme = PULSE_SIGNUP,
  passwordField,
  dense = false,
  style,
  ...inputProps
}: SignUpPulseFieldProps) {
  const hasError = !!errorMessage;
  const fieldStyles = useMemo(() => createFieldStyles(theme, dense), [theme, dense]);
  const passwordAutofillProps = passwordField
    ? signUpPasswordInputProps(passwordField)
    : {};

  return (
    <View style={fieldStyles.wrap}>
      <Text style={fieldStyles.label}>
        {label}
        {required ? <Text style={fieldStyles.req}> *</Text> : null}
      </Text>
      <View
        style={[
          fieldStyles.inputShell,
          hasError && fieldStyles.inputShellError,
          inputProps.multiline && fieldStyles.inputShellMultiline,
        ]}
      >
        <TextInput
          {...passwordAutofillProps}
          {...inputProps}
          style={[
            fieldStyles.input,
            inputProps.multiline && fieldStyles.inputMultiline,
            trailing ? fieldStyles.inputWithTrailing : null,
            style,
          ]}
          placeholderTextColor={theme.placeholder}
        />
        {trailing}
      </View>
      {errorMessage ? (
        <Text style={fieldStyles.error}>{errorMessage}</Text>
      ) : hintMessage ? (
        <Text style={fieldStyles.hint}>{hintMessage}</Text>
      ) : null}
    </View>
  );
});

function createFieldStyles(theme: SignUpTheme, dense: boolean) {
  return StyleSheet.create({
    wrap: {
      marginBottom: dense ? 10 : 16,
    },
    label: {
      fontSize: 10,
      fontWeight: '900',
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: theme.muted,
      marginBottom: 8,
      paddingLeft: 4,
    },
    req: {
      color: '#ef4444',
    },
    inputShell: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: PULSE_SIGNUP_RADIUS.input,
      backgroundColor: theme.bg,
      flexDirection: 'row',
      alignItems: 'center',
      position: 'relative',
      // iOS Safari (mobile web): overflow:hidden on a container of <input> can
      // silently block the virtual keyboard. Use visible on web; border-radius
      // still renders correctly without needing to clip child backgrounds here.
      overflow: Platform.OS === 'web' ? 'visible' : 'hidden',
    },
    inputShellMultiline: {
      alignItems: 'flex-start',
    },
    inputShellError: {
      borderColor: '#ef4444',
      backgroundColor: '#fef2f2',
    },
    input: {
      flex: 1,
      paddingHorizontal: 16,
      paddingVertical: Platform.OS === 'web' ? 12 : 14,
      fontSize: 14,
      fontWeight: '600',
      color: theme.text,
      minHeight: 48,
      ...Platform.select({
        web: { outlineStyle: 'none', cursor: 'text' } as object,
      }),
    },
    inputMultiline: {
      minHeight: 120,
      textAlignVertical: 'top',
      paddingTop: 14,
    },
    inputWithTrailing: {
      paddingRight: 48,
    },
    error: {
      fontSize: 12,
      color: '#ef4444',
      marginTop: 6,
      fontWeight: '600',
    },
    hint: {
      fontSize: 12,
      color: theme.muted,
      marginTop: 6,
      fontWeight: '600',
    },
  });
}
