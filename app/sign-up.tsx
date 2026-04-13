import { useEffect, useRef, useState } from 'react';
import { useRouter, Link } from 'expo-router';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Keyboard,
  KeyboardAvoidingView,
  LayoutAnimation,
  Platform,
  ActivityIndicator,
  Alert,
  ScrollView,
  UIManager,
} from 'react-native';

// Layout animation: no-op in New Architecture; only enable on Android when using old arch to avoid warning.
const isNewArch = typeof (global as unknown as { __turboModuleProxy?: unknown }).__turboModuleProxy !== 'undefined';
if (Platform.OS === 'android' && !isNewArch && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import Theme from '@/constants/Theme';
import Layout from '@/constants/Layout';
import { validateEmail } from '@/lib/emailValidation';
import { isPhoneValid, validatePhone } from '@/lib/phoneValidation';
import { VALIDATION, maxLength, validateFullName, validatePassword } from '@/lib/validation';
import { useAuth } from '@/contexts/AuthContext';
import { useIsOnline } from '@/contexts/NetworkContext';
import { checkExistingUserByPhone, type OperatingModel } from '@/features/auth';

const OPERATING_MODELS: { value: OperatingModel; label: string }[] = [
  { value: 'ASSET_BASED', label: 'Asset' },
  { value: 'NON_ASSET', label: 'Aggregate' },
  { value: 'HYBRID', label: 'Both' },
];

/** Normalize phone for storage and lookup (matches get_invitee_by_phone / get_driver_invitee_by_phone). */
function normalizePhone(value: string): string {
  return value.trim().replace(/\s+/g, '');
}


export default function SignUp() {
  const insets = useSafeAreaInsets();
  const { signUp } = useAuth();
  const isOnline = useIsOnline();
  const router = useRouter();
  const [operatingModel, setOperatingModel] = useState<OperatingModel>('HYBRID');
  const [fullName, setFullName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  /** Inline "phone already registered" check (debounced when user enters valid phone). */
  const [phoneExistsCheck, setPhoneExistsCheck] = useState<{
    loading: boolean;
    exists: boolean;
    email?: string;
    masked_email?: string;
  } | null>(null);
  const phoneCheckTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const fieldYRef = useRef({ fullName: 0, company: 0, phone: 0, email: 0, password: 0 });

  /** Extra scroll offset so focused field stays above keyboard. Use larger offset on iOS when focusing password so the field stays above the "Strong Password" / autofill bar. */
  const SCROLL_OFFSET_DEFAULT = 100;
  const SCROLL_OFFSET_PASSWORD_IOS = 220;

  const scrollToField = (name: keyof typeof fieldYRef.current) => {
    const isPasswordOnIos = name === 'password' && Platform.OS === 'ios';
    const offset = isPasswordOnIos ? SCROLL_OFFSET_PASSWORD_IOS : SCROLL_OFFSET_DEFAULT;
    setTimeout(() => {
      const y = fieldYRef.current[name];
      scrollRef.current?.scrollTo({
        y: Math.max(0, y - offset),
        animated: true,
      });
    }, 80);
  };

  useEffect(() => {
    const show = (e: { endCoordinates: { height: number } }) => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setKeyboardHeight(e.endCoordinates.height);
      setKeyboardVisible(true);
    };
    const hide = () => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setKeyboardVisible(false);
      setKeyboardHeight(0);
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

  useEffect(() => {
    const raw = phone.trim();
    if (!raw || !isPhoneValid(phone)) {
      setPhoneExistsCheck(null);
      if (phoneCheckTimeoutRef.current) {
        clearTimeout(phoneCheckTimeoutRef.current);
        phoneCheckTimeoutRef.current = null;
      }
      return;
    }
    if (!isOnline) {
      setPhoneExistsCheck(null);
      return;
    }
    if (phoneCheckTimeoutRef.current) clearTimeout(phoneCheckTimeoutRef.current);
    setPhoneExistsCheck((prev) => (prev ? { ...prev, loading: true } : { loading: true, exists: false }));
    phoneCheckTimeoutRef.current = setTimeout(async () => {
      phoneCheckTimeoutRef.current = null;
      const normalized = normalizePhone(phone);
      const result = await checkExistingUserByPhone(normalized);
      setPhoneExistsCheck({
        loading: false,
        exists: result.exists,
        email: result.email,
        masked_email: result.masked_email,
      });
    }, 600);
    return () => {
      if (phoneCheckTimeoutRef.current) {
        clearTimeout(phoneCheckTimeoutRef.current);
        phoneCheckTimeoutRef.current = null;
      }
    };
  }, [phone, isOnline]);

  const handleSignUp = async () => {
    setErrorMsg(null);
    if (!isOnline) {
      setErrorMsg('Connect to the internet to create an account.');
      return;
    }
    const trimmedEmail = email.trim();
    const emailErr = validateEmail(email);
    if (emailErr) {
      setErrorMsg(emailErr);
      return;
    }
    const passwordErr = validatePassword(password);
    if (passwordErr) {
      setErrorMsg(passwordErr);
      return;
    }
    const fullNameErr = validateFullName(false)(fullName);
    if (fullNameErr) {
      setErrorMsg(fullNameErr);
      return;
    }
    const companyTrim = companyName.trim();
    if (companyTrim.length > 0) {
      const companyErr = maxLength(
        VALIDATION.COMPANY_NAME_MAX_LENGTH,
        `Company name must be at most ${VALIDATION.COMPANY_NAME_MAX_LENGTH} characters.`,
      )(companyTrim);
      if (companyErr) {
        setErrorMsg(companyErr);
        return;
      }
    }
    if (!trimmedEmail) {
      setErrorMsg('Please enter email.');
      return;
    }
    const normalizedPhone = normalizePhone(phone);
    if (normalizedPhone.length > 0) {
      const phoneErr = validatePhone(phone);
      if (phoneErr) {
        setErrorMsg(phoneErr);
        return;
      }
      setLoading(true);
      const existing = await checkExistingUserByPhone(normalizedPhone);
      setLoading(false);
      if (existing.error) {
        setErrorMsg(existing.error.message);
        return;
      }
      if (existing.exists && existing.email) {
        Alert.alert(
          'Account already exists',
          existing.masked_email
            ? `Sign in with ${existing.masked_email}. We've filled your email—enter your password.`
            : 'An account with this phone already exists. Sign in below—we\'ve filled your email.',
          [
            {
              text: 'OK',
              onPress: () =>
                router.replace(`/sign-in?email=${encodeURIComponent(existing.email!)}`),
            },
          ]
        );
        return;
      }
    }
    setLoading(true);
    const phoneToSave = normalizedPhone.length > 0 ? normalizedPhone : undefined;
    const { error } = await signUp(
      trimmedEmail,
      password,
      fullName.trim() || undefined,
      'user',
      operatingModel,
      phoneToSave,
      companyTrim || undefined,
    );
    setLoading(false);
    if (error) {
      const isNetwork = error.message.includes('Cannot reach server');
      setErrorMsg(
        isNetwork
          ? 'Cannot reach server. Check your internet connection and try again.'
          : error.message
      );
      return;
    }
    router.replace('/');
  };

  /** On iOS, keyboard height does not include the "Strong Password" / autofill bar (~50–88pt). Add extra inset so the password field can scroll above it. */
  const KEYBOARD_BOTTOM_INSET = Platform.OS === 'ios' ? 88 : 40;

  const scrollContentStyle = [
    styles.scrollContent,
    keyboardVisible && {
      flexGrow: 0,
      justifyContent: 'flex-start' as const,
      paddingBottom: keyboardHeight + KEYBOARD_BOTTOM_INSET,
    },
  ];

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
    >
      {!isOnline && (
        <View style={[styles.offlineBanner, { paddingTop: insets.top + 12 }]}>
          <Text style={styles.offlineText}>No internet connection. Connect to create an account.</Text>
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
            <Text style={styles.title}>Create Account</Text>
            <Text style={styles.subtitle}>Enter your details to get started.</Text>
          </View>

          {errorMsg ? (
            <View style={styles.errorAlert}>
              <FontAwesome name="exclamation-circle" size={20} color={Theme.authPrimary} style={styles.errorIcon} />
              <Text style={styles.errorText}>{errorMsg}</Text>
            </View>
          ) : null}

          <Text style={styles.label}>Business Model</Text>
          <View style={styles.modelRow}>
            {OPERATING_MODELS.map(({ value, label }) => {
              const isActive = operatingModel === value;
              return (
                <TouchableOpacity
                  key={value}
                  style={[styles.modelChip, isActive && styles.modelChipActive]}
                  onPress={() => setOperatingModel(value)}
                  disabled={loading}
                >
                  <Text style={[styles.modelChipText, isActive && styles.modelChipTextActive]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View
            style={styles.inputWrap}
            onLayout={(e) => { fieldYRef.current.fullName = e.nativeEvent.layout.y; }}
          >
            <TextInput
              style={[styles.input, styles.inputNoMargin]}
              placeholder="Full Name"
              placeholderTextColor={Theme.authTextMuted}
              value={fullName}
              onChangeText={setFullName}
              onFocus={() => scrollToField('fullName')}
              autoCapitalize="words"
              autoCorrect={false}
              spellCheck={false}
              autoComplete="name"
              editable={!loading}
            />
          </View>
          <View
            style={styles.inputWrap}
            onLayout={(e) => { fieldYRef.current.company = e.nativeEvent.layout.y; }}
          >
            <TextInput
              style={[styles.input, styles.inputNoMargin]}
              placeholder="Company name (optional)"
              placeholderTextColor={Theme.authTextMuted}
              value={companyName}
              onChangeText={setCompanyName}
              onFocus={() => scrollToField('company')}
              autoCapitalize="words"
              autoCorrect={false}
              spellCheck={false}
              autoComplete="organization"
              editable={!loading}
            />
          </View>
          <View
            style={styles.inputWrap}
            onLayout={(e) => { fieldYRef.current.phone = e.nativeEvent.layout.y; }}
          >
            <TextInput
              style={[styles.input, styles.inputNoMargin]}
              placeholder="Phone (Optional for invites)"
              placeholderTextColor={Theme.authTextMuted}
              value={phone}
              onChangeText={setPhone}
              onFocus={() => scrollToField('phone')}
              keyboardType="phone-pad"
              autoCorrect={false}
              spellCheck={false}
              autoComplete="tel"
              editable={!loading}
            />
          </View>
          {phoneExistsCheck?.loading ? (
            <Text style={styles.phoneExistsHint}>Checking…</Text>
          ) : phoneExistsCheck?.exists && phoneExistsCheck.email ? (
            <View style={styles.phoneExistsRow}>
              <Text style={styles.phoneExistsText}>This number is already registered. </Text>
              <TouchableOpacity
                onPress={() =>
                  router.replace(`/sign-in?email=${encodeURIComponent(phoneExistsCheck.email!)}`)}
                hitSlop={8}
                activeOpacity={0.7}
              >
                <Text style={styles.phoneExistsLink}>Sign in</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          <View
            style={styles.inputWrap}
            onLayout={(e) => { fieldYRef.current.email = e.nativeEvent.layout.y; }}
          >
            <TextInput
              style={[styles.input, styles.inputNoMargin]}
              placeholder="Email Address"
              placeholderTextColor={Theme.authTextMuted}
              value={email}
              onChangeText={setEmail}
              onFocus={() => scrollToField('email')}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              keyboardType="email-address"
              autoComplete="email"
              editable={!loading}
            />
          </View>
          <View
            style={[styles.passwordRow, styles.inputWrap]}
            onLayout={(e) => { fieldYRef.current.password = e.nativeEvent.layout.y; }}
          >
            <TextInput
              style={styles.inputPassword}
              placeholder="Password"
              placeholderTextColor={Theme.authTextMuted}
              value={password}
              onChangeText={setPassword}
              onFocus={() => scrollToField('password')}
              secureTextEntry={!showPassword}
              autoCorrect={false}
              spellCheck={false}
              autoComplete="new-password"
              textContentType="newPassword"
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
            style={[styles.button, (loading || !isOnline) && styles.buttonDisabled]}
            onPress={handleSignUp}
            disabled={loading || !isOnline}
          >
            {loading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.buttonText}>Create Account</Text>
            )}
          </TouchableOpacity>

          <View style={styles.footer}>
            <Text style={styles.footerMuted}>Already have an account? </Text>
            <Link href="/sign-in" asChild>
              <TouchableOpacity disabled={loading} activeOpacity={0.8}>
                <Text style={styles.footerLink}>Sign In</Text>
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
  errorAlert: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: Theme.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.authPrimary + '80',
    padding: 16,
    marginBottom: 24,
  },
  errorIcon: {
    marginRight: 12,
    marginTop: 2,
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: Theme.authPrimary,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: Theme.textMuted,
    marginBottom: 12,
    letterSpacing: 1,
  },
  modelRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  modelChip: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.border,
    backgroundColor: Theme.surface,
    alignItems: 'center',
  },
  modelChipActive: {
    backgroundColor: Theme.authPrimary,
    borderColor: Theme.authPrimary,
  },
  modelChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: Theme.textMuted,
  },
  modelChipTextActive: {
    color: '#ffffff',
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
  inputWrap: {
    marginBottom: 16,
  },
  inputNoMargin: {
    marginBottom: 0,
  },
  phoneExistsHint: {
    fontSize: 13,
    color: Theme.textMuted,
    marginTop: -8,
    marginBottom: 12,
  },
  phoneExistsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginTop: -8,
    marginBottom: 12,
  },
  phoneExistsText: {
    fontSize: 13,
    color: Theme.authPrimary,
  },
  phoneExistsLink: {
    fontSize: 13,
    fontWeight: '600',
    color: Theme.authPrimary,
    textDecorationLine: 'underline',
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
