import FontAwesome from '@expo/vector-icons/FontAwesome';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import {
  OnboardingFocusedField,
  OnboardingFullPageFormStep,
  OnboardingKeypadAltRow,
} from '@/features/onboarding';
import { OperationalButton } from '@/components/operational';
import { colors } from '@/design-system/colors';
import { C, styles } from '../businessSignUp.styles';
import type { SignUpFlow } from '../hooks/useBusinessSignUpFlow';

export function AccountStep({ flow }: { flow: SignUpFlow }) {
  return (
    <OnboardingFullPageFormStep
      title="Secure your account"
      subtitle="Final credentials before workspace activation."
      eyebrow="Account"
      primaryLabel="Activate account"
      onPrimary={flow.createAccount}
      primaryDisabled={flow.loading || flow.googleLoading}
      primaryLoading={flow.loading}
      footerAccessory={
        <OnboardingKeypadAltRow>
          <OperationalButton
            intent="utility"
            label="Continue with Google"
            onPress={flow.continueWithGoogle}
            disabled={flow.loading || flow.googleLoading}
            loading={flow.googleLoading}
            fullWidth
            icon={<FontAwesome name="google" size={14} color={colors.textPrimary} />}
          />
        </OnboardingKeypadAltRow>
      }
    >
      <OnboardingFocusedField
        label="Full name"
        value={flow.fullName}
        onChangeText={flow.setFullName}
        placeholder="Your name"
        autoCapitalize="words"
        editable={!flow.loading}
        errorMessage={flow.step5Attempted ? flow.step5Errors.fullName : null}
      />

      <OnboardingFocusedField
        label="Email address"
        value={flow.email}
        onChangeText={flow.setEmail}
        placeholder="you@example.com"
        keyboardType="email-address"
        autoCapitalize="none"
        editable={!flow.loading}
        errorMessage={flow.step5Attempted ? flow.step5Errors.email : null}
      />

      <View style={styles.fieldGroup}>
        <Text
          style={[
            styles.label,
            flow.step5Attempted && flow.step5Errors.password ? styles.labelError : null,
          ]}
        >
          Password <Text style={styles.req}>*</Text>
        </Text>
        <View style={styles.passwordRow}>
          <TextInput
            style={[
              styles.inputPassword,
              flow.step5Attempted && flow.step5Errors.password ? styles.inputError : null,
            ]}
            placeholder="At least 6 characters"
            placeholderTextColor={C.placeholder}
            value={flow.password}
            onChangeText={flow.setPassword}
            secureTextEntry={!flow.showPassword}
            editable={!flow.loading}
          />
          <TouchableOpacity onPress={flow.toggleShowPassword} style={styles.eyeBtn}>
            <FontAwesome
              name={flow.showPassword ? 'eye-slash' : 'eye'}
              size={18}
              color={C.muted}
            />
          </TouchableOpacity>
        </View>
        <View style={[styles.strengthWrap, { opacity: flow.password.length >= 6 ? 1 : 0 }]}>
          <View style={styles.strengthBar}>
            {([1, 2, 3, 4] as const).map((seg) => (
              <View
                key={seg}
                style={[
                  styles.strengthSeg,
                  flow.passwordStrength >= seg &&
                    (flow.passwordStrength <= 1
                      ? styles.strengthWeak
                      : flow.passwordStrength === 2
                        ? styles.strengthFair
                        : flow.passwordStrength === 3
                          ? styles.strengthGood
                          : styles.strengthStrong),
                ]}
              />
            ))}
          </View>
        </View>
        {flow.step5Attempted && flow.step5Errors.password ? (
          <Text style={styles.fieldError}>{flow.step5Errors.password}</Text>
        ) : null}
      </View>

      <View style={styles.fieldGroup}>
        <Text
          style={[
            styles.label,
            (flow.step5Attempted && flow.step5Errors.confirmPassword) || flow.confirmMismatch
              ? styles.labelError
              : null,
          ]}
        >
          Confirm password <Text style={styles.req}>*</Text>
        </Text>
        <View style={styles.passwordRow}>
          <TextInput
            style={[
              styles.inputPassword,
              (flow.step5Attempted && flow.step5Errors.confirmPassword) || flow.confirmMismatch
                ? styles.inputError
                : flow.confirmPassword.length > 0 &&
                    !flow.confirmMismatch &&
                    flow.password === flow.confirmPassword
                  ? styles.inputSuccess
                  : null,
            ]}
            placeholder="Re-enter password"
            placeholderTextColor={C.placeholder}
            value={flow.confirmPassword}
            onChangeText={flow.setConfirmPassword}
            secureTextEntry={!flow.showConfirmPassword}
            editable={!flow.loading}
            onFocus={flow.scrollConfirmPasswordIntoView}
          />
          <TouchableOpacity onPress={flow.toggleShowConfirmPassword} style={styles.eyeBtn}>
            <FontAwesome
              name={flow.showConfirmPassword ? 'eye-slash' : 'eye'}
              size={18}
              color={C.muted}
            />
          </TouchableOpacity>
        </View>
        {flow.confirmMismatch ? (
          <Text style={styles.fieldError}>Passwords do not match.</Text>
        ) : flow.confirmPassword.length > 0 && flow.password === flow.confirmPassword ? (
          <Text style={styles.fieldSuccess}>Passwords match.</Text>
        ) : flow.step5Attempted && flow.step5Errors.confirmPassword ? (
          <Text style={styles.fieldError}>{flow.step5Errors.confirmPassword}</Text>
        ) : null}
      </View>
    </OnboardingFullPageFormStep>
  );
}
