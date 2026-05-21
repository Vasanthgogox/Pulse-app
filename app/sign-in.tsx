import Layout from '@/constants/Layout';
import { LoadingIndicator } from "@/components/LoadingIndicator";
import Theme from '@/constants/Theme';
import { useAuth } from '@/contexts/AuthContext';
import { useIsOnline } from '@/contexts/NetworkContext';
import { validateEmailRequired } from '@/lib/emailValidation';
import { getKeepSignedIn, setKeepSignedIn } from '@/lib/keepSignedInPreference';
import { ROUTES } from '@/lib/routes';
import { containsNullByte, validatePasswordForSignIn } from '@/lib/validation';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
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
    if (user) router.replace(ROUTES.INDEX);
  }, [user, router]);

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

  const renderSignIn = () => (
    <View style={[styles.panelShell, isDesktop && styles.panelShellDesktop]}>
      {isDesktop ? (
        <View style={styles.leftPanel}>
          <Text style={styles.leftLogo}>PULSE<Text style={styles.logoDot}>.</Text></Text>
          <Text style={styles.leftTag}>System Access</Text>
          <Text style={styles.leftTitle}>Welcome Back Commander.</Text>
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
        <Text style={[styles.formTitle, isDesktop && styles.formTitleDesktop]}>Sign in.</Text>
        <Text style={[styles.formSubtitle, isDesktop && styles.formSubtitleDesktop]}>
          Access your Pulse account dashboard.
        </Text>

        <TextInput
          value={email}
          onChangeText={(t) => {
            setSignInError(null);
            setPasswordResetBanner(false);
            setEmail(t);
          }}
          placeholder="Email Address"
          placeholderTextColor={isDesktop ? 'rgba(148,163,184,0.5)' : Theme.textMuted}
          style={[styles.input, isDesktop && styles.inputDesktop]}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="username"
          autoComplete="email"
          maxLength={255}
        />
        <View style={styles.passwordWrap}>
          <TextInput
            value={password}
            onChangeText={(t) => {
              setSignInError(null);
              setPassword(t);
            }}
            placeholder="Your Password"
            placeholderTextColor={isDesktop ? 'rgba(148,163,184,0.5)' : Theme.textMuted}
            style={[styles.input, isDesktop && styles.inputDesktop]}
            secureTextEntry={!showPass}
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="password"
            autoComplete="password"
            maxLength={128}
          />
          <Pressable onPress={() => setShowPass((v) => !v)} style={styles.eyeBtn}>
            <FontAwesome name={showPass ? 'eye-slash' : 'eye'} size={18} color={Theme.textMuted} />
          </Pressable>
        </View>
        {passwordResetBanner ? (
          <Text style={styles.successBanner}>Password updated. Sign in with your new password.</Text>
        ) : null}
        {signInError || restoreError ? (
          <Text style={styles.errorText}>
            {signInError ?? restoreError?.message ?? 'Could not restore your session. Sign in again.'}
          </Text>
        ) : null}

        <View style={styles.rowBetween}>
          <TouchableOpacity
            style={styles.keepRow}
            onPress={() => {
              const next = !keepSignedIn;
              setKeepSignedInState(next);
              void setKeepSignedIn(next);
            }}
          >
            <FontAwesome
              name={keepSignedIn ? 'check-square' : 'square-o'}
              size={18}
              color={keepSignedIn ? Theme.driverPrimary : Theme.textMuted}
            />
            <Text style={[styles.keepText, isDesktop && styles.keepTextDesktop]}>Remember Me</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() =>
              router.push(
                `${ROUTES.FORGOT_PASSWORD}?email=${encodeURIComponent(email.trim())}` as Href,
              )
            }
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.forgotText}>Forgot password?</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          testID="signin-submit-btn"
          onPress={handleSignIn}
          style={[styles.primaryBtn, (loading || waitingForAuthState || !isOnline) && styles.disabledBtn]}
          disabled={loading || waitingForAuthState || !isOnline}
        >
          {loading || waitingForAuthState ? (
            <LoadingIndicator color={Theme.textOnPrimary} />
          ) : (
            <Text style={styles.primaryBtnText}>Enter Dashboard</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleGoogleSignIn}
          style={[styles.googleBtn, (googleLoading || loading || waitingForAuthState || !isOnline) && styles.disabledBtn]}
          disabled={googleLoading || loading || waitingForAuthState || !isOnline}
        >
          {googleLoading ? (
            <LoadingIndicator color={Theme.textPrimaryDark} />
          ) : (
            <>
              <FontAwesome name="google" size={14} color={Theme.textPrimaryDark} />
              <Text style={styles.googleBtnText}>Continue with Google</Text>
            </>
          )}
        </TouchableOpacity>

        <View style={styles.signUpRow}>
          <Text style={[styles.signUpMuted, isDesktop && styles.signUpMutedDesktop]}>New to Pulse? </Text>
          <TouchableOpacity onPress={() => router.push(ROUTES.SIGN_UP)} activeOpacity={0.8}>
            <Text style={styles.signUpLink}>Create account</Text>
          </TouchableOpacity>
        </View>
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

      <TouchableOpacity onPress={() => router.replace(ROUTES.WELCOME)} style={styles.backFloating}>
        <FontAwesome name="chevron-left" size={14} color={Theme.textMuted} />
        <Text style={styles.backFloatingText}>Back</Text>
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
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
    borderRadius: 10,
    paddingVertical: 10,
    marginTop: 8,
    marginBottom: 10,
  },
  offlineText: {
    textAlign: 'center',
    color: Theme.negative,
    fontSize: 12,
    fontWeight: '700',
  },
  panelShell: {
    flex: 1,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Theme.border,
    overflow: 'hidden',
    flexDirection: 'row',
    backgroundColor: Theme.screenBackground,
  },
  panelShellDesktop: {
    borderRadius: 0,
    borderWidth: 0,
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
    fontSize: 44,
    fontWeight: '900',
    fontStyle: 'italic',
    letterSpacing: -1.1,
    color: Theme.textOnDark,
    marginBottom: 14,
  },
  leftTag: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 2,
    fontWeight: '700',
    color: 'rgba(148,163,184,0.75)',
    marginBottom: 18,
  },
  leftTitle: {
    fontSize: 40,
    fontWeight: '900',
    color: Theme.textOnDark,
    letterSpacing: -0.8,
    marginBottom: 12,
  },
  leftSubtitle: {
    fontSize: 15,
    lineHeight: 24,
    color: 'rgba(148,163,184,0.75)',
    maxWidth: 420,
  },
  rightPanel: {
    flex: 1,
    paddingHorizontal: 24,
    paddingVertical: 24,
    justifyContent: 'center',
    backgroundColor: Theme.screenBackground,
  },
  rightPanelDesktop: {
    paddingHorizontal: 48,
    paddingVertical: 48,
    backgroundColor: '#ffffff',
    overflow: 'hidden',
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
  formTitle: {
    fontSize: 44,
    fontWeight: '900',
    color: Theme.textPrimaryDark,
    letterSpacing: -0.8,
  },
  formTitleDesktop: {
    color: Theme.textPrimaryDark,
  },
  formSubtitle: {
    marginTop: 6,
    marginBottom: 18,
    fontSize: 14,
    color: Theme.textMuted,
  },
  formSubtitleDesktop: {
    color: Theme.textSecondary,
  },
  input: {
    backgroundColor: Theme.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: Theme.textPrimaryDark,
    marginBottom: 12,
  },
  inputDesktop: {
    backgroundColor: '#f8fafc',
    borderColor: Theme.border,
    color: Theme.textPrimaryDark,
  },
  passwordWrap: {
    position: 'relative',
  },
  eyeBtn: {
    position: 'absolute',
    right: 14,
    top: 14,
  },
  errorText: {
    color: Theme.negative,
    marginBottom: 8,
    fontSize: 13,
    fontWeight: '600',
  },
  successBanner: {
    color: Theme.positive,
    marginBottom: 10,
    fontSize: 13,
    fontWeight: '600',
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
    marginBottom: 10,
  },
  keepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  keepText: {
    fontSize: 12,
    color: Theme.textMuted,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  keepTextDesktop: {
    color: Theme.textSecondary,
  },
  forgotText: {
    fontSize: 12,
    color: Theme.driverPrimary,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  primaryBtn: {
    marginTop: 6,
    backgroundColor: Theme.driverPrimary,
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: 'center',
  },
  disabledBtn: {
    opacity: 0.6,
  },
  primaryBtnText: {
    color: Theme.textOnPrimary,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  googleBtn: {
    marginTop: 10,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    backgroundColor: Theme.networkCardBackground,
  },
  googleBtnText: {
    color: Theme.textPrimaryDark,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  logoDot: {
    color: Theme.driverPrimary,
  },
  backFloating: {
    position: 'absolute',
    left: 18,
    bottom: 16,
    backgroundColor: Theme.surface,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Theme.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  backFloatingText: {
    color: Theme.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  signUpRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
  },
  signUpMuted: {
    fontSize: 13,
    color: Theme.textMuted,
    fontWeight: '500',
  },
  signUpMutedDesktop: {
    color: Theme.textSecondary,
  },
  signUpLink: {
    fontSize: 13,
    color: Theme.driverPrimary,
    fontWeight: '700',
  },
});
