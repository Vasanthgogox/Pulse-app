import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Eye, EyeOff } from 'lucide-react-native';
import { Pressable, StyleSheet, Text } from 'react-native';

import type { SignUpFlow } from '../hooks/useBusinessSignUpFlow';
import { SignUpPulseField } from '../SignUpPulseField';
import { SignUpPulseFormStep } from '../SignUpPulseFormStep';
import { SignUpPulsePrimaryButton } from '../SignUpPulsePrimaryButton';
import { PULSE_SIGNUP } from '../signUpPulseTheme';

export function AccountStep({ flow }: { flow: SignUpFlow }) {
  const canSubmit =
    !!flow.fullName.trim() &&
    !!flow.email.trim() &&
    flow.password.length >= 6 &&
    flow.password === flow.confirmPassword &&
    !flow.loading &&
    !flow.googleLoading;

  return (
    <SignUpPulseFormStep
      title="Create account"
      subtitle="Enter your email and password to finish."
      primaryLabel="Create account"
      onPrimary={flow.createAccount}
      inlinePrimary
    >
      <SignUpPulseField
        label="Full Name"
        required
        value={flow.fullName}
        onChangeText={flow.setFullName}
        placeholder="Your name"
        autoCapitalize="words"
        editable={!flow.loading}
        errorMessage={flow.step5Attempted ? flow.step5Errors.fullName : null}
      />

      <SignUpPulseField
        label="Email Address"
        required
        value={flow.email}
        onChangeText={flow.setEmail}
        placeholder="you@example.com"
        keyboardType="email-address"
        autoCapitalize="none"
        editable={!flow.loading}
        errorMessage={flow.step5Attempted ? flow.step5Errors.email : null}
      />

      <SignUpPulseField
        label="Password"
        required
        value={flow.password}
        onChangeText={flow.setPassword}
        placeholder="At least 6 characters"
        secureTextEntry={!flow.showPassword}
        editable={!flow.loading}
        errorMessage={flow.step5Attempted ? flow.step5Errors.password : null}
        trailing={
          <Pressable onPress={flow.toggleShowPassword} style={styles.eyeBtn} hitSlop={8}>
            {flow.showPassword ? (
              <EyeOff size={18} color={PULSE_SIGNUP.muted} />
            ) : (
              <Eye size={18} color={PULSE_SIGNUP.muted} />
            )}
          </Pressable>
        }
      />

      <SignUpPulseField
        label="Confirm Password"
        required
        value={flow.confirmPassword}
        onChangeText={flow.setConfirmPassword}
        placeholder="Re-enter password"
        secureTextEntry={!flow.showConfirmPassword}
        editable={!flow.loading}
        onFocus={flow.scrollConfirmPasswordIntoView}
        errorMessage={
          flow.confirmMismatch
            ? 'Passwords do not match.'
            : flow.step5Attempted
              ? flow.step5Errors.confirmPassword
              : null
        }
        trailing={
          <Pressable onPress={flow.toggleShowConfirmPassword} style={styles.eyeBtn} hitSlop={8}>
            {flow.showConfirmPassword ? (
              <EyeOff size={18} color={PULSE_SIGNUP.muted} />
            ) : (
              <Eye size={18} color={PULSE_SIGNUP.muted} />
            )}
          </Pressable>
        }
      />

      <SignUpPulsePrimaryButton
        label="Create account"
        onPress={flow.createAccount}
        disabled={!canSubmit}
        loading={flow.loading}
        style={styles.createBtn}
      />

      <Pressable
        onPress={flow.continueWithGoogle}
        disabled={flow.loading || flow.googleLoading}
        style={({ pressed }) => [styles.googleBtn, pressed && styles.googlePressed]}
      >
        <FontAwesome name="google" size={18} color="#4285F4" />
        <Text style={styles.googleText}>Continue with Google</Text>
      </Pressable>
    </SignUpPulseFormStep>
  );
}

const styles = StyleSheet.create({
  eyeBtn: {
    position: 'absolute',
    right: 14,
    top: 16,
    padding: 4,
  },
  createBtn: {
    marginTop: 8,
    marginBottom: 12,
  },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: PULSE_SIGNUP.border,
    backgroundColor: PULSE_SIGNUP.bg,
    marginBottom: 8,
  },
  googlePressed: {
    backgroundColor: PULSE_SIGNUP.surface,
  },
  googleText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#374151',
  },
});
