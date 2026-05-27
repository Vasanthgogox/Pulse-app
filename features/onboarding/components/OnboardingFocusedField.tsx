import { memo } from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';

import { colors } from '@/design-system/colors';
import { radius } from '@/design-system/radius';
import { space } from '@/design-system/spacing';
import { typography } from '@/design-system/typography';

export interface OnboardingFocusedFieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  errorMessage?: string | null;
  hintMessage?: string | null;
}

export const OnboardingFocusedField = memo(function OnboardingFocusedField({
  label,
  errorMessage,
  hintMessage,
  ...inputProps
}: OnboardingFocusedFieldProps) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, errorMessage ? styles.inputError : null]}
        placeholderTextColor={colors.textMuted}
        {...inputProps}
      />
      {errorMessage ? (
        <Text style={styles.error} accessibilityRole="alert">
          {errorMessage}
        </Text>
      ) : hintMessage ? (
        <Text style={styles.hint}>{hintMessage}</Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    marginBottom: space[4],
  },
  label: {
    ...typography.label,
    fontSize: 10,
    marginBottom: space[2],
    color: colors.textSecondary,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderDefault,
    borderRadius: radius.md,
    paddingHorizontal: space[4],
    paddingVertical: Platform.OS === 'web' ? 11 : 12,
    fontSize: 15,
    fontWeight: '500',
    color: colors.textPrimary,
    backgroundColor: colors.surface,
    minHeight: 48,
    ...Platform.select({
      web: { outlineStyle: 'none' } as object,
    }),
  },
  inputError: {
    borderColor: colors.cost,
    backgroundColor: '#fef2f2',
  },
  error: {
    fontSize: 11,
    color: colors.cost,
    marginTop: space[2],
    fontWeight: '500',
  },
  hint: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: space[2],
  },
});
