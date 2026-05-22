import Theme from '@/constants/Theme';
import { LoadingIndicator } from "@/components/LoadingIndicator";
import { useAuth } from '@/contexts/AuthContext';
import { useIsOnline } from '@/contexts/NetworkContext';
import {
  checkExistingUserByPhone,
  checkOrganizationNameTaken,
  setPendingOAuthMetadata,
  type OperatingModel,
} from '@/features/auth';
import { validateEmail } from '@/lib/emailValidation';
import { ROUTES } from '@/lib/routes';
import { formatMobileNumber } from '@/lib/format';
import INDIA_LOCATIONS from '@/lib/indiaLocations.json';
import {
  extractIndianMobileTenDigits,
  isPhoneValid,
  normalizeIndianPhoneForMetadata,
  validatePhone,
} from '@/lib/phoneValidation';
import { validateFullName, validatePassword } from '@/lib/validation';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// ─── Types ────────────────────────────────────────────────────────────────────

type Zone = 'NORTH' | 'SOUTH' | 'EAST' | 'WEST' | 'NORTHEAST';
type IndiaLocation = { city: string; state: string; zone: Zone };
type BusinessType = 'SOLE_PROPRIETOR' | 'PARTNERSHIP' | 'PVT_LTD' | 'LLP' | 'OPC' | 'OTHER';
type EmployeeCount = '1-10' | '11-50' | '51-200' | '201-500' | '500+';

const ALL_LOCATIONS = INDIA_LOCATIONS as IndiaLocation[];
const ITEM_HEIGHT = 58;

const ZONE_LABELS: Record<Zone, string> = {
  NORTH: 'North Zone', SOUTH: 'South Zone', EAST: 'East Zone',
  WEST: 'West Zone', NORTHEAST: 'Northeast Zone',
};

const OPERATING_MODELS: { value: OperatingModel; label: string; sub: string }[] = [
  { value: 'ASSET_BASED', label: 'Asset', sub: 'Own trucks' },
  { value: 'NON_ASSET', label: 'Aggregate', sub: 'Broker only' },
  { value: 'HYBRID', label: 'Both', sub: 'Mixed fleet' },
];

const BUSINESS_TYPES: { value: BusinessType; label: string }[] = [
  { value: 'SOLE_PROPRIETOR', label: 'Sole Proprietor' },
  { value: 'PARTNERSHIP', label: 'Partnership' },
  { value: 'PVT_LTD', label: 'Pvt. Limited' },
  { value: 'LLP', label: 'LLP' },
  { value: 'OPC', label: 'OPC' },
  { value: 'OTHER', label: 'Other' },
];

const EMPLOYEE_COUNTS: EmployeeCount[] = ['1-10', '11-50', '51-200', '201-500', '500+'];

// ─── Design tokens ─────────────────────────────────────────────────────────────

const C = {
  bg: '#ffffff',
  surface: '#f8fafc',
  border: '#e2e8f0',
  text: '#0f172a',
  muted: '#64748b',
  placeholder: '#94a3b8',
  accent: Theme.driverEmerald,
  error: Theme.destructive,
  warning: '#f59e0b',
  warningBg: '#fffbeb',
  warningBorder: '#fcd34d',
};

// Total pages in the horizontal scroller
const STEP_LABELS = ['Phone', 'Verify', 'Company', 'Details', 'Account'];

// ─── OTP input ────────────────────────────────────────────────────────────────

function OtpInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const refs = useRef<(TextInput | null)[]>([]);
  const digits = value.padEnd(6, ' ').split('').slice(0, 6);

  const handleChange = (idx: number, char: string) => {
    const clean = char.replace(/\D/g, '');
    if (!clean) {
      const next = value.slice(0, idx) + value.slice(idx + 1);
      onChange(next.padEnd(Math.max(0, idx), ' ').trimEnd());
      if (idx > 0) refs.current[idx - 1]?.focus();
      return;
    }
    const d = clean[clean.length - 1];
    const next = value.slice(0, idx) + d + value.slice(idx + 1);
    onChange(next.slice(0, 6));
    if (idx < 5) refs.current[idx + 1]?.focus();
  };

  return (
    <View style={otpStyles.row}>
      {Array.from({ length: 6 }).map((_, i) => {
        const filled = digits[i].trim() !== '';
        return (
          <TextInput
            key={i}
            ref={(r) => { refs.current[i] = r; }}
            style={[otpStyles.box, filled && otpStyles.boxFilled]}
            value={filled ? digits[i] : ''}
            onChangeText={(t) => handleChange(i, t)}
            keyboardType="number-pad"
            maxLength={1}
            selectTextOnFocus
            onKeyPress={({ nativeEvent }) => {
              if (nativeEvent.key === 'Backspace' && !digits[i].trim() && i > 0) {
                refs.current[i - 1]?.focus();
              }
            }}
          />
        );
      })}
    </View>
  );
}

const otpStyles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10, justifyContent: 'center', marginVertical: 8 },
  box: {
    width: 46, height: 56, borderRadius: 12, borderWidth: 1.5, borderColor: C.border,
    textAlign: 'center', fontSize: 22, fontWeight: '700', color: C.text,
    backgroundColor: C.surface,
  },
  boxFilled: { borderColor: C.accent, backgroundColor: '#f0fdf4' },
});

// ─── Main component ────────────────────────────────────────────────────────────

