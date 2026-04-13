import Theme from '@/constants/Theme';
import Layout from '@/constants/Layout';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useIsOnline } from '@/contexts/NetworkContext';
import { getKeepSignedIn, setKeepSignedIn } from '@/lib/keepSignedInPreference';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Link, useRouter, useLocalSearchParams } from 'expo-router';
import { useRef, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Keyboard,
    KeyboardAvoidingView,
    LayoutAnimation,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    UIManager,
    View,
} from 'react-native';

// Layout animation: no-op in New Architecture; only enable on Android when using old arch to avoid warning.
const isNewArch = typeof (global as unknown as { __turboModuleProxy?: unknown }).__turboModuleProxy !== 'undefined';
if (Platform.OS === 'android' && !isNewArch && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function getEmailFromParams(params: { email?: string | string[] }): string {
  const e = params.email;
  if (typeof e === 'string') return e;
  if (Array.isArray(e) && e[0]) return e[0];
  return '';
}

export default function SignIn() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ email?: string | string[] }>();
  const { signIn, user } = useAuth();
  const { t, locale, localeOptions } = useLanguage();
  const isOnline = useIsOnline();
  const router = useRouter();
  const [email, setEmail] = useState(() => getEmailFromParams(params));
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [keepSignedIn, setKeepSignedInState] = useState(true);
  const [loading, setLoading] = useState(false);
  const emailPrefilled = Boolean(getEmailFromParams(params));
  const scrollRef = useRef<ScrollView>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const userToggledKeepRef = useRef(false);

  useEffect(() => {
    let mounted = true;
    getKeepSignedIn().then((keep) => {
      if (mounted && !userToggledKeepRef.current) {
        setKeepSignedInState(keep);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    // Automatically redirect to home if the user is already or becomes logged in.
    if (user) {
      router.replace('/');
    }
  }, [user, router]);

  useEffect(() => {
    const next = getEmailFromParams(params);
    if (next) setEmail(next);
  }, [params.email]);

  useEffect(() => {
    const show = () => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setKeyboardVisible(true);
    };
    const hide = () => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setKeyboardVisible(false);
    };
    const subShow = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      show
    );
    const subHide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      hide
    );
    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, []);

  const currentLanguageLabel =
    localeOptions.find((o) => o.value === locale)?.labelNative ??
    localeOptions.find((o) => o.value === locale)?.label ??
    'English';

  const handleSignIn = async () => {
    if (!isOnline) {
      Alert.alert(t('noInternet'), t('connectToSignIn'));
      return;
    }
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      Alert.alert(t('error'), t('enterEmailPassword'));
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      Alert.alert(t('invalidEmail'), t('validEmailAddress'));
      return;
    }
    setLoading(true);
    const { error } = await signIn(trimmedEmail, password, keepSignedIn);
    setLoading(false);
    if (error) {
      const isNetwork = error.message.includes('Cannot reach server');
      Alert.alert(
        isNetwork ? t('connectionError') : t('signInFailed'),
        isNetwork ? t('cannotReachServer') : error.message
      );
      return;
    }
    // Navigation is handled automatically by the useEffect watching `user`
  };

  const scrollContentStyle = [
    styles.scrollContent,
    keyboardVisible && styles.scrollContentKeyboardOpen,
  ];

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 20 : 0}
    >
      {!isOnline && (
        <View style={[styles.offlineBanner, { paddingTop: insets.top + 12 }]}>
          <Text style={styles.offlineText}>{t('noInternetConnection')}</Text>
        </View>
      )}
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={scrollContentStyle}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={keyboardVisible}
      >
        <View style={styles.inner}>
          <View style={styles.header}>
            <Text style={styles.title}>{t('signIn')}</Text>
            <Text style={styles.subtitle}>
              {emailPrefilled ? t('enterPasswordToSignIn') : t('logInToContinue')}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.languageRow}
            onPress={() => router.push('/(modals)/language-settings')}
            activeOpacity={0.7}
          >
            <FontAwesome name="globe" size={18} color={Theme.authTextMuted} />
            <Text style={styles.languageLabel}>{t('language')}: </Text>
            <Text style={styles.languageValue}>{currentLanguageLabel}</Text>
            <FontAwesome name="chevron-right" size={14} color={Theme.authTextMuted} />
          </TouchableOpacity>

          <TextInput
            style={styles.input}
            placeholder={t('emailPlaceholder')}
            placeholderTextColor={Theme.authTextMuted}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            autoComplete="email"
            keyboardType="email-address"
            editable={!loading}
          />
          <View style={styles.passwordRow}>
            <TextInput
              style={styles.inputPassword}
              placeholder={t('passwordPlaceholder')}
              placeholderTextColor={Theme.authTextMuted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCorrect={false}
              spellCheck={false}
              autoComplete="password"
              editable={!loading}
            />
            <TouchableOpacity
              style={styles.eyeButton}
              onPress={() => setShowPassword((p) => !p)}
              disabled={loading}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <FontAwesome
                name={showPassword ? 'eye-slash' : 'eye'}
                size={20}
                color={Theme.authTextMuted}
              />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.keepSignedInRow}
            onPress={() => {
              userToggledKeepRef.current = true;
              const next = !keepSignedIn;
              setKeepSignedInState(next);
              void setKeepSignedIn(next);
            }}
            disabled={loading}
            activeOpacity={0.8}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: keepSignedIn }}
            accessibilityLabel={t('keepMeSignedIn')}
          >
            <FontAwesome
              name={keepSignedIn ? 'check-square' : 'square-o'}
              size={22}
              color={keepSignedIn ? Theme.authPrimary : Theme.authTextMuted}
            />
            <Text style={styles.keepSignedInLabel}>{t('keepMeSignedIn')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, (loading || !isOnline) && styles.buttonDisabled]}
            onPress={handleSignIn}
            disabled={loading || !isOnline}
          >
            {loading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.buttonText}>{t('logIn')}</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity activeOpacity={0.8} disabled={loading}>
            <Text style={styles.forgotPasswordText}>{t('forgotPassword')}</Text>
          </TouchableOpacity>

          <View style={styles.footer}>
            <Text style={styles.footerMuted}>Don&apos;t have an account? </Text>
            <Link href="/sign-up" asChild>
              <TouchableOpacity disabled={loading} activeOpacity={0.8}>
                <Text style={styles.footerLink}>{t('createNewAccount')}</Text>
              </TouchableOpacity>
            </Link>
          </View>
          <View style={styles.footer}>
            <Text style={styles.footerMuted}>Driver? </Text>
            <Link href="/driver-signup" asChild>
              <TouchableOpacity disabled={loading} activeOpacity={0.8}>
                <Text style={styles.footerLink}>Sign up as driver</Text>
              </TouchableOpacity>
            </Link>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
    padding: Layout.screenPaddingHorizontal + 8,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 24,
    paddingBottom: 24,
    width: '100%',
  },
  scrollContentKeyboardOpen: {
    paddingBottom: 120,
  },
  offlineBanner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: Theme.authPrimary,
    paddingVertical: 12,
    paddingHorizontal: 16,
    zIndex: 1,
  },
  offlineText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  inner: {
    width: '100%',
    maxWidth: 420,
  },
  header: {
    marginBottom: 32,
  },
  title: {
    fontSize: 34,
    fontWeight: '800',
    color: Theme.textPrimaryDark,
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 16,
    color: Theme.textMuted,
    letterSpacing: 0.5,
  },
  languageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    marginBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: Theme.border,
  },
  languageLabel: {
    fontSize: 14,
    color: Theme.textMuted,
    marginLeft: 8,
  },
  languageValue: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: Theme.textPrimaryDark,
    marginLeft: 4,
  },
  input: {
    backgroundColor: Theme.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.border,
    padding: 16,
    fontSize: 16,
    color: Theme.textPrimaryDark,
    marginBottom: 16,
  },
  passwordRow: {
    position: 'relative',
    marginBottom: 16,
  },
  inputPassword: {
    backgroundColor: Theme.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.border,
    padding: 16,
    paddingRight: 48,
    fontSize: 16,
    color: Theme.textPrimaryDark,
  },
  eyeButton: {
    position: 'absolute',
    right: 16,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  keepSignedInRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    paddingVertical: 12,
    paddingRight: 8,
    gap: 10,
  },
  keepSignedInLabel: {
    fontSize: 15,
    color: Theme.textMuted,
    fontWeight: '500',
    flex: 1,
  },
  button: {
    backgroundColor: Theme.authPrimary,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: Theme.authPrimary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 14,
    elevation: 4,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  forgotPasswordText: {
    marginTop: 16,
    fontSize: 14,
    fontWeight: '500',
    color: Theme.textPrimaryDark,
    textAlign: 'center',
  },
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
    paddingTop: 16,
  },
  footerMuted: {
    fontSize: 14,
    color: Theme.textMuted,
    fontWeight: '500',
  },
  footerLink: {
    fontSize: 14,
    color: Theme.textPrimaryDark,
    fontWeight: '700',
  },
});
