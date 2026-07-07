import { memo, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
  type NativeSyntheticEvent,
  type TextInputFocusEventData,
  type TextInputProps,
} from 'react-native';

import { signUpPasswordInputProps, type SignUpPasswordFieldRole } from '@/lib/signupPasswordInput.util';
import { scrollFocusedWebInputIntoView } from '@/lib/webKeyboard';

import { useSignUpPulseFormStepContext } from './SignUpPulseFormStepContext';
import {
  SIGNUP_CONFIRM_PASSWORD_SCROLL_PAD,
  SIGNUP_PASSWORD_SCROLL_PAD,
} from './signUpConstants';
import { PULSE_SIGNUP, PULSE_SIGNUP_RADIUS, type SignUpTheme } from './signUpPulseTheme';
import { createPulseSignUpTextStyles, SIGNUP_ERROR_COLOR } from './signUpTypography';

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
  /** Sentence-case labels with extra vertical rhythm (sign-in). */
  comfortable?: boolean;
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
  comfortable = false,
  style,
  onSubmitEditing,
  returnKeyType,
  blurOnSubmit,
  multiline = false,
  onFocus,
  ...inputProps
}: SignUpPulseFieldProps) {
  const hasError = !!errorMessage;
  const fieldStyles = useMemo(
    () => createFieldStyles(theme, dense, comfortable),
    [theme, dense, comfortable],
  );
  const passwordAutofillProps = passwordField
    ? signUpPasswordInputProps(passwordField)
    : {};
  const formStep = useSignUpPulseFormStepContext();
  const registerField = formStep?.registerField;
  const unregisterField = formStep?.unregisterField;
  const isLastSingleLineFieldFn = formStep?.isLastSingleLineField;
  const handleFieldSubmitFn = formStep?.handleFieldSubmit;
  const scrollFieldIntoView = formStep?.scrollFieldIntoView;
  const fieldRevision = formStep?.revision ?? 0;
  const inputRef = useRef<TextInput>(null);
  const wrapRef = useRef<View>(null);
  const fieldIdRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (!registerField || !unregisterField) return undefined;
    const id = registerField(inputRef, !!multiline);
    fieldIdRef.current = id;
    return () => {
      unregisterField(id);
      if (fieldIdRef.current === id) {
        fieldIdRef.current = null;
      }
    };
  }, [registerField, unregisterField, multiline]);

  const fieldId = fieldIdRef.current;
  const isLastSingleLineField = useMemo(() => {
    if (!isLastSingleLineFieldFn || fieldId == null || multiline) return false;
    return isLastSingleLineFieldFn(fieldId);
  }, [isLastSingleLineFieldFn, fieldId, multiline, fieldRevision]);

  const resolvedReturnKeyType =
    returnKeyType ??
    (registerField && !multiline ? (isLastSingleLineField ? 'done' : 'next') : undefined);

  const resolvedBlurOnSubmit =
    blurOnSubmit ?? (registerField && !multiline ? isLastSingleLineField : undefined);

  const handleSubmitEditing: TextInputProps['onSubmitEditing'] = (event) => {
    onSubmitEditing?.(event);
    if (!multiline && handleFieldSubmitFn && fieldId != null) {
      handleFieldSubmitFn(fieldId);
    }
  };

  const handleFocus = (event: NativeSyntheticEvent<TextInputFocusEventData>) => {
    onFocus?.(event);
    if (scrollFieldIntoView) {
      const extraBottomPad =
        passwordField === 'confirm'
          ? SIGNUP_CONFIRM_PASSWORD_SCROLL_PAD
          : passwordField === 'new'
            ? SIGNUP_PASSWORD_SCROLL_PAD
            : undefined;
      scrollFieldIntoView(
        wrapRef,
        extraBottomPad != null ? { extraBottomPad } : undefined,
      );
    } else if (Platform.OS === 'web') {
      scrollFocusedWebInputIntoView();
    }
  };

  return (
    <View ref={wrapRef} style={fieldStyles.wrap} collapsable={false}>
      <Text style={fieldStyles.label}>
        {label}
        {required ? <Text style={fieldStyles.req}> *</Text> : null}
      </Text>
      <View
        style={[
          fieldStyles.inputShell,
          hasError && fieldStyles.inputShellError,
          multiline && fieldStyles.inputShellMultiline,
        ]}
      >
        <TextInput
          ref={inputRef}
          {...passwordAutofillProps}
          {...inputProps}
          multiline={multiline}
          returnKeyType={resolvedReturnKeyType}
          blurOnSubmit={resolvedBlurOnSubmit}
          onSubmitEditing={handleSubmitEditing}
          onFocus={handleFocus}
          style={[
            fieldStyles.input,
            multiline && fieldStyles.inputMultiline,
            trailing ? fieldStyles.inputWithTrailing : null,
            style,
          ]}
          placeholderTextColor={theme.placeholder}
        />
        {trailing}
      </View>
      {errorMessage ? (
        <Text style={fieldStyles.error} accessibilityRole="alert" accessibilityLiveRegion="polite">{errorMessage}</Text>
      ) : hintMessage ? (
        <Text style={fieldStyles.hint}>{hintMessage}</Text>
      ) : null}
    </View>
  );
});

function createFieldStyles(theme: SignUpTheme, dense: boolean, comfortable: boolean) {
  const text = createPulseSignUpTextStyles(theme);

  return StyleSheet.create({
    wrap: {
      marginBottom: comfortable ? 16 : dense ? 8 : 14,
    },
    label: comfortable
      ? {
          fontSize: 13,
          lineHeight: 18,
          fontWeight: '500',
          color: theme.text,
          marginBottom: 6,
        }
      : text.fieldLabel,
    req: {
      color: SIGNUP_ERROR_COLOR,
    },
    inputShell: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: PULSE_SIGNUP_RADIUS.input,
      backgroundColor: theme.bg,
      flexDirection: 'row',
      alignItems: 'center',
      position: 'relative',
      width: '100%',
      maxWidth: '100%',
      alignSelf: 'stretch',
      ...Platform.select({
        web: { boxSizing: 'border-box', overflow: 'visible' } as object,
        default: { overflow: 'hidden' as const },
      }),
    },
    inputShellMultiline: {
      alignItems: 'flex-start',
    },
    inputShellError: {
      borderColor: SIGNUP_ERROR_COLOR,
      backgroundColor: '#fef2f2',
    },
    input: {
      flex: 1,
      paddingHorizontal: 12,
      paddingVertical: Platform.OS === 'web' ? 9 : 10,
      ...text.input,
      minHeight: Platform.OS === 'web' ? 40 : 44,
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
      paddingRight: 4,
    },
    error: {
      ...text.error,
      marginTop: 6,
    },
    hint: {
      ...text.hint,
      marginTop: 6,
    },
  });
}