export default function SignUp() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const router = useRouter();
  const isOnline = useIsOnline();
  const { signUp, signInWithGoogle } = useAuth();
  const scrollRef = useRef<ScrollView>(null);
  /** Per-page vertical scroll (horizontal pager does not scroll vertically). */
  const pageVerticalScrollRefs = useRef<Array<ScrollView | null>>([]);
  const isDesktop = width >= 1024;
  const pageWidth = isDesktop ? Math.min(560, width - 120) : width;

  // ── Navigation state ──────────────────────────────────────────────────────
  const [step, setStep] = useState(0);

  // ── Step 0: Phone ─────────────────────────────────────────────────────────
  const [phone, setPhone] = useState('');
  const [phoneExistsCheck, setPhoneExistsCheck] = useState<{
    loading: boolean; exists: boolean; email?: string; masked_email?: string;
  } | null>(null);
  const phoneCheckRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Step 1: OTP (mock) ────────────────────────────────────────────────────
  const [otp, setOtp] = useState('');
  const [otpResendSecs, setOtpResendSecs] = useState(0);
  const resendTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Step 2: Org check ─────────────────────────────────────────────────────
  const [orgName, setOrgName] = useState('');
  const [orgCheck, setOrgCheck] = useState<{
    loading: boolean; taken: boolean;
  } | null>(null);
  const orgCheckRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // true = org exists → joining mode; false = new org → creation mode
  const [orgJoinMode, setOrgJoinMode] = useState(false);

  // ── Step 3: Company details (new org only) ────────────────────────────────
  const [businessType, setBusinessType] = useState<BusinessType | null>(null);
  const [employeeCount, setEmployeeCount] = useState<EmployeeCount | null>(null);
  const [operatingModel, setOperatingModel] = useState<OperatingModel>('HYBRID');
  const [addressLine, setAddressLine] = useState('');
  const [selectedLocation, setSelectedLocation] = useState<IndiaLocation | null>(null);
  const [cityPickerOpen, setCityPickerOpen] = useState(false);
  const [citySearch, setCitySearch] = useState('');

  // ── Step 4: Account ───────────────────────────────────────────────────────
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  // ── Derived ───────────────────────────────────────────────────────────────
  const phoneInlineError = (() => {
    const t = phone.trim();
    if (!t) return null;
    if (!isPhoneValid(phone)) return 'Enter a valid 10-digit number.';
    return null;
  })();

  const filteredLocations = useMemo(() => {
    const q = citySearch.trim().toLowerCase();
    if (!q) return ALL_LOCATIONS;
    return ALL_LOCATIONS.filter(
      (l) => l.city.toLowerCase().includes(q) || l.state.toLowerCase().includes(q),
    );
  }, [citySearch]);

  // ── Phone exists debounce ─────────────────────────────────────────────────
  useEffect(() => {
    if (!phone.trim() || !isPhoneValid(phone)) {
      setPhoneExistsCheck(null);
      if (phoneCheckRef.current) clearTimeout(phoneCheckRef.current);
      return;
    }
    if (!isOnline) return;
    if (phoneCheckRef.current) clearTimeout(phoneCheckRef.current);
    setPhoneExistsCheck((p) => (p ? { ...p, loading: true } : { loading: true, exists: false }));
    phoneCheckRef.current = setTimeout(async () => {
      const r = await checkExistingUserByPhone(phone);
      setPhoneExistsCheck({ loading: false, exists: r.exists, email: r.email, masked_email: r.masked_email });
    }, 600);
    return () => { if (phoneCheckRef.current) clearTimeout(phoneCheckRef.current); };
  }, [phone, isOnline]);

  // ── Org name debounce ─────────────────────────────────────────────────────
  useEffect(() => {
    const raw = orgName.trim();
    if (!raw) {
      setOrgCheck(null);
      if (orgCheckRef.current) clearTimeout(orgCheckRef.current);
      return;
    }
    if (!isOnline) return;
    if (orgCheckRef.current) clearTimeout(orgCheckRef.current);
    setOrgCheck((p) => (p ? { ...p, loading: true } : { loading: true, taken: false }));
    orgCheckRef.current = setTimeout(async () => {
      const r = await checkOrganizationNameTaken(raw);
      setOrgCheck({ loading: false, taken: !r.error && r.taken });
    }, 600);
    return () => { if (orgCheckRef.current) clearTimeout(orgCheckRef.current); };
  }, [orgName, isOnline]);

  // ── Cleanup timers ────────────────────────────────────────────────────────
  useEffect(() => () => {
    if (phoneCheckRef.current) clearTimeout(phoneCheckRef.current);
    if (orgCheckRef.current) clearTimeout(orgCheckRef.current);
    if (resendTimerRef.current) clearInterval(resendTimerRef.current);
  }, []);

  // ── Navigation helper ─────────────────────────────────────────────────────
  const goToPage = (index: number) => {
    setStep(index);
    scrollRef.current?.scrollTo({ x: index * pageWidth, animated: true });
  };

  const handleBack = () => {
    if (step === 0) { router.back(); return; }
    // From success page, go to app
    if (step === 5) { router.replace('/'); return; }
    // From account page with join mode, go back to org-check
    if (step === 4 && orgJoinMode) { goToPage(2); return; }
    goToPage(step - 1);
  };

  // ── OTP countdown ─────────────────────────────────────────────────────────
  const startOtpCountdown = () => {
    setOtpResendSecs(30);
    if (resendTimerRef.current) clearInterval(resendTimerRef.current);
    resendTimerRef.current = setInterval(() => {
      setOtpResendSecs((s) => {
        if (s <= 1) {
          if (resendTimerRef.current) clearInterval(resendTimerRef.current);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  };

  // ── Step actions ──────────────────────────────────────────────────────────

  const continuePhone = async () => {
    if (!isOnline) return Alert.alert('No internet', 'Connect to continue.');
    const phoneErr = validatePhone(phone);
    if (phoneErr) return Alert.alert('Invalid', phoneErr);
    setLoading(true);
    const existing = await checkExistingUserByPhone(phone);
    setLoading(false);
    if (existing.error) return Alert.alert('Check failed', existing.error.message);
    if (existing.exists && existing.email) {
      return Alert.alert(
        'Account exists',
        existing.masked_email
          ? `Sign in with ${existing.masked_email}.`
          : 'An account with this phone already exists.',
        [{ text: 'Sign in', onPress: () => router.replace(`${ROUTES.SIGN_IN}?email=${encodeURIComponent(existing.email!)}`) }],
      );
    }
    // Enter OTP step with mock — start countdown
    setOtp('');
    startOtpCountdown();
    goToPage(1);
  };

  const verifyOtp = () => {
    if (otp.replace(/\s/g, '').length < 6) {
      return Alert.alert('Invalid', 'Enter the 6-digit OTP.');
    }
    // Mock: any 6-digit code is accepted
    goToPage(2);
  };

  const continueOrgCheck = () => {
    if (!orgName.trim()) return Alert.alert('Required', 'Enter your organization name.');
    if (orgCheck?.loading) return; // debounce in progress
    const isTaken = orgCheck?.taken ?? false;
    setOrgJoinMode(isTaken);
    if (isTaken) {
      // Jump straight to account step (skip company details)
      goToPage(4);
    } else {
      goToPage(3);
    }
  };

  const continueCompanyDetails = () => {
    if (!businessType) return Alert.alert('Required', 'Select your business structure.');
    if (!employeeCount) return Alert.alert('Required', 'Select your employee count.');
    if (!selectedLocation) return Alert.alert('Required', 'Please select your city.');
    goToPage(4);
  };

  const createAccount = async () => {
    if (!isOnline) return Alert.alert('No internet', 'Connect to create an account.');
    const nameErr = validateFullName(true)(fullName);
    if (nameErr) return Alert.alert('Invalid', nameErr);
    const emailErr = validateEmail(email);
    if (emailErr) return Alert.alert('Invalid', emailErr);
    const passwordErr = validatePassword(password);
    if (passwordErr) return Alert.alert('Invalid', passwordErr);
    if (password !== confirmPassword) return Alert.alert('Invalid', 'Passwords do not match.');
    const storedPhone = normalizeIndianPhoneForMetadata(phone);
    if (!storedPhone || !extractIndianMobileTenDigits(phone)) {
      return Alert.alert('Invalid', 'Enter a valid phone number.');
    }

    setLoading(true);

    if (!orgJoinMode) {
      // Final duplicate check before creating new org
      const dup = await checkOrganizationNameTaken(orgName.trim());
      if (dup.error) { setLoading(false); return Alert.alert('Error', dup.error.message); }
      if (dup.taken) { setLoading(false); return Alert.alert('Taken', 'This company name was just registered. Please choose another.'); }
    }

    const { error } = await signUp(
      email.trim(),
      password,
      fullName.trim(),
      'user',
      orgJoinMode ? undefined : operatingModel,
      storedPhone,
      orgJoinMode ? undefined : orgName.trim(),
      orgJoinMode ? undefined : addressLine.trim() || undefined,
      orgJoinMode ? undefined : selectedLocation?.city,
      orgJoinMode ? undefined : selectedLocation?.state,
      orgJoinMode ? undefined : selectedLocation?.zone,
      orgJoinMode ? undefined : businessType ?? undefined,
      orgJoinMode ? undefined : employeeCount ?? undefined,
      orgJoinMode ? true : undefined,
    );
    setLoading(false);
    if (error) return Alert.alert('Error', error.message);
    goToPage(5);
  };

  const continueWithGoogle = async () => {
    if (!isOnline) return Alert.alert('No internet', 'Connect to continue.');
    const trimmedName = fullName.trim();
    if (trimmedName) {
      const nameErr = validateFullName(true)(trimmedName);
      if (nameErr) return Alert.alert('Invalid', nameErr);
    }
    const storedPhone = normalizeIndianPhoneForMetadata(phone);
    if (!storedPhone || !extractIndianMobileTenDigits(phone)) {
      return Alert.alert('Invalid', 'Enter a valid phone number.');
    }

    setGoogleLoading(true);

    if (!orgJoinMode) {
      const dup = await checkOrganizationNameTaken(orgName.trim());
      if (dup.error) { setGoogleLoading(false); return Alert.alert('Error', dup.error.message); }
      if (dup.taken) { setGoogleLoading(false); return Alert.alert('Taken', 'This company name was just registered. Please choose another.'); }
    }

    const pending = await setPendingOAuthMetadata({
      fullName: trimmedName || undefined,
      phone: storedPhone,
      companyName: orgJoinMode ? undefined : orgName.trim(),
      role: 'user',
      operatingModel: orgJoinMode ? undefined : operatingModel,
      addressLine: orgJoinMode ? undefined : addressLine.trim() || undefined,
      city: orgJoinMode ? undefined : selectedLocation?.city,
      state: orgJoinMode ? undefined : selectedLocation?.state,
      zone: orgJoinMode ? undefined : selectedLocation?.zone,
      businessType: orgJoinMode ? undefined : businessType ?? undefined,
      employeeCount: orgJoinMode ? undefined : employeeCount ?? undefined,
      skipOrgCreation: orgJoinMode ? true : undefined,
    });
    if (pending.error) {
      setGoogleLoading(false);
      return Alert.alert('Error', pending.error.message);
    }

    const { error } = await signInWithGoogle(true);
    setGoogleLoading(false);
    if (error) return Alert.alert('Error', error.message);
  };

  /** Google from the welcome / phone step: business user + optional phone if already entered. */
  const continueWithGoogleFromWelcome = async () => {
    if (!isOnline) return Alert.alert('No internet', 'Connect to continue.');
    setGoogleLoading(true);
    const storedPhone = normalizeIndianPhoneForMetadata(phone);
    const tenDigits = extractIndianMobileTenDigits(phone);
    const pending = await setPendingOAuthMetadata({
      role: 'user',
      operatingModel: 'HYBRID',
      ...(storedPhone && tenDigits ? { phone: storedPhone } : {}),
    });
    if (pending.error) {
      setGoogleLoading(false);
      return Alert.alert('Error', pending.error.message);
    }
    const { error } = await signInWithGoogle(true);
    setGoogleLoading(false);
    if (error) return Alert.alert('Error', error.message);
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  const backLabel = step === 0 ? 'Back' : step === 5 ? '' : 'Previous';

  const pageScrollBottomPad = insets.bottom + 72;

  const pageBody = (pageIndex: number, content: ReactNode) => (
    <View style={[styles.page, { width: pageWidth }]}>
      <ScrollView
        ref={(el) => {
          pageVerticalScrollRefs.current[pageIndex] = el;
        }}
        style={styles.pageScroll}
        contentContainerStyle={[
          styles.pageInner,
          { paddingBottom: pageScrollBottomPad },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator
        nestedScrollEnabled
      >
        {content}
      </ScrollView>
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'web' ? undefined : 'padding'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 20 : 0}
    >
      {/* Top bar */}
      {step < 5 ? (
        <View style={styles.topBar}>
          {step > 0 ? (
            <TouchableOpacity style={styles.backBtn} onPress={handleBack} hitSlop={12}>
              <FontAwesome name="chevron-left" size={16} color={C.muted} />
              <Text style={styles.backBtnText}>{backLabel}</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.backBtn} onPress={handleBack} hitSlop={12}>
              <FontAwesome name="chevron-left" size={16} color={C.muted} />
              <Text style={styles.backBtnText}>Back</Text>
            </TouchableOpacity>
          )}
          <Text style={styles.brandText}>PULSE.</Text>
          <View style={styles.topBarRight} />
        </View>
      ) : null}

      <View style={isDesktop ? styles.panelShell : styles.mobileShell}>
        {isDesktop ? (
          <View style={styles.leftPanel}>
            <Text style={styles.leftLogo}>PULSE<Text style={styles.logoDot}>.</Text></Text>
            <Text style={styles.leftTag}>Business Onboarding</Text>
            <Text style={styles.leftTitle}>Build your workspace.</Text>
            <Text style={styles.leftSub}>Organize your fleet and logistics with Pulse.</Text>
          </View>
        ) : null}

        <View style={isDesktop ? styles.rightPanel : styles.mobileRight}>
          <ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            scrollEnabled={false}
            showsHorizontalScrollIndicator={false}
            style={[styles.scroller, isDesktop && { width: pageWidth, alignSelf: 'center' }]}
            contentContainerStyle={styles.scrollerContent}
            keyboardShouldPersistTaps="handled"
          >
            {/* ── Page 0: Phone ───────────────────────────────────────────── */}
            {pageBody(0, (
              <>
                <Text style={[styles.pageTitle, styles.pageTitleWelcome]}>Welcome aboard for business</Text>
                <Text style={styles.pageSub}>Enter your Indian mobile number to get started.</Text>

                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>Mobile number</Text>
                  <View style={[styles.phoneRow, phoneInlineError && styles.phoneRowError]}>
                    <Text style={styles.flag}>🇮🇳</Text>
                    <Text style={styles.dialCode}>+91</Text>
                    <TextInput
                      style={styles.phoneInput}
                      placeholder="000 000 0000"
                      placeholderTextColor={C.placeholder}
                      value={phone}
                      onChangeText={(t) => setPhone(formatMobileNumber(t))}
                      keyboardType="phone-pad"
                      maxLength={10}
                      editable={!loading}
                    />
                  </View>
                  {phoneInlineError ? <Text style={styles.fieldError}>{phoneInlineError}</Text> : null}
                  {phoneExistsCheck?.loading ? <Text style={styles.fieldHint}>Checking...</Text> : null}
                  {!phoneExistsCheck?.loading && phoneExistsCheck?.exists ? (
                    <Text style={styles.fieldHint}>This number is already registered.</Text>
                  ) : null}
                </View>

                <TouchableOpacity
                  style={[styles.primaryBtn, (!isPhoneValid(phone) || loading) && styles.primaryBtnDisabled]}
                  onPress={continuePhone}
                  disabled={!isPhoneValid(phone) || loading || googleLoading}
                >
                  {loading ? <LoadingIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Send OTP</Text>}
                </TouchableOpacity>

                <View style={styles.altRow}>
                  <Text style={styles.altText}>or</Text>
                </View>

                <TouchableOpacity
                  style={[styles.googleBtn, (loading || googleLoading || !isOnline) && styles.primaryBtnDisabled]}
                  onPress={continueWithGoogleFromWelcome}
                  disabled={loading || googleLoading || !isOnline}
                >
                  {googleLoading ? (
                    <LoadingIndicator color={C.text} />
                  ) : (
                    <>
                      <FontAwesome name="google" size={14} color={C.text} />
                      <Text style={styles.googleBtnText}>Continue with Google</Text>
                    </>
                  )}
                </TouchableOpacity>

                <View style={styles.altRow}>
                  <Text style={styles.altText}>Already have an account? </Text>
                  <TouchableOpacity onPress={() => router.replace(ROUTES.SIGN_IN)}>
                    <Text style={styles.altLink}>Sign in</Text>
                  </TouchableOpacity>
                </View>
              </>
            ))}

            {/* ── Page 1: OTP ─────────────────────────────────────────────── */}
            {pageBody(1, (
              <>
                <View style={styles.otpIconWrap}>
                  <FontAwesome name="mobile" size={36} color={C.accent} />
                </View>
                <Text style={styles.pageTitle}>Verify your number</Text>
                <Text style={styles.pageSub}>
                  Enter the 6-digit OTP sent to{'\n'}
                  <Text style={styles.phoneHighlight}>+91 {phone}</Text>
                </Text>

                <OtpInput value={otp} onChange={setOtp} />

                <TouchableOpacity
                  style={[styles.primaryBtn, otp.replace(/\s/g, '').length < 6 && styles.primaryBtnDisabled]}
                  onPress={verifyOtp}
                  disabled={otp.replace(/\s/g, '').length < 6}
                >
                  <Text style={styles.primaryBtnText}>Verify OTP</Text>
                </TouchableOpacity>

                <View style={styles.resendRow}>
                  {otpResendSecs > 0 ? (
                    <Text style={styles.resendCountdown}>Resend in {otpResendSecs}s</Text>
                  ) : (
                    <TouchableOpacity onPress={() => { setOtp(''); startOtpCountdown(); }}>
                      <Text style={styles.altLink}>Resend OTP</Text>
                    </TouchableOpacity>
                  )}
                </View>

                <View style={styles.mockBadge}>
                  <FontAwesome name="info-circle" size={12} color={C.muted} />
                  <Text style={styles.mockBadgeText}>Demo mode — any 6-digit code is accepted</Text>
                </View>
              </>
            ))}

            {/* ── Page 2: Org check ───────────────────────────────────────── */}
            {pageBody(2, (
              <>
                <Text style={styles.pageTitle}>Your organization</Text>
                <Text style={styles.pageSub}>Enter your company name. We'll check if it already exists on Pulse.</Text>

                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>Company / Organization name</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. GoGoX Logistics"
                    placeholderTextColor={C.placeholder}
                    value={orgName}
                    onChangeText={setOrgName}
                    autoCapitalize="words"
                  />
                  {orgCheck?.loading ? (
                    <View style={styles.orgStatusRow}>
                      <LoadingIndicator size="small" color={C.muted} />
                      <Text style={styles.fieldHint}>Checking availability...</Text>
                    </View>
                  ) : orgCheck?.taken ? (
                    <View style={styles.orgExistsBanner}>
                      <FontAwesome name="exclamation-triangle" size={14} color={C.warning} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.orgExistsTitle}>Organization already registered</Text>
                        <Text style={styles.orgExistsSub}>
                          Ask their admin to invite you as a team member after you create your account.
                        </Text>
                      </View>
                    </View>
                  ) : orgCheck && !orgCheck.taken && orgName.trim() ? (
                    <View style={styles.orgAvailBanner}>
                      <FontAwesome name="check-circle" size={14} color={C.accent} />
                      <Text style={styles.orgAvailText}>Available — you'll create this organization</Text>
                    </View>
                  ) : null}
                </View>

                <TouchableOpacity
                  style={[styles.primaryBtn, (!orgName.trim() || orgCheck?.loading) && styles.primaryBtnDisabled]}
                  onPress={continueOrgCheck}
                  disabled={!orgName.trim() || !!orgCheck?.loading}
                >
                  <Text style={styles.primaryBtnText}>
                    {orgCheck?.taken ? 'Continue to create account' : 'Continue'}
                  </Text>
                </TouchableOpacity>
              </>
            ))}

            {/* ── Page 3: Company details (new org) ───────────────────────── */}
            <View style={[styles.page, { width: pageWidth }]}>
              <ScrollView
                ref={(el) => {
                  pageVerticalScrollRefs.current[3] = el;
                }}
                style={styles.pageScroll}
                showsVerticalScrollIndicator
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                nestedScrollEnabled
                contentContainerStyle={[
                  styles.pageInner,
                  { paddingBottom: pageScrollBottomPad },
                ]}
              >
                <Text style={styles.pageTitle}>Company details</Text>
                <Text style={styles.pageSub}>Tell us about <Text style={styles.orgNameHighlight}>{orgName}</Text></Text>

                {/* Business structure */}
                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>Business structure <Text style={styles.req}>*</Text></Text>
                  <View style={styles.chipWrap}>
                    {BUSINESS_TYPES.map(({ value, label }) => (
                      <TouchableOpacity
                        key={value}
                        style={[styles.chip, businessType === value && styles.chipActive]}
                        onPress={() => setBusinessType(value)}
                      >
                        <Text style={[styles.chipText, businessType === value && styles.chipTextActive]}>
                          {label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* Employee count */}
                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>Number of employees <Text style={styles.req}>*</Text></Text>
                  <View style={styles.chipWrap}>
                    {EMPLOYEE_COUNTS.map((count) => (
                      <TouchableOpacity
                        key={count}
                        style={[styles.chip, employeeCount === count && styles.chipActive]}
                        onPress={() => setEmployeeCount(count)}
                      >
                        <Text style={[styles.chipText, employeeCount === count && styles.chipTextActive]}>
                          {count}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* Operating model */}
                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>Operating model</Text>
                  <View style={styles.modelRow}>
                    {OPERATING_MODELS.map(({ value, label, sub }) => (
                      <TouchableOpacity
                        key={value}
                        style={[styles.modelCard, operatingModel === value && styles.modelCardActive]}
                        onPress={() => setOperatingModel(value)}
                      >
                        <Text style={[styles.modelLabel, operatingModel === value && styles.modelLabelActive]}>
                          {label}
                        </Text>
                        <Text style={styles.modelSub}>{sub}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* Address */}
                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>Office address</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Building, street, area"
                    placeholderTextColor={C.placeholder}
                    value={addressLine}
                    onChangeText={setAddressLine}
                  />
                </View>

                {/* City picker */}
                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>City / District <Text style={styles.req}>*</Text></Text>
                  <View style={styles.cityFieldWrap}>
                    <View style={[styles.cityInputRow, cityPickerOpen && styles.cityInputRowActive]}>
                      <FontAwesome name="search" size={14} color={C.muted} style={{ marginRight: 8 }} />
                      <TextInput
                        style={styles.cityInput}
                        placeholder="Search & select city"
                        placeholderTextColor={C.placeholder}
                        value={cityPickerOpen ? citySearch : (selectedLocation?.city ?? '')}
                        onFocus={() => { setCityPickerOpen(true); setCitySearch(selectedLocation?.city ?? ''); }}
                        onChangeText={(t) => { setCityPickerOpen(true); setCitySearch(t); }}
                        autoCapitalize="words"
                      />
                      <TouchableOpacity onPress={() => {
                        if (cityPickerOpen) { setCityPickerOpen(false); setCitySearch(''); }
                        else { setCityPickerOpen(true); setCitySearch(selectedLocation?.city ?? ''); }
                      }}>
                        <FontAwesome name={cityPickerOpen ? 'chevron-up' : 'chevron-down'} size={13} color={C.muted} />
                      </TouchableOpacity>
                    </View>
                    {selectedLocation && !cityPickerOpen ? (
                      <Text style={styles.citySubText}>{selectedLocation.state}</Text>
                    ) : null}
                    {cityPickerOpen ? (
                      <View style={styles.dropdown}>
                        <FlatList
                          data={filteredLocations}
                          keyExtractor={(_, i) => String(i)}
                          keyboardShouldPersistTaps="handled"
                          getItemLayout={(_, index) => ({ length: ITEM_HEIGHT, offset: ITEM_HEIGHT * index, index })}
                          initialNumToRender={20}
                          maxToRenderPerBatch={20}
                          removeClippedSubviews
                          renderItem={({ item }) => {
                            const active = selectedLocation?.city === item.city && selectedLocation?.state === item.state;
                            return (
                              <TouchableOpacity
                                style={[styles.dropdownItem, active && styles.dropdownItemActive]}
                                onPress={() => { setSelectedLocation(item); setCityPickerOpen(false); setCitySearch(''); }}
                              >
                                <View>
                                  <Text style={[styles.dropdownItemCity, active && { fontWeight: '700' }]}>{item.city}</Text>
                                  <Text style={styles.dropdownItemState}>{item.state}</Text>
                                </View>
                                <View style={styles.zonePill}>
                                  <Text style={styles.zonePillText}>{item.zone}</Text>
                                </View>
                              </TouchableOpacity>
                            );
                          }}
                          ItemSeparatorComponent={() => <View style={styles.dropdownSep} />}
                          ListEmptyComponent={<Text style={styles.dropdownEmpty}>No results</Text>}
                        />
                      </View>
                    ) : null}
                  </View>
                </View>

                {selectedLocation ? (
                  <View style={styles.zoneBadgeRow}>
                    <Text style={styles.zoneBadgeLabel}>Zone</Text>
                    <View style={styles.zoneBadge}>
                      <Text style={styles.zoneBadgeText}>{ZONE_LABELS[selectedLocation.zone]}</Text>
                    </View>
                  </View>
                ) : null}

                <TouchableOpacity style={styles.primaryBtn} onPress={continueCompanyDetails}>
                  <Text style={styles.primaryBtnText}>Continue</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>

            {/* ── Page 4: Account ──────────────────────────────────────────── */}
            {pageBody(4, (
              <>
                <Text style={styles.pageTitle}>Create account</Text>
                {orgJoinMode ? (
                  <View style={styles.joinNoticeBanner}>
                    <FontAwesome name="info-circle" size={14} color={C.warning} />
                    <Text style={styles.joinNoticeText}>
                      <Text style={{ fontWeight: '700' }}>{orgName}</Text> already exists.
                      {' '}After signing up, ask their admin to invite you as a team member.
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.pageSub}>Enter your email and password to finish.</Text>
                )}

                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>Full name</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Your name"
                    placeholderTextColor={C.placeholder}
                    value={fullName}
                    onChangeText={setFullName}
                    autoCapitalize="words"
                    editable={!loading}
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>Email address</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="you@example.com"
                    placeholderTextColor={C.placeholder}
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    editable={!loading}
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>Password</Text>
                  <View style={styles.passwordRow}>
                    <TextInput
                      style={styles.inputPassword}
                      placeholder="At least 6 characters"
                      placeholderTextColor={C.placeholder}
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry={!showPassword}
                      editable={!loading}
                    />
                    <TouchableOpacity onPress={() => setShowPassword((v) => !v)} style={styles.eyeBtn}>
                      <FontAwesome name={showPassword ? 'eye-slash' : 'eye'} size={18} color={C.muted} />
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>Confirm password</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Re-enter password"
                    placeholderTextColor={C.placeholder}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry={!showPassword}
                    editable={!loading}
                  />
                </View>

                <TouchableOpacity
                  style={[styles.primaryBtn, loading && styles.primaryBtnDisabled]}
                  onPress={createAccount}
                  disabled={loading || googleLoading}
                >
                  {loading ? <LoadingIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Create account</Text>}
                </TouchableOpacity>

                <View style={styles.altRow}>
                  <Text style={styles.altText}>or</Text>
                </View>

                <TouchableOpacity
                  style={[styles.googleBtn, (loading || googleLoading) && styles.primaryBtnDisabled]}
                  onPress={continueWithGoogle}
                  disabled={loading || googleLoading}
                >
                  {googleLoading ? (
                    <LoadingIndicator color={C.text} />
                  ) : (
                    <>
                      <FontAwesome name="google" size={14} color={C.text} />
                      <Text style={styles.googleBtnText}>Continue with Google</Text>
                    </>
                  )}
                </TouchableOpacity>
              </>
            ))}

            {/* ── Page 5: Success ──────────────────────────────────────────── */}
            {pageBody(5, (
              <View style={styles.successInner}>
                <View style={styles.successIcon}>
                  <FontAwesome name="check" size={32} color="#fff" />
                </View>
                <Text style={styles.successTitle}>
                  {orgJoinMode ? 'Account created!' : "You're in!"}
                </Text>
                {orgJoinMode ? (
                  <>
                    <Text style={styles.successSub}>
                      Your account is ready. To join{' '}
                      <Text style={{ fontWeight: '700' }}>{orgName}</Text>, ask their admin
                      to invite you from the Pulse Team Management screen.
                    </Text>
                    <View style={styles.inviteHintCard}>
                      <FontAwesome name="users" size={16} color={C.accent} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.inviteHintTitle}>How to get invited</Text>
                        <Text style={styles.inviteHintSub}>
                          Ask the {orgName} admin to open{' '}
                          <Text style={{ fontStyle: 'italic' }}>Profile → Team → Invite Member</Text>
                          {' '}and search for your phone number <Text style={{ fontWeight: '700' }}>+91 {phone}</Text>.
                        </Text>
                      </View>
                    </View>
                  </>
                ) : (
                  <Text style={styles.successSub}>
                    Your workspace <Text style={{ fontWeight: '700' }}>{orgName}</Text> is ready. Start managing your fleet.
                  </Text>
                )}
                <TouchableOpacity style={styles.primaryBtn} onPress={() => router.replace('/')}>
                  <Text style={styles.primaryBtnText}>Go to app</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.altRow} onPress={() => router.replace(ROUTES.SIGN_IN)}>
                  <Text style={styles.altLink}>Already have an account? Sign in</Text>
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>

          {/* Step dots */}
          {step < 5 ? (
            <View style={[styles.dotsRow, { paddingBottom: insets.bottom + 10 }]}>
              {STEP_LABELS.map((label, i) => {
                const done = i < step;
                const active = i === step;
                return (
                  <View key={label} style={styles.dotItem}>
                    <View style={[styles.dot, active && styles.dotActive, done && styles.dotDone]} />
                    <Text style={[styles.dotLabel, active && styles.dotLabelActive]}>{label}</Text>
                  </View>
                );
              })}
            </View>
          ) : null}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  mobileShell: { flex: 1 },
  panelShell: { flex: 1, flexDirection: 'row', backgroundColor: '#020617' },
  leftPanel: { flex: 1, backgroundColor: '#000', paddingHorizontal: 52, paddingVertical: 48, justifyContent: 'center' },
  leftLogo: { fontSize: 44, fontWeight: '900', fontStyle: 'italic', letterSpacing: -1.1, color: '#fff', marginBottom: 14 },
  logoDot: { color: Theme.driverPrimary },
  leftTag: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 2, fontWeight: '700', color: 'rgba(148,163,184,0.75)', marginBottom: 18 },
  leftTitle: { fontSize: 40, fontWeight: '900', color: '#fff', letterSpacing: -0.8, marginBottom: 12 },
  leftSub: { fontSize: 15, lineHeight: 24, color: 'rgba(148,163,184,0.75)', maxWidth: 420 },
  rightPanel: { flex: 1, backgroundColor: '#fff' },
  mobileRight: { flex: 1 },

  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8,
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6 },
  backBtnText: { fontSize: 14, color: C.muted, fontWeight: '600' },
  brandText: { fontSize: 22, fontWeight: '900', fontStyle: 'italic', letterSpacing: -0.5, color: Theme.driverPrimary },
  topBarRight: { width: 60 },

  scroller: { flex: 1 },
  scrollerContent: { flexGrow: 1 },
  page: { flex: 1, paddingHorizontal: 24, paddingTop: 16 },
  pageScroll: { flex: 1 },
  pageInner: { flexGrow: 1, maxWidth: 360, alignSelf: 'center', width: '100%' },

  pageTitle: { fontSize: 26, fontWeight: '800', color: C.text, marginBottom: 8, letterSpacing: -0.4 },
  /** Slightly smaller so the full line fits in `pageInner` without scaling or clipping. */
  pageTitleWelcome: { fontSize: 20, letterSpacing: -0.35 },
  pageSub: { fontSize: 14, color: C.muted, marginBottom: 24, lineHeight: 20 },
  phoneHighlight: { fontWeight: '700', color: C.text },
  orgNameHighlight: { fontWeight: '700', color: C.accent },

  // Phone
  phoneRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.bg, borderRadius: 12, borderWidth: 1.5, borderColor: C.border },
  phoneRowError: { borderColor: C.error },
  flag: { fontSize: 22, marginLeft: 12, marginRight: 6 },
  dialCode: { fontSize: 15, fontWeight: '700', color: C.text, marginRight: 6 },
  phoneInput: { flex: 1, minHeight: 50, paddingVertical: 14, paddingHorizontal: 8, fontSize: 16, color: C.text },

  // OTP
  otpIconWrap: { alignSelf: 'center', marginBottom: 12 },
  resendRow: { alignItems: 'center', marginTop: 14 },
  resendCountdown: { fontSize: 13, color: C.muted },
  mockBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16,
    backgroundColor: C.surface, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7,
    borderWidth: 1, borderColor: C.border,
  },
  mockBadgeText: { fontSize: 11, color: C.muted },

  // Org check
  orgStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  orgExistsBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 10,
    backgroundColor: C.warningBg, borderRadius: 10, borderWidth: 1, borderColor: C.warningBorder,
    padding: 12,
  },
  orgExistsTitle: { fontSize: 13, fontWeight: '700', color: '#92400e', marginBottom: 3 },
  orgExistsSub: { fontSize: 12, color: '#78350f', lineHeight: 17 },
  orgAvailBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10,
    backgroundColor: '#f0fdf4', borderRadius: 10, borderWidth: 1, borderColor: '#bbf7d0',
    paddingHorizontal: 12, paddingVertical: 9,
  },
  orgAvailText: { fontSize: 13, color: '#166534', fontWeight: '600' },

  // Fields
  fieldGroup: { marginBottom: 16 },
  label: { fontSize: 12, fontWeight: '700', color: C.muted, marginBottom: 8, letterSpacing: 0.4, textTransform: 'uppercase' },
  req: { color: C.error },
  input: {
    minHeight: 50, paddingVertical: 14, paddingHorizontal: 14, fontSize: 15, color: C.text,
    backgroundColor: C.bg, borderRadius: 12, borderWidth: 1.5, borderColor: C.border,
  },
  inputPassword: {
    flex: 1, minHeight: 50, paddingVertical: 14, paddingHorizontal: 14, paddingRight: 48,
    fontSize: 15, color: C.text, backgroundColor: C.bg, borderRadius: 12, borderWidth: 1.5, borderColor: C.border,
  },
  passwordRow: { flexDirection: 'row', alignItems: 'center' },
  eyeBtn: { position: 'absolute', right: 12, padding: 8 },
  fieldError: { fontSize: 12, color: C.error, marginTop: 5, marginLeft: 2 },
  fieldHint: { fontSize: 12, color: C.muted, marginTop: 5, marginLeft: 2 },

  // Chips
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, borderWidth: 1.5,
    borderColor: C.border, backgroundColor: C.surface,
  },
  chipActive: { borderColor: C.accent, backgroundColor: '#f0fdf4' },
  chipText: { fontSize: 13, fontWeight: '600', color: C.muted },
  chipTextActive: { color: '#166534' },

  // Operating model cards
  modelRow: { flexDirection: 'row', gap: 8 },
  modelCard: {
    flex: 1, paddingVertical: 12, paddingHorizontal: 8, borderRadius: 12,
    borderWidth: 1.5, borderColor: C.border, backgroundColor: C.surface, alignItems: 'center',
  },
  modelCardActive: { borderColor: C.accent, backgroundColor: '#f0fdf4' },
  modelLabel: { fontSize: 13, fontWeight: '700', color: C.muted },
  modelLabelActive: { color: '#166534' },
  modelSub: { fontSize: 11, color: C.placeholder, marginTop: 2 },

  // City picker
  cityFieldWrap: {},
  cityInputRow: {
    flexDirection: 'row', alignItems: 'center', minHeight: 50,
    paddingHorizontal: 12, borderRadius: 12, borderWidth: 1.5, borderColor: C.border,
    backgroundColor: C.bg,
    ...Platform.select({ web: { outlineStyle: 'none' } as object }),
  },
  cityInputRowActive: { borderColor: '#cbd5e1' },
  cityInput: {
    flex: 1, fontSize: 15, color: C.text, paddingVertical: 10,
    ...Platform.select({ web: { outlineStyle: 'none' } as object }),
  },
  citySubText: { fontSize: 12, color: C.muted, marginTop: 3, marginLeft: 2 },
  dropdown: {
    marginTop: 6, borderRadius: 12, borderWidth: 1, borderColor: '#dbe3ee',
    backgroundColor: '#fff', maxHeight: 280, overflow: 'hidden',
    shadowColor: '#0f172a', shadowOpacity: 0.05, shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 }, elevation: 2,
  },
  dropdownItem: { height: ITEM_HEIGHT, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dropdownItemActive: { backgroundColor: 'rgba(15,23,42,0.04)' },
  dropdownItemCity: { fontSize: 14, color: C.text, fontWeight: '500' },
  dropdownItemState: { fontSize: 11, color: C.muted, marginTop: 2 },
  dropdownSep: { height: 1, backgroundColor: C.border, marginHorizontal: 14 },
  dropdownEmpty: { textAlign: 'center', color: C.muted, paddingVertical: 28, fontSize: 13 },
  zonePill: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  zonePillText: { fontSize: 9, fontWeight: '700', color: C.muted, letterSpacing: 0.3 },
  zoneBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  zoneBadgeLabel: { fontSize: 12, fontWeight: '700', color: C.muted },
  zoneBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#bbf7d0' },
  zoneBadgeText: { fontSize: 12, fontWeight: '600', color: C.accent },

  // Join notice banner (on account step)
  joinNoticeBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 18,
    backgroundColor: C.warningBg, borderRadius: 10, borderWidth: 1, borderColor: C.warningBorder, padding: 12,
  },
  joinNoticeText: { flex: 1, fontSize: 13, color: '#78350f', lineHeight: 18 },

  // Primary button
  primaryBtn: {
    backgroundColor: C.accent, borderRadius: 12, paddingVertical: 15,
    alignItems: 'center', marginTop: 10,
  },
  primaryBtnDisabled: { opacity: 0.55 },
  primaryBtnText: { fontSize: 15, fontWeight: '700', color: '#fff', letterSpacing: 0.3 },

  // Alt text / links
  altRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 16 },
  altText: { fontSize: 13, color: C.muted },
  altLink: { fontSize: 13, color: C.accent, fontWeight: '700' },
  googleBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    borderWidth: 1.5,
    borderColor: C.border,
    backgroundColor: C.bg,
    marginTop: 8,
  },
  googleBtnText: { fontSize: 15, fontWeight: '700', color: C.text, letterSpacing: 0.2 },

  // Success page
  successInner: { alignItems: 'center', justifyContent: 'center', flex: 1, paddingTop: 40 },
  successIcon: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: C.accent,
    alignItems: 'center', justifyContent: 'center', marginBottom: 18,
  },
  successTitle: { fontSize: 28, fontWeight: '900', color: C.text, letterSpacing: -0.4, marginBottom: 12, textAlign: 'center' },
  successSub: { fontSize: 14, color: C.muted, textAlign: 'center', lineHeight: 20, marginBottom: 24, maxWidth: 300 },
  inviteHintCard: {
    flexDirection: 'row', gap: 12, backgroundColor: '#f0fdf4', borderRadius: 12,
    borderWidth: 1, borderColor: '#bbf7d0', padding: 14, marginBottom: 24, width: '100%',
  },
  inviteHintTitle: { fontSize: 13, fontWeight: '700', color: '#166534', marginBottom: 4 },
  inviteHintSub: { fontSize: 12, color: '#166534', lineHeight: 18 },

  // Step dots
  dotsRow: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    gap: 16, paddingTop: 12, paddingHorizontal: 16,
  },
  dotItem: { alignItems: 'center', gap: 4 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.border },
  dotActive: { backgroundColor: C.accent, width: 20 },
  dotDone: { backgroundColor: C.accent, opacity: 0.5 },
  dotLabel: { fontSize: 9, color: C.muted, fontWeight: '600', letterSpacing: 0.3 },
  dotLabelActive: { color: C.accent },
});
