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
  useWindowDimensions,
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
import {
  extractIndianMobileTenDigits,
  isPhoneValid,
  normalizeIndianPhoneForMetadata,
  validatePhone,
} from '@/lib/phoneValidation';
import { formatMobileNumber } from '@/lib/format';
import { VALIDATION, maxLength, validateFullName, validatePassword } from '@/lib/validation';
import { useAuth } from '@/contexts/AuthContext';
import { useIsOnline } from '@/contexts/NetworkContext';
import {
  checkExistingUserByPhone,
  checkOrganizationNameTaken,
  type OperatingModel,
} from '@/features/auth';

const OPERATING_MODELS: { value: OperatingModel; label: string }[] = [
  { value: 'ASSET_BASED', label: 'Asset' },
  { value: 'NON_ASSET', label: 'Aggregate' },
  { value: 'HYBRID', label: 'Both' },
];

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
  const [confirmPassword, setConfirmPassword] = useState('');
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
  const companyCheckTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [companyNameTakenCheck, setCompanyNameTakenCheck] = useState<{
    loading: boolean;
    taken: boolean;
  } | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const fieldYRef = useRef({ fullName: 0, company: 0, phone: 0, email: 0, password: 0, confirmPassword: 0 });
  const { width } = useWindowDimensions();
  const isDesktopLayout = width >= 1024;

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
      const result = await checkExistingUserByPhone(phone);
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

  useEffect(() => {
    const raw = companyName.trim();
    if (!raw) {
      setCompanyNameTakenCheck(null);
      if (companyCheckTimeoutRef.current) {
        clearTimeout(companyCheckTimeoutRef.current);
        companyCheckTimeoutRef.current = null;
      }
      return;
    }
    const lenErr = maxLength(
      VALIDATION.COMPANY_NAME_MAX_LENGTH,
      `Company name must be at most ${VALIDATION.COMPANY_NAME_MAX_LENGTH} characters.`,
    )(raw);
    if (lenErr) {
      setCompanyNameTakenCheck(null);
      if (companyCheckTimeoutRef.current) {
        clearTimeout(companyCheckTimeoutRef.current);
        companyCheckTimeoutRef.current = null;
      }
      return;
    }
    if (!isOnline) {
      setCompanyNameTakenCheck(null);
      return;
    }
    if (companyCheckTimeoutRef.current) clearTimeout(companyCheckTimeoutRef.current);
    setCompanyNameTakenCheck((prev) =>
      prev ? { ...prev, loading: true } : { loading: true, taken: false },
    );
    companyCheckTimeoutRef.current = setTimeout(async () => {
      companyCheckTimeoutRef.current = null;
      const result = await checkOrganizationNameTaken(raw);
      setCompanyNameTakenCheck({
        loading: false,
        taken: !result.error && result.taken,
      });
    }, 600);
    return () => {
      if (companyCheckTimeoutRef.current) {
        clearTimeout(companyCheckTimeoutRef.current);
        companyCheckTimeoutRef.current = null;
      }
    };
  }, [companyName, isOnline]);

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
    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }
    const fullNameErr = validateFullName(false)(fullName);
    if (fullNameErr) {
      setErrorMsg(fullNameErr);
      return;
    }
    const companyTrim = companyName.trim();
    if (companyTrim.length === 0) {
      setErrorMsg('Please enter company name.');
      return;
    }
    const companyErr = maxLength(
      VALIDATION.COMPANY_NAME_MAX_LENGTH,
      `Company name must be at most ${VALIDATION.COMPANY_NAME_MAX_LENGTH} characters.`,
    )(companyTrim);
    if (companyErr) {
      setErrorMsg(companyErr);
      return;
    }
    if (companyNameTakenCheck?.taken) {
      setErrorMsg('Company name already exists.');
      return;
    }
    if (companyNameTakenCheck?.loading) {
      setLoading(true);
      const dup = await checkOrganizationNameTaken(companyTrim);
      setLoading(false);
      if (dup.error) {
        setErrorMsg(dup.error.message);
        return;
      }
      if (dup.taken) {
        setErrorMsg('Company name already exists.');
        return;
      }
    }
    if (!trimmedEmail) {
      setErrorMsg('Please enter email.');
      return;
    }
    if (!extractIndianMobileTenDigits(phone)) {
      setErrorMsg('Please enter your phone number.');
      return;
    }
    const phoneErr = validatePhone(phone);
    if (phoneErr) {
      setErrorMsg(phoneErr);
      return;
    }
    const storedPhone = normalizeIndianPhoneForMetadata(phone);
    if (!storedPhone) {
      setErrorMsg('Please enter a valid phone number.');
      return;
    }
    setLoading(true);
    const existing = await checkExistingUserByPhone(storedPhone);
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
              router.replace(`/sign-in?direct=1&email=${encodeURIComponent(existing.email!)}`),
          },
        ]
      );
      return;
    }

    setLoading(true);
    const { error } = await signUp(
      trimmedEmail,
      password,
      fullName.trim() || undefined,
      'user',
      operatingModel,
      storedPhone,
      companyTrim,
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

  const form = (
    <View style={[styles.formCard, isDesktopLayout && styles.formCardDesktop]}>
      <Text style={[styles.title, isDesktopLayout && styles.titleDesktop]}>Create Account</Text>
      <Text style={[styles.subtitle, isDesktopLayout && styles.subtitleDesktop]}>Enter your details to get started.</Text>

      {errorMsg ? (
        <View style={styles.errorAlert}>
          <FontAwesome name="exclamation-circle" size={18} color={Theme.negative} style={styles.errorIcon} />
          <Text style={styles.errorText}>{errorMsg}</Text>
        </View>
      ) : null}

      <View
        style={styles.inputWrap}
        onLayout={(e) => { fieldYRef.current.fullName = e.nativeEvent.layout.y; }}
      >
        <TextInput
          style={[styles.input, isDesktopLayout && styles.inputDesktop, styles.inputNoMargin]}
          placeholder="Full Name"
          placeholderTextColor={Theme.textMuted}
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
          style={[styles.input, isDesktopLayout && styles.inputDesktop, styles.inputNoMargin]}
          placeholder="Company Name"
          placeholderTextColor={Theme.textMuted}
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
      {companyName.trim().length > 0 ? (
        companyNameTakenCheck?.loading ? (
          <Text style={styles.phoneExistsHint}>Checking company name...</Text>
        ) : companyNameTakenCheck?.taken ? (
          <Text style={[styles.phoneExistsText, styles.companyTakenHint]}>
            Company name already exists.
          </Text>
        ) : null
      ) : null}

      <View
        style={styles.inputWrap}
        onLayout={(e) => { fieldYRef.current.phone = e.nativeEvent.layout.y; }}
      >
        <View
          style={[
            styles.phoneFieldShell,
            isDesktopLayout && styles.phoneFieldShellDesktop,
          ]}
        >
          <Text
            style={[styles.phoneDialCode, isDesktopLayout && styles.phoneDialCodeDesktop]}
            accessibilityRole="text"
          >
            +91
          </Text>
          <TextInput
            style={[
              styles.phoneNationalInput,
              isDesktopLayout && styles.phoneNationalInputDesktop,
            ]}
            placeholder="98765 43210"
            placeholderTextColor={Theme.textMuted}
            value={phone}
            onChangeText={(text) => setPhone(formatMobileNumber(text))}
            maxLength={10}
            onFocus={() => scrollToField('phone')}
            keyboardType="phone-pad"
            autoCorrect={false}
            spellCheck={false}
            autoComplete="tel-national"
            editable={!loading}
          />
        </View>
      </View>
      {phoneExistsCheck?.loading ? (
        <Text style={styles.phoneExistsHint}>Checking...</Text>
      ) : phoneExistsCheck?.exists ? (
        <View style={styles.phoneExistsRow}>
          <Text style={styles.phoneExistsText}>This number is already registered.</Text>
        </View>
      ) : null}

      <Text style={[styles.label, isDesktopLayout && styles.labelDesktop]}>Business model</Text>
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
              <Text style={[styles.modelChipText, isDesktopLayout && styles.modelChipTextDesktop, isActive && styles.modelChipTextActive]}>
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View
        style={styles.inputWrap}
        onLayout={(e) => { fieldYRef.current.email = e.nativeEvent.layout.y; }}
      >
        <TextInput
          style={[styles.input, isDesktopLayout && styles.inputDesktop, styles.inputNoMargin]}
          placeholder="Email Address"
          placeholderTextColor={Theme.textMuted}
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
          style={[styles.inputPassword, isDesktopLayout && styles.inputPasswordDesktop]}
          placeholder="Password"
          placeholderTextColor={Theme.textMuted}
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
          <FontAwesome name={showPassword ? 'eye-slash' : 'eye'} size={18} color={isDesktopLayout ? 'rgba(148,163,184,0.8)' : Theme.textMuted} />
        </TouchableOpacity>
      </View>

      <View
        style={[styles.passwordRow, styles.inputWrap]}
        onLayout={(e) => { fieldYRef.current.confirmPassword = e.nativeEvent.layout.y; }}
      >
        <TextInput
          style={[styles.inputPassword, isDesktopLayout && styles.inputPasswordDesktop]}
          placeholder="Confirm Password"
          placeholderTextColor={Theme.textMuted}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          onFocus={() => scrollToField('confirmPassword')}
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
          <FontAwesome name={showPassword ? 'eye-slash' : 'eye'} size={18} color={isDesktopLayout ? 'rgba(148,163,184,0.8)' : Theme.textMuted} />
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={[styles.button, (loading || !isOnline) && styles.buttonDisabled]}
        onPress={handleSignUp}
        disabled={loading || !isOnline}
      >
        {loading ? (
          <ActivityIndicator color={Theme.textOnPrimary} />
        ) : (
          <Text style={styles.buttonText}>Create Account</Text>
        )}
      </TouchableOpacity>

      <View style={styles.footer}>
        <Text style={styles.footerMuted}>Already have an account? </Text>
        <Link href="/sign-in?direct=1" asChild>
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
      {Platform.OS === 'web' ? (
        <View style={styles.footer}>
          <Link href="/terminal-website" asChild>
            <TouchableOpacity disabled={loading} activeOpacity={0.8}>
              <Text style={styles.footerLink}>← Back to website</Text>
            </TouchableOpacity>
          </Link>
        </View>
      ) : null}
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={[
        styles.container,
        isDesktopLayout && styles.containerDesktop,
        { paddingTop: insets.top, paddingBottom: insets.bottom },
      ]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
    >
      {!isOnline ? (
        <View style={[styles.offlineBanner, { paddingTop: insets.top + 10 }]}>
          <Text style={styles.offlineText}>No internet connection. Connect to create an account.</Text>
        </View>
      ) : null}
      {isDesktopLayout ? (
        <View style={styles.desktopShell}>
          <View style={styles.desktopBrandPane}>
            <Text style={styles.brandLogo}>PULSE<Text style={styles.brandLogoDot}>.</Text></Text>
            <Text style={styles.brandTag}>Business Hub Onboarding</Text>
            <Text style={styles.brandTitle}>Build your workspace.</Text>
            <Text style={styles.brandDescription}>
              Organize your fleet and logistics manifest with Pulse intelligence.
            </Text>
          </View>
          <View style={styles.desktopFormPane}>
            <ScrollView
              ref={scrollRef}
              contentContainerStyle={styles.desktopScroll}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {form}
            </ScrollView>
          </View>
        </View>
      ) : (
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={scrollContentStyle}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={keyboardVisible}
        >
          <View style={styles.mobileWrap}>{form}</View>
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020617',
    paddingHorizontal: Layout.screenPaddingHorizontal,
  },
  containerDesktop: {
    paddingHorizontal: 0,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingTop: 24,
    paddingBottom: 24,
  },
  mobileWrap: {
    width: '100%',
    alignItems: 'center',
  },
  desktopShell: {
    flex: 1,
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 0,
    overflow: 'hidden',
    marginVertical: 0,
    backgroundColor: '#020617',
  },
  desktopBrandPane: {
    flex: 1,
    backgroundColor: '#000000',
    paddingHorizontal: 52,
    paddingVertical: 48,
    justifyContent: 'center',
  },
  desktopFormPane: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  desktopScroll: {
    paddingHorizontal: 48,
    paddingVertical: 48,
  },
  brandLogo: {
    fontSize: 44,
    fontWeight: '900',
    color: Theme.textOnDark,
    marginBottom: 14,
  },
  brandLogoDot: {
    color: Theme.driverPrimary,
  },
  brandTag: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 2,
    fontWeight: '700',
    color: 'rgba(148,163,184,0.75)',
    marginBottom: 18,
  },
  brandTitle: {
    fontSize: 40,
    fontWeight: '900',
    color: Theme.textOnDark,
    letterSpacing: -0.8,
    marginBottom: 12,
  },
  brandDescription: {
    fontSize: 15,
    lineHeight: 24,
    color: 'rgba(148,163,184,0.75)',
    maxWidth: 420,
  },
  formCard: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.border,
    borderRadius: 24,
    padding: 22,
  },
  formCardDesktop: {
    maxWidth: 9999,
    borderWidth: 0,
    borderRadius: 0,
    padding: 0,
    backgroundColor: 'transparent',
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
  },
  title: {
    fontSize: 36,
    fontWeight: '900',
    color: Theme.textPrimaryDark,
    marginBottom: 6,
    letterSpacing: -0.8,
  },
  titleDesktop: {
    color: Theme.textOnDark,
  },
  subtitle: {
    fontSize: 14,
    color: Theme.textMuted,
    marginBottom: 14,
  },
  subtitleDesktop: {
    color: 'rgba(148,163,184,0.9)',
  },
  inputDesktop: {
    backgroundColor: '#020617',
    borderColor: 'rgba(255,255,255,0.14)',
    color: Theme.textOnDark,
  },
  errorAlert: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: Theme.negativeMuted,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.negative,
    padding: 12,
    marginBottom: 14,
  },
  errorIcon: {
    marginRight: 12,
    marginTop: 2,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    color: Theme.negative,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: Theme.textMuted,
    marginBottom: 8,
    letterSpacing: 1,
  },
  labelDesktop: {
    color: 'rgba(148,163,184,0.9)',
  },
  modelRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  modelChip: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.border,
    backgroundColor: Theme.surface,
    alignItems: 'center',
  },
  modelChipActive: {
    backgroundColor: Theme.driverPrimary,
    borderColor: Theme.driverPrimary,
  },
  modelChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: Theme.textMuted,
  },
  modelChipTextDesktop: {
    color: 'rgba(148,163,184,0.85)',
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
    marginBottom: 12,
  },
  inputNoMargin: {
    marginBottom: 0,
  },
  phoneFieldShell: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.border,
    paddingHorizontal: 12,
    minHeight: 54,
    marginBottom: 16,
  },
  phoneFieldShellDesktop: {
    backgroundColor: '#020617',
    borderColor: 'rgba(255,255,255,0.14)',
  },
  phoneDialCode: {
    fontSize: 16,
    fontWeight: '700',
    color: Theme.textPrimaryDark,
    paddingVertical: 12,
    paddingRight: 12,
    marginRight: 4,
    borderRightWidth: 1,
    borderRightColor: Theme.border,
  },
  phoneDialCodeDesktop: {
    color: Theme.textOnDark,
    borderRightColor: 'rgba(255,255,255,0.14)',
  },
  phoneNationalInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 16,
    fontWeight: '600',
    color: Theme.textPrimaryDark,
    paddingVertical: 12,
    paddingHorizontal: 10,
    ...Platform.select({
      web: { outlineStyle: 'none' } as object,
    }),
  },
  phoneNationalInputDesktop: {
    color: Theme.textOnDark,
  },
  companyTakenHint: {
    marginTop: -4,
    marginBottom: 8,
  },
  phoneExistsHint: {
    fontSize: 13,
    color: Theme.textMuted,
    marginTop: -4,
    marginBottom: 8,
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
    color: Theme.driverEmerald,
  },
  phoneExistsLink: {
    fontSize: 13,
    fontWeight: '600',
    color: Theme.authPrimary,
    textDecorationLine: 'underline',
  },
  passwordRow: {
    position: 'relative',
    marginBottom: 12,
  },
  inputPassword: {
    backgroundColor: Theme.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Theme.border,
    paddingHorizontal: 16,
    paddingVertical: 15,
    paddingRight: 48,
    fontSize: 16,
    color: Theme.textPrimaryDark,
  },
  inputPasswordDesktop: {
    backgroundColor: '#020617',
    borderColor: 'rgba(255,255,255,0.14)',
    color: Theme.textOnDark,
  },
  eyeButton: {
    position: 'absolute',
    right: 16,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  button: {
    backgroundColor: Theme.driverPrimary,
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: Theme.driverPrimary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 14,
    elevation: 4,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: Theme.textOnPrimary,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 14,
  },
  footerMuted: {
    fontSize: 13,
    color: Theme.textMuted,
    fontWeight: '500',
  },
  footerLink: {
    fontSize: 13,
    color: Theme.driverEmerald,
    fontWeight: '700',
  },
});
