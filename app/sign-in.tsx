import Layout from '@/constants/Layout';
import Theme from '@/constants/Theme';
import { GoogleBrandIcon } from '@/features/auth/components/GoogleBrandIcon';
import { SignUpPulseField } from '@/features/auth/signup/SignUpPulseField';
import { SignUpPulsePrimaryButton } from '@/features/auth/signup/SignUpPulsePrimaryButton';
import { SignUpPulseTitle } from '@/features/auth/signup/SignUpPulseTitle';
import { DRIVER_SIGNUP } from '@/features/auth/signup/signUpDriverTheme';
import { PULSE_SIGNUP_RADIUS } from '@/features/auth/signup/signUpPulseTheme';
import { signUpMobileContentInner } from '@/features/auth/signup/signUpMobile.styles';
import { useAuth } from '@/contexts/AuthContext';
import { useIsOnline } from '@/contexts/NetworkContext';
import { validateEmailRequired } from '@/lib/emailValidation';
import { getKeepSignedIn, setKeepSignedIn } from '@/lib/keepSignedInPreference';
import { ROUTES } from '@/lib/routes';
import { containsNullByte, validatePasswordForSignIn } from '@/lib/validation';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Eye, EyeOff } from 'lucide-react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function getEmailFromParams(params: { email?: string | string[] }): string {
  const e = params.email;
  if (typeof e === 'string') return e;
  if (Array.isArray(e) && e[0]) return e[0];
  return '';
}

function getOAuthErrorFromParams(params: { oauth_error?: string | string[] }): string {
  const e = params.oauth_error;
  const raw = typeof e === 'string' ? e : Array.isArray(e) && e[0] ? e[0] : '';
  if (!raw) return '';
  // OAuth error_description can be long or odd-shaped; keep UI safe and bounded.
  const cleaned = raw.replace(/\0/g, '').trim().slice(0, 400);
  return cleaned;
}

