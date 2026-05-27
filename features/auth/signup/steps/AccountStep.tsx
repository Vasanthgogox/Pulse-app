import { LoadingIndicator } from '@/components/LoadingIndicator';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';

import { C, styles } from '../businessSignUp.styles';
import type { SignUpFlow } from '../hooks/useBusinessSignUpFlow';

export function AccountStep({ flow }: { flow: SignUpFlow }) {
  return (
    <>
      <Text style={styles.pageTitle}>Create account</Text>
      <Text style={styles.pageSub}>Enter your email and password to finish.</Text>

      <View style={styles.fieldGroup}>
        <Text style={[styles.label, flow.step4Attempted && flow.step4Errors.fullName ? styles.labelError : null]}>
          Full name <Text style={styles.req}>*</Text>
        </Text>
        <TextInput
          style={[styles.input, flow.step4Attempted && flow.step4Errors.fullName ? styles.inputError : null]}
          placeholder="Your name"
          placeholderTextColor={C.placeholder}
          value={flow.fullName}
          onChangeText={flow.setFullName}
          autoCapitalize="words"
          editable={!flow.loading}
        />
        {flow.step4Attempted && flow.step4Errors.fullName
          ? <Text style={styles.fieldError}>{flow.step4Errors.fullName}</Text>
          : null}
      </View>

      <View style={styles.fieldGroup}>
        <Text style={[styles.label, flow.step4Attempted && flow.step4Errors.email ? styles.labelError : null]}>
          Email address <Text style={styles.req}>*</Text>
        </Text>
        <TextInput
          style={[styles.input, flow.step4Attempted && flow.step4Errors.email ? styles.inputError : null]}
          placeholder="you@example.com"
          placeholderTextColor={C.placeholder}
          value={flow.email}
          onChangeText={flow.setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          editable={!flow.loading}
        />
        {flow.step4Attempted && flow.step4Errors.email
          ? <Text style={styles.fieldError}>{flow.step4Errors.email}</Text>
          : null}
      </View>

      <View style={styles.fieldGroup}>
        <Text style={[styles.label, flow.step4Attempted && flow.step4Errors.password ? styles.labelError : null]}>
          Password <Text style={styles.req}>*</Text>
        </Text>
        <View style={styles.passwordRow}>
          <TextInput
            style={[styles.inputPassword, flow.step4Attempted && flow.step4Errors.password ? styles.inputError : null]}
            placeholder="At least 6 characters"
            placeholderTextColor={C.placeholder}
            value={flow.password}
            onChangeText={flow.setPassword}
            secureTextEntry={!flow.showPassword}
            editable={!flow.loading}
          />
          <TouchableOpacity onPress={flow.toggleShowPassword} style={styles.eyeBtn}>
            <FontAwesome name={flow.showPassword ? 'eye-slash' : 'eye'} size={18} color={C.muted} />
          </TouchableOpacity>
        </View>

        <View style={[styles.strengthWrap, { opacity: flow.password.length >= 6 ? 1 : 0 }]}>
          <View style={styles.strengthBar}>
            {([1, 2, 3, 4] as const).map(seg => (
              <View
                key={seg}
                style={[
                  styles.strengthSeg,
                  flow.passwordStrength >= seg && (
                    flow.passwordStrength <= 1 ? styles.strengthWeak :
                    flow.passwordStrength === 2 ? styles.strengthFair :
                    flow.passwordStrength === 3 ? styles.strengthGood :
                    styles.strengthStrong
                  ),
                ]}
              />
            ))}
          </View>
          <Text style={[
            styles.strengthLabel,
            flow.passwordStrength <= 1 ? styles.strengthLabelWeak :
            flow.passwordStrength === 2 ? styles.strengthLabelFair :
            flow.passwordStrength === 3 ? styles.strengthLabelGood :
            styles.strengthLabelStrong,
          ]}>
            {flow.passwordStrength <= 1 ? 'Weak' :
             flow.passwordStrength === 2 ? 'Fair' :
             flow.passwordStrength === 3 ? 'Good' : 'Strong'}
          </Text>
        </View>

        {flow.step4Attempted && flow.step4Errors.password
          ? <Text style={styles.fieldError}>{flow.step4Errors.password}</Text>
          : null}
      </View>

      <View style={styles.fieldGroup}>
        <Text style={[
          styles.label,
          (flow.step4Attempted && flow.step4Errors.confirmPassword) || flow.confirmMismatch
            ? styles.labelError : null,
        ]}>
          Confirm password <Text style={styles.req}>*</Text>
        </Text>
        <View style={styles.passwordRow}>
          <TextInput
            style={[
              styles.inputPassword,
              (flow.step4Attempted && flow.step4Errors.confirmPassword) || flow.confirmMismatch
                ? styles.inputError
                : flow.confirmPassword.length > 0 && !flow.confirmMismatch && flow.password === flow.confirmPassword
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
            <FontAwesome name={flow.showConfirmPassword ? 'eye-slash' : 'eye'} size={18} color={C.muted} />
          </TouchableOpacity>
        </View>
        {flow.confirmMismatch ? (
          <Text style={styles.fieldError}>Passwords do not match.</Text>
        ) : flow.confirmPassword.length > 0 && flow.password === flow.confirmPassword ? (
          <Text style={styles.fieldSuccess}>Passwords match.</Text>
        ) : flow.step4Attempted && flow.step4Errors.confirmPassword ? (
          <Text style={styles.fieldError}>{flow.step4Errors.confirmPassword}</Text>
        ) : null}
      </View>

      <TouchableOpacity
        style={[styles.primaryBtn, flow.loading && styles.primaryBtnDisabled]}
        onPress={flow.createAccount}
        disabled={flow.loading || flow.googleLoading}
      >
        {flow.loading
          ? <LoadingIndicator color="#fff" />
          : <Text style={styles.primaryBtnText}>Create account</Text>}
      </TouchableOpacity>

      <View style={styles.altRow}>
        <Text style={styles.altText}>or</Text>
      </View>

      <TouchableOpacity
        style={[styles.googleBtn, (flow.loading || flow.googleLoading) && styles.primaryBtnDisabled]}
        onPress={flow.continueWithGoogle}
        disabled={flow.loading || flow.googleLoading}
      >
        {flow.googleLoading
          ? <LoadingIndicator color={C.text} />
          : <>
              <FontAwesome name="google" size={14} color={C.text} />
              <Text style={styles.googleBtnText}>Continue with Google</Text>
            </>}
      </TouchableOpacity>
    </>
  );
}
