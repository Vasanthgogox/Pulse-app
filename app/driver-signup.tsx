/**
 * Driver sign-up: multi-step widget (moving pages).
 * Step 1: Phone number
 * Step 2: OTP entry (UI only; any 4 digits to proceed)
 * Step 3: Full name, email, password
 * Step 4: Choose avatar
 * Step 5: Success, go to app
 */
import { ALL_PRESET_AVATARS, getAvatarUriForSeed } from '@/constants/DriverLevels';
import Theme from '@/constants/Theme';
import { useAuth } from '@/contexts/AuthContext';
import { useIsOnline } from '@/contexts/NetworkContext';
import { checkExistingUserByPhone } from '@/features/auth';
import { validateEmail } from '@/lib/emailValidation';
import { isPhoneValid, validatePhone } from '@/lib/phoneValidation';
import { formatMobileNumber } from '@/lib/format';
import { useSafeBack } from '@/lib/useSafeBack';
import { VALIDATION, validatePassword } from '@/lib/validation';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
    KeyboardAvoidingView,
    NativeSyntheticEvent,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TextInputKeyPressEventData,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const DRIVER_AVATAR_STORAGE_KEY = 'driver_avatar_seed';

// Professional wording per step (title + subtitle), no "Step 1/2" labels
const STEP_CONTENT = [
  { title: 'Welcome aboard or back', subtitle: 'To sign up or log in, enter your number' },
  { title: 'Enter 4 digit code', subtitle: 'We sent a code to your number. Enter the code in that message.' },
  { title: 'Finish signing up', subtitle: 'Enter your name, email and password to complete your profile.' },
  { title: 'Driving license', subtitle: 'Upload or capture your driving license to continue.' },
  { title: 'Aadhaar', subtitle: 'Upload or capture your Aadhaar card to continue.' },
  { title: 'PAN', subtitle: 'Upload or capture your PAN card to continue.' },
  { title: 'Choose your photo', subtitle: 'Pick a profile photo to finish your profile.' },
  { title: "You're in", subtitle: 'Your account is ready. You can start using the driver app.' },
];

const OTP_LENGTH = 4;

const INDIA_DIAL_CODE = '91';

// Light theme for driver signup (white bg, dark text, green/black accents)
const LIGHT = {
  background: '#ffffff',
  surface: '#f8fafc',
  border: '#e2e8f0',
  text: '#0f172a',
  textMuted: '#64748b',
  inputBg: '#ffffff',
  placeholder: '#94a3b8',
  accent: Theme.driverEmerald,
  buttonPrimary: Theme.driverEmerald,
};

// Validation limits (aligned with lib/validation.ts)
const NAME_MIN_LENGTH = 2;
const NAME_MAX_LENGTH = 100;
const EMAIL_MAX_LENGTH = 255;

/** Normalize phone: strip spaces, allow optional leading +, then digits only. */
function normalizePhone(raw: string): string {
  const trimmed = raw.trim().replace(/\s+/g, '');
  const withPlus = trimmed.startsWith('+') ? trimmed.slice(1) : trimmed;
  return withPlus.replace(/\D/g, '');
}

/** Full phone for API (India: +91 + 10 digits). */
function getFullPhoneIndia(national: string): string {
  const digits = normalizePhone(national);
  return digits.length === 10 ? `+${INDIA_DIAL_CODE}${digits}` : '';
}

/** Step 1 valid: 10-digit Indian number. */
function isPhoneStepValid(national: string): boolean {
  const digits = normalizePhone(national);
  return digits.length === 10 && isPhoneValid(digits);
}

/** Inline phone error for Step 1 (India 10 digits). */
function getPhoneInlineError(national: string): string | null {
  const t = national.trim();
  if (t.length === 0) return null;
  const digits = normalizePhone(national);
  if (digits.length !== 10) return digits.length > 10 ? 'Enter at most 10 digits.' : 'Enter a 10-digit number.';
  return validatePhone(digits);
}

/** Step 2 valid: name, email (required and valid), password valid. */
function isStep2Valid(
  callsign: string,
  email: string,
  pwd: string,
  confirmPwd: string,
): boolean {
  const name = callsign.trim();
  if (name.length < NAME_MIN_LENGTH || name.length > NAME_MAX_LENGTH) return false;
  if (!email.trim()) return false;
  if (validateEmail(email) !== null) return false;
  if (validatePassword(pwd) !== null) return false;
  if (pwd !== confirmPwd) return false;
  return true;
}

