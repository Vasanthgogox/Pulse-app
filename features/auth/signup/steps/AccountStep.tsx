import { GoogleBrandIcon } from '@/features/auth/components/GoogleBrandIcon';
import { Eye, EyeOff } from 'lucide-react-native';
import { Pressable, StyleSheet, Text } from 'react-native';

import type { SignUpFlow } from '../hooks/useBusinessSignUpFlow';
import { SignUpPulseField } from '../SignUpPulseField';
import { SignUpPulseFormStep } from '../SignUpPulseFormStep';
import { SIGNUP_ACCOUNT_MOBILE_SCROLL_PAD, SIGNUP_ACCOUNT_SCROLL_PAD } from '../signUpConstants';
import { PULSE_SIGNUP } from '../signUpPulseTheme';
import { SIGNUP_TEXT } from '../signUpTypography';

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
      primaryDisabled={!canSubmit}
      primaryLoading={flow.loading}
      inlinePrimary={flow.isDesktop}
      keyboardAware
      scrollRef={flow.accountScrollRef}
      scrollPaddingBottom={
        flow.isDesktop ? SIGNUP_ACCOUNT_SCROLL_PAD : SIGNUP_ACCOUNT_MOBILE_SCROLL_PAD
      }
      footerAccessory={
        flow.isDesktop ? undefined : (
          <Pressable
            onPress={flow.continueWithGoogle}
            disabled={flow.loading || flow.googleLoading}
            style={({ pressed }) => [styles.googleBtn, pressed && styles.googlePressed]}
          >
            <GoogleBrandIcon size={18} />
            <Text style={SIGNUP_TEXT.google}>Continue with Google</Text>
          </Pressable>
        )
      }
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
        dense
        passwordField="new"
        value={flow.password}
        onChangeText={flow.setPassword}
        placeholder="At least 6 characters"
        secureTextEntry={!flow.showPassword}
        autoCorrect={false}
        spellCheck={false}
        maxLength={128}
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
        dense
        passwordField="confirm"
        value={flow.confirmPassword}
        onChangeText={flow.setConfirmPassword}
        placeholder="Re-enter password"
        secureTextEntry={!flow.showConfirmPassword}
        autoCorrect={false}
        spellCheck={false}
        maxLength={128}
        editable={!flow.loading}
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

      {flow.accountOrgConflictMessage ? (
        <SignUpPulseField
          label="Workspace Name"
          required
          value={flow.orgName}
          onChangeText={flow.setOrgName}
          placeholder="Your company name"
          autoCapitalize="words"
          editable={!flow.loading}
          errorMessage={flow.accountOrgConflictMessage}
        />
      ) : null}

      {flow.isDesktop ? (
        <Pressable
          onPress={flow.continueWithGoogle}
          disabled={flow.loading || flow.googleLoading}
          style={({ pressed }) => [styles.googleBtn, pressed && styles.googlePressed]}
        >
          <GoogleBrandIcon size={18} />
          <Text style={SIGNUP_TEXT.google}>Continue with Google</Text>
        </Pressable>
      ) : null}
    </SignUpPulseFormStep>
  );
}

const styles = StyleSheet.create({
  eyeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: PULSE_SIGNUP.border,
    backgroundColor: PULSE_SIGNUP.bg,
  },
  googlePressed: {
    backgroundColor: PULSE_SIGNUP.surface,
  },
});
