import Layout from '@/constants/Layout';
import Theme from '@/constants/Theme';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useIsOnline } from '@/contexts/NetworkContext';
import { getKeepSignedIn, setKeepSignedIn } from '@/lib/keepSignedInPreference';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
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

type ScreenState = 'LANDING' | 'SIGNIN';

function getEmailFromParams(params: { email?: string | string[] }): string {
  const e = params.email;
  if (typeof e === 'string') return e;
  if (Array.isArray(e) && e[0]) return e[0];
  return '';
}

function getOAuthErrorFromParams(params: { oauth_error?: string | string[] }): string {
  const e = params.oauth_error;
  if (typeof e === 'string') return e;
  if (Array.isArray(e) && e[0]) return e[0];
  return '';
}

export default function SignIn() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string | string[]; direct?: string; oauth_error?: string | string[] }>();
  const isOnline = useIsOnline();
  const { user, signIn, signInWithGoogle } = useAuth();
  const { locale, localeOptions } = useLanguage();
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

  const [screen, setScreen] = useState<ScreenState>(
    Platform.OS === 'web' && !params.direct ? 'LANDING' : 'SIGNIN'
  );

  const [email, setEmail] = useState(() => getEmailFromParams(params));
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [keepSignedIn, setKeepSignedInState] = useState(true);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [waitingForAuthState, setWaitingForAuthState] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);
  const [typedPulse, setTypedPulse] = useState('');
  const businessIconPulse = useState(() => new Animated.Value(0))[0];
  const driverIconPulse = useState(() => new Animated.Value(0))[0];

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

  const currentLanguageLabel =
    localeOptions.find((o) => o.value === locale)?.labelNative ??
    localeOptions.find((o) => o.value === locale)?.label ??
    'English';

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
    if (user) router.replace('/');
  }, [user, router]);

  useEffect(() => {
    const next = getEmailFromParams(params);
    if (next) {
      setEmail(next);
      setScreen('SIGNIN');
    }
  }, [params.email]);

  useEffect(() => {
    const oauthError = getOAuthErrorFromParams(params);
    if (oauthError) {
      setSignInError(oauthError);
      setScreen('SIGNIN');
    }
  }, [params.oauth_error]);

  useEffect(() => {
    if (screen !== 'LANDING') {
      setTypedPulse('');
      return;
    }
    const full = 'PULSE';
    let idx = 0;
    setTypedPulse('');
    const timer = setInterval(() => {
      idx += 1;
      setTypedPulse(full.slice(0, idx));
      if (idx >= full.length) clearInterval(timer);
    }, 260);
    return () => clearInterval(timer);
  }, [screen]);

  useEffect(() => {
    if (screen !== 'LANDING') return;
    const runPulse = (value: Animated.Value, duration: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(value, {
            toValue: 1,
            duration,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(value, {
            toValue: 0,
            duration,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      );
    const businessAnim = runPulse(businessIconPulse, 1700);
    const driverAnim = runPulse(driverIconPulse, 2100);
    businessAnim.start();
    driverAnim.start();
    return () => {
      businessAnim.stop();
      driverAnim.stop();
      businessIconPulse.setValue(0);
      driverIconPulse.setValue(0);
    };
  }, [screen, businessIconPulse, driverIconPulse]);

  const handleSignIn = async () => {
    setSignInError(null);
    setWaitingForAuthState(false);
    if (!isOnline) {
      setSignInError('Connect to the internet to sign in.');
      return;
    }
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setSignInError('Enter email and password.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setSignInError('Enter a valid email.');
      return;
    }

    try {
      setLoading(true);
      const { error } = await signIn(trimmedEmail, password, keepSignedIn);
      if (error) {
        const isInvalid = error.message.toLowerCase().includes('invalid');
        setSignInError(isInvalid ? 'Incorrect email or password.' : error.message);
        return;
      }
      setWaitingForAuthState(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Sign in failed.';
      setSignInError(msg);
      Alert.alert('Sign in failed', msg);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setSignInError(null);
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

  const renderLanding = () => (
    <View style={[styles.landingWrap, isDesktop && styles.landingWrapDesktop]}>
      <TouchableOpacity
        style={[styles.modeCard, styles.businessCard]}
        activeOpacity={0.9}
        onPress={() => router.push('/sign-up')}
      >
        <Animated.View
          style={{
            transform: [
              {
                scale: businessIconPulse.interpolate({
                  inputRange: [0, 1],
                  outputRange: [1, 1.08],
                }),
              },
              {
                translateY: businessIconPulse.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, -3],
                }),
              },
            ],
            opacity: businessIconPulse.interpolate({
              inputRange: [0, 1],
              outputRange: [0.86, 1],
            }),
          }}
        >
          <FontAwesome name="building-o" size={52} color="#94a3b8" />
        </Animated.View>
        <Text style={styles.modeTitle}>BUSINESS</Text>
        <Text style={styles.modeSubtitle}>Fleet management and company tools.</Text>
        <View style={styles.modePill}>
          <Text style={styles.modePillText}>Sign up for Business</Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.modeCard, styles.driverCard]}
        activeOpacity={0.9}
        onPress={() => router.push('/driver-signup')}
      >
        <Animated.View
          style={{
            transform: [
              {
                scale: driverIconPulse.interpolate({
                  inputRange: [0, 1],
                  outputRange: [1, 1.08],
                }),
              },
              {
                translateY: driverIconPulse.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, -3],
                }),
              },
            ],
            opacity: driverIconPulse.interpolate({
              inputRange: [0, 1],
              outputRange: [0.88, 1],
            }),
          }}
        >
          <FontAwesome name="truck" size={52} color={Theme.driverEmeraldDark} />
        </Animated.View>
        <Text style={styles.modeTitle}>DRIVER</Text>
        <Text style={styles.modeSubtitle}>Earn money on every trip you take.</Text>
        <View style={[styles.modePill, styles.modePillDriver]}>
          <Text style={styles.modePillText}>Sign up as Driver</Text>
        </View>
      </TouchableOpacity>
    </View>
  );

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
          onChangeText={setEmail}
          placeholder="Email Address"
          placeholderTextColor={isDesktop ? 'rgba(148,163,184,0.5)' : Theme.textMuted}
          style={[styles.input, isDesktop && styles.inputDesktop]}
          autoCapitalize="none"
        />
        <View style={styles.passwordWrap}>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="Your Password"
            placeholderTextColor={isDesktop ? 'rgba(148,163,184,0.5)' : Theme.textMuted}
            style={[styles.input, isDesktop && styles.inputDesktop]}
            secureTextEntry={!showPass}
            autoCapitalize="none"
          />
          <Pressable onPress={() => setShowPass((v) => !v)} style={styles.eyeBtn}>
            <FontAwesome name={showPass ? 'eye-slash' : 'eye'} size={18} color={Theme.textMuted} />
          </Pressable>
        </View>
        {signInError ? <Text style={styles.errorText}>{signInError}</Text> : null}

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
          <Text style={styles.forgotText}>Forgot password?</Text>
        </View>

        <TouchableOpacity
          onPress={handleSignIn}
          style={[styles.primaryBtn, (loading || waitingForAuthState || !isOnline) && styles.disabledBtn]}
          disabled={loading || waitingForAuthState || !isOnline}
        >
          {loading || waitingForAuthState ? (
            <ActivityIndicator color={Theme.textOnPrimary} />
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
            <ActivityIndicator color={Theme.textPrimaryDark} />
          ) : (
            <>
              <FontAwesome name="google" size={14} color={Theme.textPrimaryDark} />
              <Text style={styles.googleBtnText}>Continue with Google</Text>
            </>
          )}
        </TouchableOpacity>

        <View style={styles.signUpRow}>
          <Text style={[styles.signUpMuted, isDesktop && styles.signUpMutedDesktop]}>New to Pulse? </Text>
          <TouchableOpacity onPress={() => router.push('/sign-up')} activeOpacity={0.8}>
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
        screen === 'LANDING' ? styles.containerLanding : null,
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

      {screen === 'LANDING' ? (
        <View style={styles.topBar}>
          <Text style={[styles.brand, styles.brandOnDark]}>
            {typedPulse}
            <Text style={styles.logoDot}>.</Text>
          </Text>
          <View style={styles.topActions}>
            <TouchableOpacity onPress={() => setScreen('SIGNIN')} style={[styles.topBtn, styles.topBtnOnDark]}>
              <Text style={styles.topBtnText}>Sign In</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push('/(modals)/language-settings')} style={[styles.globeBtn, styles.globeBtnOnDark]}>
              <FontAwesome name="globe" size={16} color={Theme.textOnDark} />
            </TouchableOpacity>
            <Text style={[styles.langText, styles.langTextOnDark, styles.langPill]}>
              {currentLanguageLabel}
            </Text>
          </View>
        </View>
      ) : null}

      {screen === 'LANDING' ? renderLanding() : null}
      {screen === 'SIGNIN' ? renderSignIn() : null}

      {(screen !== 'LANDING' || Platform.OS === 'web') ? (
        <TouchableOpacity
          onPress={() => {
            if (screen !== 'LANDING') {
              setScreen('LANDING');
            } else {
              router.replace('/terminal-website');
            }
          }}
          style={styles.backFloating}
        >
          <FontAwesome name="chevron-left" size={14} color={Theme.textMuted} />
          <Text style={styles.backFloatingText}>
            {screen === 'LANDING' ? 'Website' : 'Back'}
          </Text>
        </TouchableOpacity>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
    paddingHorizontal: Layout.screenPaddingHorizontal,
  },
  containerLanding: {
    backgroundColor: '#020617',
    paddingHorizontal: 0,
  },
  containerDesktop: {
    backgroundColor: '#020617',
    paddingHorizontal: 0,
  },
  containerLandingDesktop: {
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
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    backgroundColor: '#020617',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  brand: {
    fontSize: 28,
    fontWeight: '900',
    fontStyle: 'italic',
    letterSpacing: -0.7,
    color: Theme.textPrimaryDark,
  },
  brandOnDark: {
    color: '#ffffff',
  },
  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  topBtn: {
    backgroundColor: Theme.textPrimaryDark,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  topBtnOnDark: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  topBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  globeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Theme.textPrimaryDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  globeBtnOnDark: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  langText: {
    fontSize: 11,
    color: Theme.textMuted,
    fontWeight: '700',
  },
  langTextOnDark: {
    color: 'rgba(255,255,255,0.92)',
  },
  langPill: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    overflow: 'hidden',
  },
  landingWrap: {
    flex: 1,
    gap: 12,
    flexDirection: 'column',
    paddingTop: 76,
    paddingBottom: 12,
  },
  landingWrapDesktop: {
    flexDirection: 'row',
    gap: 0,
    paddingTop: 64,
  },
  modeCard: {
    flex: 1,
    borderRadius: 0,
    padding: 28,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  businessCard: {
    backgroundColor: '#020617',
    borderColor: 'rgba(255,255,255,0.06)',
  },
  driverCard: {
    backgroundColor: '#041524',
    borderColor: 'rgba(255,255,255,0.06)',
  },
  modeTitle: {
    marginTop: 16,
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -0.8,
    color: Theme.textOnDark,
  },
  modeSubtitle: {
    marginTop: 8,
    fontSize: 13,
    textAlign: 'center',
    color: 'rgba(148,163,184,0.72)',
    maxWidth: 280,
  },
  modePill: {
    marginTop: 18,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Theme.borderOnDark,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  modePillDriver: {
    borderColor: 'rgba(16,185,129,0.25)',
    backgroundColor: '#10b981',
  },
  modePillText: {
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '800',
    color: Theme.textOnDark,
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