export default function DriverSignUpScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const router = useRouter();
  const safeBack = useSafeBack('/sign-in');
  const { signIn, signUp, signInWithGoogle } = useAuth();
  const isOnline = useIsOnline();
  const scrollRef = useRef<ScrollView>(null);

  const [step, setStep] = useState(0);
  const [phone, setPhone] = useState('');
  const [otpValue, setOtpValue] = useState('');
  const [callsign, setCallsign] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [avatarSeed, setAvatarSeed] = useState(ALL_PRESET_AVATARS[0].seed);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [licenseUploaded, setLicenseUploaded] = useState(false);
  const [aadhaarUploaded, setAadhaarUploaded] = useState(false);
  const [panUploaded, setPanUploaded] = useState(false);
  const [licenseUploadMethod, setLicenseUploadMethod] = useState<'gallery' | 'camera' | null>(null);
  const [aadhaarUploadMethod, setAadhaarUploadMethod] = useState<'gallery' | 'camera' | null>(null);
  const [panUploadMethod, setPanUploadMethod] = useState<'gallery' | 'camera' | null>(null);
  const [phoneExistsCheck, setPhoneExistsCheck] = useState<{
    loading: boolean;
    exists: boolean;
    email?: string;
    masked_email?: string;
  } | null>(null);
  const phoneCheckTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const otpInputRef = useRef<TextInput>(null);
  const fieldYRef = useRef({ callsign: 0, email: 0, password: 0, confirmPassword: 0 });
  const isDesktop = width >= 1024;
  const pageWidth = isDesktop ? Math.min(560, width - 120) : width;

  /** Extra scroll offset so focused field stays above keyboard. Use larger offset on iOS when focusing password so the field stays above the "Strong Password" / autofill bar. */
  const SCROLL_OFFSET_DEFAULT = 100;
  const SCROLL_OFFSET_PASSWORD_IOS = 220;

  const scrollToField = (name: keyof typeof fieldYRef.current) => {
    const isPasswordOnIos = name === 'password' && Platform.OS === 'ios';
    const offset = isPasswordOnIos ? SCROLL_OFFSET_PASSWORD_IOS : SCROLL_OFFSET_DEFAULT;
    setTimeout(() => {
      const y = fieldYRef.current[name];
      scrollRef.current?.scrollTo({
        x: step * pageWidth,
        y: Math.max(0, y - offset),
        animated: true,
      });
    }, 80);
  };

  const fullPhoneForApi = getFullPhoneIndia(phone);

  useEffect(() => {
    if (!fullPhoneForApi) {
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
      const result = await checkExistingUserByPhone(fullPhoneForApi);
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
  }, [fullPhoneForApi, isOnline]);

  const phoneInlineError = getPhoneInlineError(phone);

  const goToPage = (index: number) => {
    setStep(index);
    scrollRef.current?.scrollTo({ x: index * pageWidth, animated: true });
  };

  const validatePhoneStep = async () => {
    if (!phone.trim()) {
      Alert.alert('Required', 'Enter your 10-digit mobile number.');
      return;
    }
    const err = getPhoneInlineError(phone);
    if (err) {
      Alert.alert('Invalid', err);
      return;
    }
    if (!isOnline) {
      Alert.alert('No internet', 'Connect to the internet to continue.');
      return;
    }
    setLoading(true);
    const existing = await checkExistingUserByPhone(fullPhoneForApi);
    setLoading(false);
    if (existing.error) {
      Alert.alert('Check failed', existing.error.message);
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
    goToPage(1);
  };

  const handleGoogleDriverSignIn = async () => {
    if (!isOnline) {
      Alert.alert("No internet", "Connect to the internet to continue.");
      return;
    }
    setLoading(true);
    try {
      const { error } = await signInWithGoogle({
        role: "driver",
        operatingModel: "ASSET_BASED",
      });
      if (error) throw error;
      router.replace("/");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Google sign in failed";
      Alert.alert(
        "Error",
        msg.includes("Cannot reach server")
          ? "Cannot reach server. Check your connection."
          : msg
      );
    } finally {
      setLoading(false);
    }
  };

  const verifyOtpStep = () => {
    if (otpValue.length !== OTP_LENGTH) return;
    goToPage(2);
  };

  const handleOtpChange = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, OTP_LENGTH);
    setOtpValue(digits);
  };

  const handleOtpKeyPress = (e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
    if (e.nativeEvent.key === 'Backspace' && otpValue.length > 0) {
      setOtpValue((prev) => prev.slice(0, -1));
    }
  };

  const confirmRegistry = () => {
    const name = callsign.trim();
    if (name.length === 0) {
      Alert.alert('Required', 'Enter your full name.');
      return;
    }
    if (name.length < NAME_MIN_LENGTH) {
      Alert.alert('Invalid', `Full name must be at least ${NAME_MIN_LENGTH} characters.`);
      return;
    }
    if (name.length > NAME_MAX_LENGTH) {
      Alert.alert('Invalid', `Full name must be at most ${NAME_MAX_LENGTH} characters.`);
      return;
    }
    if (!email.trim()) {
      Alert.alert('Required', 'Enter your email.');
      return;
    }
    const emailErr = validateEmail(email);
    if (emailErr) {
      Alert.alert('Invalid', emailErr);
      return;
    }
    const pwdErr = validatePassword(password);
    if (pwdErr) {
      Alert.alert('Invalid', pwdErr);
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Invalid', 'Passwords do not match.');
      return;
    }
    goToPage(3);
  };

  const establishLink = async () => {
    if (!isOnline) {
      Alert.alert('No internet', 'Connect to the internet to complete sign up.');
      return;
    }
    if (!fullPhoneForApi) {
      Alert.alert('Invalid', 'Enter a valid phone number to continue.');
      return;
    }
    setLoading(true);
    try {
      await AsyncStorage.setItem(DRIVER_AVATAR_STORAGE_KEY, avatarSeed);
      const { error } = await signUp(
        email.trim(),
        password,
        callsign.trim(),
        'driver',
        'ASSET_BASED',
        fullPhoneForApi || undefined
      );
      if (error && !error.message.toLowerCase().includes('already registered')) {
        throw error;
      }
      const signInResult = await signIn(email.trim(), password, true);
      if (signInResult.error) {
        throw signInResult.error;
      }
      goToPage(7);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Sign up failed';
      Alert.alert('Error', msg.includes('Cannot reach server') ? 'Cannot reach server. Check your connection.' : msg);
    } finally {
      setLoading(false);
    }
  };

  const initializeHub = () => {
    router.replace('/');
  };

  const markDocumentUploaded = (doc: 'license' | 'aadhaar' | 'pan', method: 'gallery' | 'camera') => {
    if (doc === 'license') {
      setLicenseUploaded(true);
      setLicenseUploadMethod(method);
      return;
    }
    if (doc === 'aadhaar') {
      setAadhaarUploaded(true);
      setAadhaarUploadMethod(method);
      return;
    }
    setPanUploaded(true);
    setPanUploadMethod(method);
  };

  const handleBack = () => {
    if (step > 0) {
      goToPage(step - 1);
    } else {
      safeBack();
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 20 : 0}
    >
      <TouchableOpacity
        style={[styles.backLink, isDesktop && styles.backLinkDesktop, { paddingTop: insets.top + 8 }]}
        onPress={handleBack}
        hitSlop={12}
      >
        <FontAwesome name="chevron-left" size={20} color={LIGHT.textMuted} />
        <Text style={styles.backLinkText}>{step === 0 ? 'Back to sign up' : 'Back'}</Text>
      </TouchableOpacity>
      <View style={[styles.brandRow, isDesktop && styles.brandRowDesktop]}>
        <Text style={styles.brandText}>PULSE.</Text>
      </View>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        style={[styles.pagesScroller, isDesktop && styles.pagesScrollerDesktop]}
        contentContainerStyle={styles.pagesWrap}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {/* Step 1: Welcome – India phone only */}
        <View style={[styles.page, { width: pageWidth }]}>
          <View style={styles.pageContent}>
            <Text style={styles.mainTitle}>{STEP_CONTENT[0].title}</Text>
            <Text style={styles.subTitle}>{STEP_CONTENT[0].subtitle}</Text>
            <View style={styles.inputGroup}>
              <Text style={styles.fieldLabel}>Phone</Text>
              <View style={[styles.inputRow, phoneInlineError && styles.inputRowError]}>
                <Text style={styles.flagIcon}>🇮🇳</Text>
                <Text style={styles.dialCode}>+91</Text>
                <TextInput
                  style={styles.phoneInput}
                  placeholder="000 000 0000"
                  placeholderTextColor={LIGHT.placeholder}
                  value={phone}
                  onChangeText={(text) => setPhone(formatMobileNumber(text))}
                  keyboardType="phone-pad"
                  maxLength={10}
                  autoCorrect={false}
                  spellCheck={false}
                  autoComplete="tel"
                  editable={!loading}
                  cursorColor={LIGHT.text}
                  selectionColor="rgba(15,23,42,0.2)"
                />
              </View>
              {phoneInlineError ? <Text style={styles.fieldError}>{phoneInlineError}</Text> : null}
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
            </View>
            <TouchableOpacity
              style={[styles.primaryBtn, (!isPhoneStepValid(phone) || loading) && styles.primaryBtnDisabled]}
              onPress={validatePhoneStep}
              disabled={!isPhoneStepValid(phone) || loading}
              activeOpacity={0.8}
            >
              <Text style={styles.primaryBtnText}>Continue with phone</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.googleBtn, loading && styles.primaryBtnDisabled]}
              onPress={handleGoogleDriverSignIn}
              disabled={loading}
              activeOpacity={0.85}
            >
              <FontAwesome name="google" size={18} color={LIGHT.text} />
              <Text style={styles.googleBtnText}>Continue with Google</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Step 2: OTP entry */}
        <View style={[styles.page, { width: pageWidth }]}>
          <View style={styles.pageContent}>
            <Text style={styles.mainTitle}>{STEP_CONTENT[1].title}</Text>
            <Text style={styles.subTitle}>
              We sent a code to {phone.trim().length === 10 ? `+91 ${phone.replace(/(\d{5})(\d{5})/, '$1 $2')}` : 'your number'}. Enter the code in that message.
            </Text>
            <TouchableOpacity
              style={styles.otpBoxRow}
              onPress={() => otpInputRef.current?.focus()}
              activeOpacity={1}
            >
              {Array.from({ length: OTP_LENGTH }).map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.otpBox,
                    otpValue.length === i && styles.otpBoxFocused,
                  ]}
                >
                  <Text style={styles.otpBoxDigit}>{otpValue[i] ?? ''}</Text>
                </View>
              ))}
            </TouchableOpacity>
            <TextInput
              ref={otpInputRef}
              value={otpValue}
              onChangeText={handleOtpChange}
              onKeyPress={handleOtpKeyPress}
              keyboardType="number-pad"
              maxLength={OTP_LENGTH}
              style={styles.otpHiddenInput}
              caretHidden
            />
            <TouchableOpacity
              style={[styles.primaryBtn, (otpValue.length !== OTP_LENGTH || loading) && styles.primaryBtnDisabled]}
              onPress={verifyOtpStep}
              disabled={otpValue.length !== OTP_LENGTH || loading}
              activeOpacity={0.8}
            >
              <Text style={styles.primaryBtnText}>Verify OTP</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.tryAgainLink}
              onPress={() => {}}
              hitSlop={12}
            >
              <Text style={styles.tryAgainText}>Didn&apos;t get it? Try again</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Step 3: Your details */}
        <View style={[styles.page, { width: pageWidth }]}>
          <View style={styles.pageContent}>
            <Text style={styles.mainTitle}>{STEP_CONTENT[2].title}</Text>
            <Text style={styles.subTitle}>{STEP_CONTENT[2].subtitle}</Text>
            <View style={styles.inputGroup}>
              <Text style={styles.fieldLabel}>Full name</Text>
              <View
                style={styles.inputWrap}
                onLayout={(e) => { fieldYRef.current.callsign = e.nativeEvent.layout.y; }}
              >
                <TextInput
                  style={styles.input}
                  placeholder="Your name"
                  placeholderTextColor={LIGHT.placeholder}
                  value={callsign}
                  onChangeText={setCallsign}
                  onFocus={() => scrollToField('callsign')}
                  maxLength={NAME_MAX_LENGTH}
                  autoCapitalize="words"
                  autoCorrect={false}
                  spellCheck={false}
                  autoComplete="off"
                  editable={!loading}
                  cursorColor={LIGHT.text}
                  selectionColor="rgba(15,23,42,0.2)"
                />
              </View>
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.fieldLabel}>Email</Text>
              <View
                style={styles.inputWrap}
                onLayout={(e) => { fieldYRef.current.email = e.nativeEvent.layout.y; }}
              >
                <TextInput
                  style={styles.input}
                  placeholder="you@example.com"
                  placeholderTextColor={LIGHT.placeholder}
                  value={email}
                  onChangeText={setEmail}
                  onFocus={() => scrollToField('email')}
                  keyboardType="email-address"
                  maxLength={EMAIL_MAX_LENGTH}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="off"
                  spellCheck={false}
                  editable={!loading}
                  cursorColor={LIGHT.text}
                  selectionColor="rgba(15,23,42,0.2)"
                />
              </View>
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.fieldLabel}>Password</Text>
              <View
                style={[styles.inputWrap, styles.passwordRow]}
                onLayout={(e) => { fieldYRef.current.password = e.nativeEvent.layout.y; }}
              >
                <TextInput
                  style={styles.inputPassword}
                  placeholder="At least 6 characters"
                  placeholderTextColor={LIGHT.placeholder}
                  value={password}
                  onChangeText={setPassword}
                  onFocus={() => scrollToField('password')}
                  maxLength={VALIDATION.PASSWORD_MAX_LENGTH}
                  secureTextEntry={!showPassword}
                  autoCorrect={false}
                  spellCheck={false}
                  autoComplete="off"
                  editable={!loading}
                  cursorColor={LIGHT.text}
                  selectionColor="rgba(15,23,42,0.2)"
                />
                <TouchableOpacity
                  onPress={() => setShowPassword((v) => !v)}
                  style={styles.eyeButton}
                  hitSlop={12}
                  accessible
                  accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                >
                  <FontAwesome
                    name={showPassword ? 'eye-slash' : 'eye'}
                    size={22}
                    color={LIGHT.textMuted}
                  />
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.fieldLabel}>Confirm password</Text>
              <View
                style={[styles.inputWrap, styles.passwordRow]}
                onLayout={(e) => { fieldYRef.current.confirmPassword = e.nativeEvent.layout.y; }}
              >
                <TextInput
                  style={styles.inputPassword}
                  placeholder="Re-enter your password"
                  placeholderTextColor={LIGHT.placeholder}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  onFocus={() => scrollToField('confirmPassword')}
                  maxLength={VALIDATION.PASSWORD_MAX_LENGTH}
                  secureTextEntry={!showConfirmPassword}
                  autoCorrect={false}
                  spellCheck={false}
                  autoComplete="off"
                  editable={!loading}
                  cursorColor={LIGHT.text}
                  selectionColor="rgba(15,23,42,0.2)"
                />
                <TouchableOpacity
                  onPress={() => setShowConfirmPassword((v) => !v)}
                  style={styles.eyeButton}
                  hitSlop={12}
                  accessible
                  accessibilityLabel={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                >
                  <FontAwesome
                    name={showConfirmPassword ? 'eye-slash' : 'eye'}
                    size={22}
                    color={LIGHT.textMuted}
                  />
                </TouchableOpacity>
              </View>
            </View>
            <TouchableOpacity
              style={[styles.primaryBtn, (!isStep2Valid(callsign, email, password, confirmPassword) || loading) && styles.primaryBtnDisabled]}
              onPress={confirmRegistry}
              disabled={!isStep2Valid(callsign, email, password, confirmPassword) || loading}
              activeOpacity={0.8}
            >
              <Text style={styles.primaryBtnText}>Next</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Step 4: Driving license */}
        <View style={[styles.page, { width: pageWidth }]}>
          <View style={styles.pageContent}>
            <Text style={styles.mainTitle}>{STEP_CONTENT[3].title}</Text>
            <Text style={styles.subTitle}>{STEP_CONTENT[3].subtitle}</Text>
            <View style={styles.docActionsWrap}>
              <TouchableOpacity
                style={styles.docActionBtn}
                onPress={() => markDocumentUploaded('license', 'gallery')}
                activeOpacity={0.8}
              >
                <FontAwesome name="image" size={18} color={LIGHT.text} />
                <Text style={styles.docActionText}>Upload from gallery</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.docActionBtn}
                onPress={() => markDocumentUploaded('license', 'camera')}
                activeOpacity={0.8}
              >
                <FontAwesome name="camera" size={18} color={LIGHT.text} />
                <Text style={styles.docActionText}>Open camera</Text>
              </TouchableOpacity>
            </View>
            <Text style={[styles.docStatus, licenseUploaded ? styles.docStatusDone : styles.docStatusPending]}>
              {licenseUploaded
                ? `Uploaded${licenseUploadMethod ? ` via ${licenseUploadMethod === 'gallery' ? 'gallery' : 'camera'}` : ''}`
                : 'Not uploaded'}
            </Text>
            <TouchableOpacity
              style={[styles.primaryBtn, (!licenseUploaded || loading) && styles.primaryBtnDisabled]}
              onPress={() => goToPage(4)}
              disabled={!licenseUploaded || loading}
              activeOpacity={0.8}
            >
              <Text style={styles.primaryBtnText}>Continue</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Step 5: Aadhaar */}
        <View style={[styles.page, { width: pageWidth }]}>
          <View style={styles.pageContent}>
            <Text style={styles.mainTitle}>{STEP_CONTENT[4].title}</Text>
            <Text style={styles.subTitle}>{STEP_CONTENT[4].subtitle}</Text>
            <View style={styles.docActionsWrap}>
              <TouchableOpacity
                style={styles.docActionBtn}
                onPress={() => markDocumentUploaded('aadhaar', 'gallery')}
                activeOpacity={0.8}
              >
                <FontAwesome name="image" size={18} color={LIGHT.text} />
                <Text style={styles.docActionText}>Upload from gallery</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.docActionBtn}
                onPress={() => markDocumentUploaded('aadhaar', 'camera')}
                activeOpacity={0.8}
              >
                <FontAwesome name="camera" size={18} color={LIGHT.text} />
                <Text style={styles.docActionText}>Open camera</Text>
              </TouchableOpacity>
            </View>
            <Text style={[styles.docStatus, aadhaarUploaded ? styles.docStatusDone : styles.docStatusPending]}>
              {aadhaarUploaded
                ? `Uploaded${aadhaarUploadMethod ? ` via ${aadhaarUploadMethod === 'gallery' ? 'gallery' : 'camera'}` : ''}`
                : 'Not uploaded'}
            </Text>
            <TouchableOpacity
              style={[styles.primaryBtn, (!aadhaarUploaded || loading) && styles.primaryBtnDisabled]}
              onPress={() => goToPage(5)}
              disabled={!aadhaarUploaded || loading}
              activeOpacity={0.8}
            >
              <Text style={styles.primaryBtnText}>Continue</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Step 6: PAN */}
        <View style={[styles.page, { width: pageWidth }]}>
          <View style={styles.pageContent}>
            <Text style={styles.mainTitle}>{STEP_CONTENT[5].title}</Text>
            <Text style={styles.subTitle}>{STEP_CONTENT[5].subtitle}</Text>
            <View style={styles.docActionsWrap}>
              <TouchableOpacity
                style={styles.docActionBtn}
                onPress={() => markDocumentUploaded('pan', 'gallery')}
                activeOpacity={0.8}
              >
                <FontAwesome name="image" size={18} color={LIGHT.text} />
                <Text style={styles.docActionText}>Upload from gallery</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.docActionBtn}
                onPress={() => markDocumentUploaded('pan', 'camera')}
                activeOpacity={0.8}
              >
                <FontAwesome name="camera" size={18} color={LIGHT.text} />
                <Text style={styles.docActionText}>Open camera</Text>
              </TouchableOpacity>
            </View>
            <Text style={[styles.docStatus, panUploaded ? styles.docStatusDone : styles.docStatusPending]}>
              {panUploaded
                ? `Uploaded${panUploadMethod ? ` via ${panUploadMethod === 'gallery' ? 'gallery' : 'camera'}` : ''}`
                : 'Not uploaded'}
            </Text>
            <TouchableOpacity
              style={[styles.primaryBtn, (!panUploaded || loading) && styles.primaryBtnDisabled]}
              onPress={() => goToPage(6)}
              disabled={!panUploaded || loading}
              activeOpacity={0.8}
            >
              <Text style={styles.primaryBtnText}>Continue</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Step 7: Avatar */}
        <View style={[styles.page, { width: pageWidth }]}>
          <View style={styles.pageContent}>
            <Text style={styles.mainTitle}>{STEP_CONTENT[6].title}</Text>
            <Text style={styles.subTitle}>{STEP_CONTENT[6].subtitle}</Text>
            <View style={styles.avatarPreviewWrap}>
              <Image source={{ uri: getAvatarUriForSeed(avatarSeed) }} style={styles.avatarPreview} />
            </View>
            <View style={styles.avatarGrid}>
              {ALL_PRESET_AVATARS.map((av) => (
                <TouchableOpacity
                  key={av.seed}
                  style={[styles.avatarGridItem, avatarSeed === av.seed && styles.avatarGridItemActive]}
                  onPress={() => setAvatarSeed(av.seed)}
                  activeOpacity={0.8}
                  disabled={loading}
                >
                  <Image source={av.image} style={styles.avatarGridImg} />
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              style={[styles.primaryBtn, loading && styles.primaryBtnDisabled]}
              onPress={establishLink}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color={Theme.textOnPrimary} />
              ) : (
                <Text style={styles.primaryBtnText}>Create account</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Step 8: Success */}
        <View style={[styles.page, { width: pageWidth }]}>
          <View style={styles.pageContent}>
            <View style={styles.crownWrap}>
              <FontAwesome name="trophy" size={48} color={LIGHT.accent} />
            </View>
            <Text style={styles.successTitle}>{STEP_CONTENT[7].title}</Text>
            <Text style={styles.successMessage}>{STEP_CONTENT[7].subtitle}</Text>
            <TouchableOpacity style={styles.primaryBtn} onPress={initializeHub} activeOpacity={0.8}>
              <Text style={styles.primaryBtnText}>Go to app</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      {/* Step indicator */}
      <View style={[styles.stepIndicator, { paddingBottom: insets.bottom + 8 }]}>
        {STEP_CONTENT.map((_, i) => (
          <View
            key={i}
            style={[
              styles.stepDot,
              i === step && styles.stepDotActive,
              i < step && styles.stepDotDone,
            ]}
          />
        ))}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: LIGHT.background,
  },
  backLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingBottom: 8,
  },
  backLinkDesktop: {
    paddingHorizontal: 0,
    alignSelf: 'center',
    width: 560,
  },
  backLinkText: {
    fontSize: 14,
    color: LIGHT.textMuted,
    fontWeight: '600',
  },
  brandRow: {
    paddingHorizontal: 24,
    paddingBottom: 4,
  },
  brandRowDesktop: {
    paddingHorizontal: 0,
    alignSelf: 'center',
    width: 560,
  },
  brandText: {
    fontSize: 28,
    fontWeight: '900',
    fontStyle: 'italic',
    letterSpacing: -0.8,
    color: Theme.driverPrimary,
  },
  pagesWrap: {
    flexGrow: 1,
  },
  pagesScroller: {
    flex: 1,
  },
  pagesScrollerDesktop: {
    width: 560,
    alignSelf: 'center',
  },
  page: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
    justifyContent: 'flex-start',
  },
  pageContent: {
    maxWidth: 360,
    alignSelf: 'center',
    width: '100%',
  },
  logoWrap: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: LIGHT.surface,
    borderWidth: 1,
    borderColor: LIGHT.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    alignSelf: 'center',
  },
  mainTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: LIGHT.text,
    marginBottom: 10,
    letterSpacing: -0.5,
    textAlign: 'center',
    width: '100%',
  },
  subTitle: {
    fontSize: 16,
    fontWeight: '400',
    color: LIGHT.text,
    opacity: 0.85,
    marginBottom: 24,
    lineHeight: 22,
    textAlign: 'center',
    width: '100%',
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: LIGHT.textMuted,
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: LIGHT.inputBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: LIGHT.border,
  },
  inputWrap: {
    marginBottom: 20,
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  inputRowError: {
    borderColor: Theme.destructive,
  },
  flagIcon: {
    fontSize: 26,
    marginLeft: 14,
    marginRight: 6,
  },
  dialCode: {
    fontSize: 16,
    fontWeight: '600',
    color: LIGHT.text,
    marginRight: 8,
  },
  phoneInput: {
    flex: 1,
    minHeight: 48,
    paddingVertical: 14,
    paddingHorizontal: 12,
    fontSize: 16,
    color: LIGHT.text,
  },
  fieldError: {
    fontSize: 12,
    color: Theme.destructive,
    marginTop: 6,
    marginLeft: 2,
  },
  phoneExistsHint: {
    fontSize: 12,
    color: LIGHT.textMuted,
    marginTop: 6,
    marginLeft: 2,
  },
  phoneExistsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginTop: 6,
    marginLeft: 2,
  },
  phoneExistsText: {
    fontSize: 12,
    color: LIGHT.accent,
  },
  phoneExistsLink: {
    fontSize: 12,
    fontWeight: '600',
    color: LIGHT.accent,
    textDecorationLine: 'underline',
  },
  inputIcon: {
    marginLeft: 14,
    marginRight: 8,
  },
  eyeButton: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    minHeight: 48,
    paddingVertical: 14,
    paddingHorizontal: 14,
    fontSize: 16,
    paddingRight: 16,
    color: LIGHT.text,
    backgroundColor: LIGHT.inputBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: LIGHT.border,
  },
  inputPassword: {
    flex: 1,
    minHeight: 48,
    paddingVertical: 14,
    paddingHorizontal: 14,
    paddingRight: 50,
    fontSize: 16,
    color: LIGHT.text,
    backgroundColor: LIGHT.inputBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: LIGHT.border,
  },
  primaryBtn: {
    backgroundColor: LIGHT.buttonPrimary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryBtnDisabled: {
    opacity: 0.6,
  },
  primaryBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: 0.5,
  },
  googleBtn: {
    marginTop: 12,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
    borderWidth: 1,
    borderColor: LIGHT.border,
    backgroundColor: LIGHT.surface,
  },
  googleBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: LIGHT.text,
    letterSpacing: 0.2,
  },
  otpBoxRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 28,
  },
  otpBox: {
    width: 52,
    height: 56,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: LIGHT.border,
    backgroundColor: LIGHT.inputBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpBoxFocused: {
    borderColor: LIGHT.accent,
  },
  otpBoxDigit: {
    fontSize: 22,
    fontWeight: '700',
    color: LIGHT.text,
  },
  otpHiddenInput: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
  },
  tryAgainLink: {
    marginTop: 16,
    alignSelf: 'center',
  },
  tryAgainText: {
    fontSize: 14,
    color: LIGHT.textMuted,
    fontWeight: '500',
  },
  docActionsWrap: {
    gap: 12,
    marginBottom: 16,
  },
  docActionBtn: {
    minHeight: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: LIGHT.border,
    backgroundColor: LIGHT.surface,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  docActionText: {
    fontSize: 15,
    fontWeight: '600',
    color: LIGHT.text,
  },
  docStatus: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 12,
  },
  docStatusPending: {
    color: LIGHT.textMuted,
  },
  docStatusDone: {
    color: LIGHT.accent,
  },
  avatarPreviewWrap: {
    alignSelf: 'center',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: LIGHT.surface,
    borderWidth: 3,
    borderColor: LIGHT.accent,
    overflow: 'hidden',
    marginBottom: 24,
  },
  avatarPreview: {
    width: '100%',
    height: '100%',
    borderRadius: 60,
  },
  avatarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'center',
    marginBottom: 28,
  },
  avatarGridItem: {
    width: 64,
    height: 64,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: LIGHT.border,
    backgroundColor: LIGHT.surface,
  },
  avatarGridItemActive: {
    borderColor: LIGHT.accent,
  },
  avatarGridImg: {
    width: '100%',
    height: '100%',
  },
  crownWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: LIGHT.surface,
    borderWidth: 1,
    borderColor: LIGHT.border,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 24,
  },
  successTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: LIGHT.text,
    textAlign: 'center',
    marginBottom: 16,
    letterSpacing: -0.5,
  },
  successMessage: {
    fontSize: 16,
    fontWeight: '400',
    color: LIGHT.text,
    opacity: 0.85,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 24,
  },
  successHighlight: {
    color: LIGHT.accent,
    fontWeight: '800',
    textDecorationLine: 'underline',
  },
  stepIndicator: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingTop: 16,
  },
  stepDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: LIGHT.border,
  },
  stepDotActive: {
    backgroundColor: LIGHT.accent,
    width: 24,
  },
  stepDotDone: {
    backgroundColor: LIGHT.accent,
    opacity: 0.6,
  },
});
