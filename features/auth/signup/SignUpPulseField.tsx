import { memo, useMemo, type ReactNode } from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';

import { PULSE_SIGNUP, PULSE_SIGNUP_RADIUS, type SignUpTheme } from './signUpPulseTheme';

export interface SignUpPulseFieldProps extends TextInputProps {
  label: string;
  required?: boolean;
  errorMessage?: string | null;
  hintMessage?: string | null;
  trailing?: ReactNode;
  theme?: SignUpTheme;
}

export const SignUpPulseField = memo(function SignUpPulseField({
  label,
  required,
  errorMessage,
  hintMessage,
  trailing,
  theme = PULSE_SIGNUP,
  style,
  ...inputProps
}: SignUpPulseFieldProps) {
  const hasError = !!errorMessage;
  const fieldStyles = useMemo(() => createFieldStyles(theme), [theme]);

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

function createFieldStyles(theme: SignUpTheme) {
  return StyleSheet.create({
    wrap: {
      marginBottom: 16,
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
        web: { outlineStyle: 'none' } as object,
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