export default function SignIn() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{
    email?: string | string[];
    oauth_error?: string | string[];
    password_reset?: string | string[];
    returnTo?: string | string[];
  }>();
  const isOnline = useIsOnline();
  const { user, signIn, signInWithGoogle, restoreError, clearRestoreError } = useAuth();
  const [webViewportWidth, setWebViewportWidth] = useState<number>(() => {
    if (Platform.OS !== 'web') return 0;
    if (typeof window === 'undefined') return 1280;
    return window.innerWidth || 1280;
  });
  const [webHasFinePointer, setWebHasFinePointer] = useState<boolean>(() => {
    if (Platform.OS !== 'web') return false;
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
    return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  });

  const [email, setEmail] = useState(() => getEmailFromParams(params));
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [keepSignedIn, setKeepSignedInState] = useState(true);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [waitingForAuthState, setWaitingForAuthState] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);
  const [passwordResetBanner, setPasswordResetBanner] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const updatePointerMode = () => {
      if (typeof window.matchMedia !== 'function') {
        setWebHasFinePointer(true);
        return;
      }
      setWebHasFinePointer(window.matchMedia('(hover: hover) and (pointer: fine)').matches);
    };
    const handleResize = () => {
      setWebViewportWidth(window.innerWidth || 1280);
      updatePointerMode();
    };
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    handleResize();
    updatePointerMode();
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  // Keep mobile browsers in stacked mode even when they report wider CSS widths.
  const isDesktop = Platform.OS === 'web' ? webViewportWidth >= 1024 && webHasFinePointer : false;

  useEffect(() => {
    let mounted = true;
    getKeepSignedIn().then((keep) => {
      if (mounted) setKeepSignedInState(keep);
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (user) {
      const returnTo = typeof params.returnTo === 'string' ? decodeURIComponent(params.returnTo) : null;
      router.replace((returnTo ?? ROUTES.INDEX) as Href);
    }
  }, [user, router, params.returnTo]);

  useEffect(() => {
    const next = getEmailFromParams(params);
    if (next) setEmail(next);
  }, [params.email]);

  useEffect(() => {
    const oauthError = getOAuthErrorFromParams(params);
    if (oauthError) setSignInError(oauthError);
  }, [params.oauth_error]);

  useEffect(() => {
    const v = params.password_reset;
    const flag = typeof v === 'string' ? v : Array.isArray(v) && v[0] ? v[0] : '';
    setPasswordResetBanner(flag === '1');
  }, [params.password_reset]);

  const handleSignIn = async () => {
    setSignInError(null);
    clearRestoreError();
    setWaitingForAuthState(false);
    if (!isOnline) {
      setSignInError('Connect to the internet to sign in.');
      return;
    }
    const emailErr = validateEmailRequired(email);
    if (emailErr) {
      setSignInError(emailErr);
      return;
    }
    const trimmedEmail = email.trim();
    if (containsNullByte(trimmedEmail) || containsNullByte(password)) {
      setSignInError('Input contains invalid characters.');
      return;
    }
    const pwdErr = validatePasswordForSignIn(password);
    if (pwdErr) {
      setSignInError(pwdErr);
      return;
    }

    try {
      setLoading(true);
      const { error } = await signIn(trimmedEmail, password, keepSignedIn);
      if (error) {
        setSignInError(error.message);
        return;
      }
      setWaitingForAuthState(true);
    } catch {
      const msg = 'Sign in failed. Please try again.';
      setSignInError(msg);
      Alert.alert('Sign in failed', msg);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setSignInError(null);
    clearRestoreError();
    setWaitingForAuthState(false);
    if (!isOnline) {
      setSignInError("Connect to the internet to sign in.");
      return;
    }
    try {
      setGoogleLoading(true);
      const { error } = await signInWithGoogle(keepSignedIn);
      if (error) {
        setSignInError(error.message);
        return;
      }
      setWaitingForAuthState(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Google sign in failed.";
      setSignInError(msg);
      Alert.alert("Sign in failed", msg);
    } finally {
      setGoogleLoading(false);
    }
  };

  const formDisabled = loading || waitingForAuthState || !isOnline;

  const renderSignInForm = () => (
  <>
    <SignUpPulseTitle
      title="Sign in"
      subtitle="Access your Pulse account dashboard."
      centered={isDesktop}
      compact
    />

    <SignUpPulseField
      label="Email Address"
      theme={DRIVER_SIGNUP}
      value={email}
      onChangeText={(t) => {
        setSignInError(null);
        setPasswordResetBanner(false);
        setEmail(t);
      }}
      placeholder="you@example.com"
      autoCapitalize="none"
      autoCorrect={false}
      keyboardType="email-address"
      textContentType="username"
      autoComplete="email"
      maxLength={255}
      editable={!formDisabled}
    />

    <SignUpPulseField
      label="Password"
      theme={DRIVER_SIGNUP}
      value={password}
      onChangeText={(t) => {
        setSignInError(null);
        setPassword(t);
      }}
      placeholder="Your password"
      secureTextEntry={!showPass}
      autoCapitalize="none"
      autoCorrect={false}
      textContentType="password"
      autoComplete="password"
      maxLength={128}
      editable={!formDisabled}
      trailing={
        <Pressable onPress={() => setShowPass((v) => !v)} style={styles.eyeBtn} hitSlop={8}>
          {showPass ? (
            <EyeOff size={18} color={DRIVER_SIGNUP.muted} />
          ) : (
            <Eye size={18} color={DRIVER_SIGNUP.muted} />
          )}
        </Pressable>
      }
    />

    {passwordResetBanner ? (
      <Text style={styles.successBanner}>Password updated. Sign in with your new password.</Text>
    ) : null}
    {signInError || restoreError ? (
      <Text style={styles.errorText}>
        {signInError ?? restoreError?.message ?? 'Could not restore your session. Sign in again.'}
      </Text>
    ) : null}

    <View style={styles.rowBetween}>
      <Pressable
        style={styles.keepRow}
        onPress={() => {
          const next = !keepSignedIn;
          setKeepSignedInState(next);
          void setKeepSignedIn(next);
        }}
      >
        <FontAwesome
          name={keepSignedIn ? 'check-square' : 'square-o'}
          size={16}
          color={keepSignedIn ? DRIVER_SIGNUP.primary : DRIVER_SIGNUP.muted}
        />
        <Text style={styles.keepText}>Remember me</Text>
      </Pressable>
      <Pressable
        onPress={() =>
          router.push(
            `${ROUTES.FORGOT_PASSWORD}?email=${encodeURIComponent(email.trim())}` as Href,
          )
        }
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={styles.forgotText}>Forgot password?</Text>
      </Pressable>
    </View>

    <SignUpPulsePrimaryButton
      testID="signin-submit-btn"
      label="Enter dashboard"
      onPress={handleSignIn}
      disabled={formDisabled}
      loading={loading || waitingForAuthState}
      theme={DRIVER_SIGNUP}
      style={styles.primaryBtn}
    />

    <View style={styles.orRow}>
      <View style={styles.orLine} />
      <Text style={styles.orText}>or</Text>
      <View style={styles.orLine} />
    </View>

    <Pressable
      onPress={handleGoogleSignIn}
      disabled={googleLoading || formDisabled}
      style={({ pressed }) => [
        styles.googleBtn,
        (googleLoading || formDisabled) && styles.googleBtnDisabled,
        pressed && !googleLoading && !formDisabled && styles.googleBtnPressed,
      ]}
    >
      {googleLoading ? (
        <Text style={styles.googleBtnText}>Signing in…</Text>
      ) : (
        <>
          <GoogleBrandIcon size={18} />
          <Text style={styles.googleBtnText}>Continue with Google</Text>
        </>
      )}
    </Pressable>

    <View style={styles.signUpRow}>
      <Text style={styles.signUpMuted}>New to Pulse? </Text>
      <Pressable onPress={() => {
        const returnTo = typeof params.returnTo === 'string' ? params.returnTo : null;
        const dest = returnTo ? `${ROUTES.ONBOARDING.HUB}?returnTo=${returnTo}` : ROUTES.ONBOARDING.HUB;
        router.push(dest as '/');
      }}>
        <Text style={styles.signUpLink}>Create account</Text>
      </Pressable>
    </View>
  </>
  );

  const renderSignIn = () => (
    <View style={[styles.panelShell, isDesktop && styles.panelShellDesktop]}>
      {isDesktop ? (
        <View style={styles.leftPanel}>
          <Text style={styles.leftLogo}>PULSE<Text style={styles.logoDot}>.</Text></Text>
          <Text style={styles.leftTag}>System Access</Text>
          <Text style={styles.leftTitle}>Welcome back.</Text>
          <Text style={styles.leftSubtitle}>
            Your fleet is waiting. Log in to synchronize your logs and check earnings.
          </Text>
        </View>
      ) : null}
      <View style={[styles.rightPanel, isDesktop && styles.rightPanelDesktop]}>
        {isDesktop ? (
          <>
            <View style={styles.rightPanelOrbA} />
            <View style={styles.rightPanelOrbB} />
          </>
        ) : null}
        {isDesktop ? (
          <View style={styles.formColumn}>{renderSignInForm()}</View>
        ) : (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {renderSignInForm()}
          </ScrollView>
        )}
      </View>
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={[
        styles.container,
        isDesktop ? styles.containerDesktop : null,
        { paddingTop: insets.top, paddingBottom: insets.bottom },
      ]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 20 : 0}
    >
      {!isOnline ? (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineText}>No internet connection.</Text>
        </View>
      ) : null}

      {renderSignIn()}

      <Pressable
        onPress={() => router.replace(ROUTES.ONBOARDING.HUB)}
        style={[styles.backFloating, { bottom: insets.bottom + 12 }]}
      >
        <FontAwesome name="chevron-left" size={14} color={DRIVER_SIGNUP.muted} />
        <Text style={styles.backFloatingText}>Back</Text>
      </Pressable>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: DRIVER_SIGNUP.bg,
    paddingHorizontal: Layout.screenPaddingHorizontal,
  },
  containerDesktop: {
    backgroundColor: '#020617',
    paddingHorizontal: 0,
  },
  offlineBanner: {
    backgroundColor: Theme.negativeMuted,
    borderColor: Theme.negative,
    borderWidth: 1,
    borderRadius: PULSE_SIGNUP_RADIUS.pill,
    paddingVertical: 8,
    marginTop: 8,
    marginBottom: 8,
    marginHorizontal: Layout.screenPaddingHorizontal,
  },
  offlineText: {
    textAlign: 'center',
    color: Theme.negative,
    fontSize: 12,
    fontWeight: '600',
  },
  panelShell: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: DRIVER_SIGNUP.bg,
  },
  panelShellDesktop: {
    backgroundColor: '#020617',
  },
  leftPanel: {
    flex: 1,
    backgroundColor: '#000000',
    paddingHorizontal: 52,
    paddingVertical: 48,
    justifyContent: 'center',
  },
  leftLogo: {
    fontSize: 36,
    fontWeight: '900',
    fontStyle: 'italic',
    letterSpacing: -1,
    color: Theme.textOnDark,
    marginBottom: 12,
  },
  leftTag: {
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    fontWeight: '700',
    color: 'rgba(148,163,184,0.75)',
    marginBottom: 14,
  },
  leftTitle: {
    fontSize: 32,
    fontWeight: '900',
    color: Theme.textOnDark,
    letterSpacing: -0.6,
    marginBottom: 10,
  },
  leftSubtitle: {
    fontSize: 14,
    lineHeight: 22,
    color: 'rgba(148,163,184,0.75)',
    maxWidth: 420,
  },
  rightPanel: {
    flex: 1,
    backgroundColor: DRIVER_SIGNUP.bg,
  },
  rightPanelDesktop: {
    paddingHorizontal: 48,
    paddingVertical: 48,
    backgroundColor: '#ffffff',
    overflow: 'hidden',
    justifyContent: 'center',
  },
  formColumn: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: 24,
    ...signUpMobileContentInner,
  },
  rightPanelOrbA: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    top: -70,
    right: -50,
    backgroundColor: 'rgba(16,185,129,0.12)',
  },
  rightPanelOrbB: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    bottom: -90,
    left: -70,
    backgroundColor: 'rgba(15,23,42,0.06)',
  },
  eyeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  errorText: {
    color: Theme.negative,
    marginTop: -8,
    marginBottom: 12,
    fontSize: 12,
    fontWeight: '600',
  },
  successBanner: {
    color: Theme.positive,
    marginTop: -8,
    marginBottom: 12,
    fontSize: 12,
    fontWeight: '600',
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    marginTop: -4,
  },
  keepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  keepText: {
    fontSize: 12,
    color: DRIVER_SIGNUP.muted,
    fontWeight: '600',
  },
  forgotText: {
    fontSize: 12,
    color: DRIVER_SIGNUP.primary,
    fontWeight: '700',
  },
  primaryBtn: {
    marginTop: 0,
    marginBottom: 4,
  },
  orRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 14,
    gap: 12,
  },
  orLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: DRIVER_SIGNUP.border,
  },
  orText: {
    fontSize: 12,
    fontWeight: '600',
    color: DRIVER_SIGNUP.muted,
  },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    borderRadius: PULSE_SIGNUP_RADIUS.button,
    borderWidth: 1,
    borderColor: DRIVER_SIGNUP.border,
    backgroundColor: DRIVER_SIGNUP.bg,
    marginBottom: 4,
    minHeight: 48,
  },
  googleBtnDisabled: {
    opacity: 0.5,
  },
  googleBtnPressed: {
    backgroundColor: DRIVER_SIGNUP.surface,
  },
  googleBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: DRIVER_SIGNUP.text,
  },
  logoDot: {
    color: Theme.driverPrimary,
  },
  backFloating: {
    position: 'absolute',
    left: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  backFloatingText: {
    color: DRIVER_SIGNUP.muted,
    fontSize: 14,
    fontWeight: '600',
  },
  signUpRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
    paddingBottom: 8,
  },
  signUpMuted: {
    fontSize: 13,
    color: DRIVER_SIGNUP.muted,
    fontWeight: '500',
  },
  signUpLink: {
    fontSize: 13,
    color: DRIVER_SIGNUP.primary,
    fontWeight: '700',
  },
});
