import { LoadingIndicator } from '@/components/LoadingIndicator';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useRouter } from 'expo-router';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';

import { C, styles } from '../businessSignUp.styles';
import type { SignUpFlow } from '../hooks/useBusinessSignUpFlow';

export function PhoneStep({ flow }: { flow: SignUpFlow }) {
  const router = useRouter();
  return (
    <>
      <Text style={[styles.pageTitle, styles.pageTitleWelcome]}>Welcome aboard for business</Text>
      <Text style={styles.pageSub}>Enter your Indian mobile number to get started.</Text>

      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Mobile number</Text>
        <View style={[
          styles.phoneRow,
          (flow.phoneInlineError || (flow.phoneExistsCheck?.exists && !flow.phoneExistsCheck?.loading))
            && styles.phoneRowError,
        ]}>
          <Text style={styles.flag}>🇮🇳</Text>
          <Text style={styles.dialCode}>+91</Text>
          <TextInput
            style={styles.phoneInput}
            placeholder="000 000 0000"
            placeholderTextColor={C.placeholder}
            value={flow.phone}
            onChangeText={flow.setPhone}
            keyboardType="phone-pad"
            maxLength={10}
            editable={!flow.loading}
          />
        </View>
        {flow.phoneInlineError ? <Text style={styles.fieldError}>{flow.phoneInlineError}</Text> : null}
        {flow.phoneExistsCheck?.loading
          ? <Text style={styles.fieldHint}>Checking...</Text>
          : (!flow.phoneExistsCheck?.loading && flow.phoneExistsCheck?.exists)
            ? <Text style={styles.fieldHint}>This number is already registered.</Text>
            : null}
      </View>

      <TouchableOpacity
        style={[
          styles.primaryBtn,
          (!flow.phoneValid || flow.loading || flow.phoneExistsCheck?.loading) && styles.primaryBtnDisabled,
        ]}
        onPress={flow.continuePhone}
        disabled={!flow.phoneValid || flow.loading || flow.googleLoading || !!flow.phoneExistsCheck?.loading}
      >
        {flow.loading || flow.phoneExistsCheck?.loading
          ? <LoadingIndicator color="#fff" />
          : <Text style={styles.primaryBtnText}>Send OTP</Text>}
      </TouchableOpacity>

      <View style={styles.altRow}>
        <Text style={styles.altText}>or</Text>
      </View>

      <TouchableOpacity
        style={[styles.googleBtn, (flow.loading || flow.googleLoading || !flow.isOnline) && styles.primaryBtnDisabled]}
        onPress={flow.continueWithGoogleFromWelcome}
        disabled={flow.loading || flow.googleLoading || !flow.isOnline}
      >
        {flow.googleLoading
          ? <LoadingIndicator color={C.text} />
          : <>
              <FontAwesome name="google" size={14} color={C.text} />
              <Text style={styles.googleBtnText}>Continue with Google</Text>
            </>}
      </TouchableOpacity>

      <View style={styles.altRow}>
        <Text style={styles.altText}>Already have an account? </Text>
        <TouchableOpacity onPress={() => router.replace('/sign-in')}>
          <Text style={styles.altLink}>Sign in</Text>
        </TouchableOpacity>
      </View>
    </>
  );
}
