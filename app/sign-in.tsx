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
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type ScreenState = 'LANDING' | 'SIGNIN' | 'SIGNUP';
type ModeState = 'business' | 'driver' | null;

function getEmailFromParams(params: { email?: string | string[] }): string {
  const e = params.email;
  if (typeof e === 'string') return e;
  if (Array.isArray(e) && e[0]) return e[0];
  return '';
}

export default function SignIn() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string | string[] }>();
  const { width } = useWindowDimensions();
  const isOnline = useIsOnline();
  const { user, signIn } = useAuth();
  const { locale, localeOptions } = useLanguage();

  const [screen, setScreen] = useState<ScreenState>('LANDING');
  const [signupStep, setSignupStep] = useState(0);
  const [mode, setMode] = useState<ModeState>(null);

  const [email, setEmail] = useState(() => getEmailFromParams(params));
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [keepSignedIn, setKeepSignedInState] = useState(true);
  const [loading, setLoading] = useState(false);
  const [waitingForAuthState, setWaitingForAuthState] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);

  // Signup UI-only fields for progressive steps.
  const [signupName, setSignupName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupCompany, setSignupCompany] = useState('');
  const [signupFleetSize, setSignupFleetSize] = useState('Fleet size');
  const [signupCity, setSignupCity] = useState('');
  const [signupPhone, setSignupPhone] = useState('');
  const [signupExp, setSignupExp] = useState('Driving experience');
  const [signupLicense, setSignupLicense] = useState('License category');

  const isDesktop = width >= 1024;

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

  const goToSignup = (selectedMode: Exclude<ModeState, null>) => {
    setMode(selectedMode);
    setSignupStep(0);
    setScreen('SIGNUP');
  };

  const finalizeSignup = () => {
    // Keep current backend flow: business -> /sign-up, driver -> /driver-signup
    if (mode === 'driver') {
      router.push('/driver-signup');
      return;
    }
    router.push('/sign-up');
  };

  const renderLanding = () => (
    <View style={[styles.landingWrap, isDesktop && styles.landingWrapDesktop]}>
      <TouchableOpacity
        style={[styles.modeCard, styles.businessCard]}
        activeOpacity={0.9}
        onPress={() => goToSignup('business')}
      >
        <FontAwesome name="building-o" size={52} color="#94a3b8" />
        <Text style={styles.modeTitle}>BUSINESS</Text>
        <Text style={styles.modeSubtitle}>Fleet management and company tools.</Text>
        <View style={styles.modePill}>
          <Text style={styles.modePillText}>Sign up for Business</Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.modeCard, styles.driverCard]}
        activeOpacity={0.9}
        onPress={() => goToSignup('driver')}
      >
        <FontAwesome name="truck" size={52} color={Theme.driverEmeraldDark} />
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
          <Text style={styles.leftLogo}>PULSE.</Text>
          <Text style={styles.leftTag}>System Access</Text>
          <Text style={styles.leftTitle}>Welcome Back Commander.</Text>
          <Text style={styles.leftSubtitle}>
            Your fleet is waiting. Log in to synchronize your logs and check earnings.
          </Text>
        </View>
      ) : null}
      <View style={[styles.rightPanel, isDesktop && styles.rightPanelDesktop]}>
        <Text style={styles.formTitle}>Sign in.</Text>
        <Text style={styles.formSubtitle}>Access your Pulse account dashboard.</Text>

        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="Email Address"
          placeholderTextColor={Theme.textMuted}
          style={styles.input}
          autoCapitalize="none"
        />
        <View style={styles.passwordWrap}>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="Your Password"
            placeholderTextColor={Theme.textMuted}
            style={styles.input}
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
            <Text style={styles.keepText}>Remember Me</Text>
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
      </View>
    </View>
  );

  const renderSignUp = () => {
    const isBusiness = mode === 'business';
    return (
      <View style={[styles.panelShell, isDesktop && styles.panelShellDesktop]}>
        {isDesktop ? (
          <View style={[styles.leftPanel, isBusiness ? styles.leftBusiness : styles.leftDriver]}>
            <Text style={styles.leftLogo}>PULSE.</Text>
            <Text style={styles.leftTag}>{signupStep === 0 ? 'Account Creation' : 'Operational Details'}</Text>
            <Text style={styles.leftTitle}>Starting as {isBusiness ? 'Business Node.' : 'Pilot.'}</Text>
            <Text style={styles.leftSubtitle}>
              {signupStep === 0
                ? 'Join the network and start managing logistics with ease.'
                : 'Complete your profile to unlock full system capabilities.'}
            </Text>
          </View>
        ) : null}
        <View style={[styles.rightPanel, isDesktop && styles.rightPanelDesktop]}>
          <View style={styles.stepRow}>
            <Text style={styles.formTitle}>{signupStep === 0 ? 'Identity.' : 'Profile.'}</Text>
            <View style={styles.stepDots}>
              <View style={[styles.stepLine, styles.stepLineActive]} />
              <View style={[styles.stepLine, signupStep > 0 && styles.stepLineActive]} />
            </View>
          </View>
          <Text style={styles.formSubtitle}>
            {signupStep === 0 ? 'Set up your base credentials.' : 'Tell us about your operations.'}
          </Text>

          {signupStep === 0 ? (
            <>
              <TextInput value={signupName} onChangeText={setSignupName} placeholder="Full Name" placeholderTextColor={Theme.textMuted} style={styles.input} />
              <TextInput value={signupEmail} onChangeText={setSignupEmail} placeholder="Email Address" placeholderTextColor={Theme.textMuted} style={styles.input} autoCapitalize="none" />
              <TextInput value={signupPassword} onChangeText={setSignupPassword} placeholder="Create Password" placeholderTextColor={Theme.textMuted} style={styles.input} secureTextEntry />
              <TouchableOpacity style={styles.primaryBtn} onPress={() => setSignupStep(1)}>
                <Text style={styles.primaryBtnText}>Continue to Profile</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              {isBusiness ? (
                <>
                  <TextInput value={signupCompany} onChangeText={setSignupCompany} placeholder="Company / Fleet Name" placeholderTextColor={Theme.textMuted} style={styles.input} />
                  <TouchableOpacity style={styles.selectLike} onPress={() => setSignupFleetSize(signupFleetSize === 'Fleet size' ? '1-5 Vehicles' : 'Fleet size')}>
                    <Text style={styles.selectText}>{signupFleetSize}</Text>
                  </TouchableOpacity>
                  <TextInput value={signupCity} onChangeText={setSignupCity} placeholder="Headquarters City" placeholderTextColor={Theme.textMuted} style={styles.input} />
                </>
              ) : (
                <>
                  <TextInput value={signupPhone} onChangeText={setSignupPhone} placeholder="Verified Mobile Number" placeholderTextColor={Theme.textMuted} style={styles.input} keyboardType="phone-pad" />
                  <TouchableOpacity style={styles.selectLike} onPress={() => setSignupExp(signupExp === 'Driving experience' ? '3-5 Years' : 'Driving experience')}>
                    <Text style={styles.selectText}>{signupExp}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.selectLike} onPress={() => setSignupLicense(signupLicense === 'License category' ? 'HMV' : 'License category')}>
                    <Text style={styles.selectText}>{signupLicense}</Text>
                  </TouchableOpacity>
                </>
              )}
              <TouchableOpacity style={styles.primaryBtn} onPress={finalizeSignup}>
                <Text style={styles.primaryBtnText}>Finalize Account</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={[
        styles.container,
        screen === 'LANDING' && isDesktop ? styles.containerLandingDesktop : null,
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
          <Text style={[styles.brand, styles.brandOnDark]}>PULSE.</Text>
          <View style={styles.topActions}>
            <TouchableOpacity onPress={() => setScreen('SIGNIN')} style={[styles.topBtn, styles.topBtnOnDark]}>
              <Text style={styles.topBtnText}>Sign In</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push('/(modals)/language-settings')} style={[styles.globeBtn, styles.globeBtnOnDark]}>
              <FontAwesome name="globe" size={16} color={Theme.textOnDark} />
            </TouchableOpacity>
            <Text style={[styles.langText, styles.langTextOnDark]}>{currentLanguageLabel}</Text>
          </View>
        </View>
      ) : null}

      {screen === 'LANDING' ? renderLanding() : null}
      {screen === 'SIGNIN' ? renderSignIn() : null}
      {screen === 'SIGNUP' ? renderSignUp() : null}

      {screen !== 'LANDING' ? (
        <TouchableOpacity
          onPress={() => {
            if (screen === 'SIGNUP' && signupStep > 0) setSignupStep(0);
            else setScreen('LANDING');
          }}
          style={styles.backFloating}
        >
          <FontAwesome name="chevron-left" size={14} color={Theme.textMuted} />
          <Text style={styles.backFloatingText}>Back</Text>
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
  },
  brand: {
    fontSize: 28,
    fontWeight: '900',
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
  },
  leftPanel: {
    flex: 1,
    backgroundColor: Theme.textPrimaryDark,
    paddingHorizontal: 36,
    paddingVertical: 36,
    justifyContent: 'center',
  },
  leftBusiness: {
    backgroundColor: '#020617',
  },
  leftDriver: {
    backgroundColor: '#052e2b',
  },
  leftLogo: {
    fontSize: 48,
    fontWeight: '900',
    color: Theme.driverPrimary,
    marginBottom: 10,
  },
  leftTag: {
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 2.5,
    fontWeight: '700',
    color: Theme.textOnDarkMuted,
    marginBottom: 14,
  },
  leftTitle: {
    fontSize: 34,
    fontWeight: '900',
    color: Theme.textOnDark,
    letterSpacing: -0.8,
    marginBottom: 10,
  },
  leftSubtitle: {
    fontSize: 14,
    lineHeight: 22,
    color: Theme.textOnDarkMuted,
    maxWidth: 360,
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
  },
  formTitle: {
    fontSize: 44,
    fontWeight: '900',
    color: Theme.textPrimaryDark,
    letterSpacing: -0.8,
  },
  formSubtitle: {
    marginTop: 6,
    marginBottom: 18,
    fontSize: 14,
    color: Theme.textMuted,
  },
  input: {
    backgroundColor: Theme.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Theme.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: Theme.textPrimaryDark,
    marginBottom: 12,
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
  stepRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stepDots: {
    flexDirection: 'row',
    gap: 6,
  },
  stepLine: {
    width: 24,
    height: 4,
    borderRadius: 999,
    backgroundColor: Theme.border,
  },
  stepLineActive: {
    backgroundColor: Theme.driverPrimary,
  },
  selectLike: {
    backgroundColor: Theme.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Theme.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 12,
  },
  selectText: {
    color: Theme.textPrimaryDark,
    fontSize: 15,
    fontWeight: '700',
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
});
