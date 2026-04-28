import Theme from '@/constants/Theme';
import { useAuth } from '@/contexts/AuthContext';
import { useIsOnline } from '@/contexts/NetworkContext';
import {
  checkExistingUserByPhone,
  checkOrganizationNameTaken,
  type OperatingModel,
} from '@/features/auth';
import { validateEmail } from '@/lib/emailValidation';
import { formatMobileNumber } from '@/lib/format';
import INDIA_LOCATIONS from '@/lib/indiaLocations.json';
import {
  extractIndianMobileTenDigits,
  isPhoneValid,
  normalizeIndianPhoneForMetadata,
  validatePhone,
} from '@/lib/phoneValidation';
import { VALIDATION, maxLength, validateFullName, validatePassword } from '@/lib/validation';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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

type Zone = 'NORTH' | 'SOUTH' | 'EAST' | 'WEST' | 'NORTHEAST';
type IndiaLocation = { city: string; state: string; zone: Zone };

const ALL_LOCATIONS = INDIA_LOCATIONS as IndiaLocation[];

const ZONE_LABELS: Record<Zone, string> = {
  NORTH: 'North Zone',
  SOUTH: 'South Zone',
  EAST: 'East Zone',
  WEST: 'West Zone',
  NORTHEAST: 'Northeast Zone',
};

const ITEM_HEIGHT = 58;

const OPERATING_MODELS: { value: OperatingModel; label: string }[] = [
  { value: 'ASSET_BASED', label: 'Asset' },
  { value: 'NON_ASSET', label: 'Aggregate' },
  { value: 'HYBRID', label: 'Both' },
];

const STEP_CONTENT = [
  { title: 'Welcome aboard', subtitle: 'To sign up or log in, enter your number.' },
  { title: 'Business details', subtitle: 'Enter your name, company and operating model.' },
  { title: 'Create your account', subtitle: 'Enter email and password to finish sign up.' },
  { title: "You're in", subtitle: 'Your account is ready. You can start using the app.' },
];

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

export default function SignUp() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const router = useRouter();
  const isOnline = useIsOnline();
  const { signUp } = useAuth();
  const scrollRef = useRef<ScrollView>(null);
  const isDesktop = width >= 1024;
  const pageWidth = isDesktop ? Math.min(560, width - 120) : width;

  const [step, setStep] = useState(0);
  const [operatingModel, setOperatingModel] = useState<OperatingModel>('HYBRID');
  const [fullName, setFullName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [addressLine, setAddressLine] = useState('');
  const [selectedLocation, setSelectedLocation] = useState<IndiaLocation | null>(null);
  const [cityPickerOpen, setCityPickerOpen] = useState(false);
  const [citySearch, setCitySearch] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const [phoneExistsCheck, setPhoneExistsCheck] = useState<{
    loading: boolean;
    exists: boolean;
    email?: string;
    masked_email?: string;
  } | null>(null);
  const [companyNameTakenCheck, setCompanyNameTakenCheck] = useState<{
    loading: boolean;
    taken: boolean;
  } | null>(null);

  const phoneCheckTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const companyCheckTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const goToPage = (index: number) => {
    setStep(index);
    scrollRef.current?.scrollTo({ x: index * pageWidth, animated: true });
  };

  const phoneInlineError = (() => {
    const t = phone.trim();
    if (t.length === 0) return null;
    if (!isPhoneValid(phone)) return 'Enter a valid 10-digit number.';
    return null;
  })();

  useEffect(() => {
    const raw = phone.trim();
    if (!raw || !isPhoneValid(phone)) {
      setPhoneExistsCheck(null);
      if (phoneCheckTimeoutRef.current) clearTimeout(phoneCheckTimeoutRef.current);
      return;
    }
    if (!isOnline) return;
    if (phoneCheckTimeoutRef.current) clearTimeout(phoneCheckTimeoutRef.current);
    setPhoneExistsCheck((prev) => (prev ? { ...prev, loading: true } : { loading: true, exists: false }));
    phoneCheckTimeoutRef.current = setTimeout(async () => {
      const result = await checkExistingUserByPhone(phone);
      setPhoneExistsCheck({
        loading: false,
        exists: result.exists,
        email: result.email,
        masked_email: result.masked_email,
      });
    }, 600);
    return () => {
      if (phoneCheckTimeoutRef.current) clearTimeout(phoneCheckTimeoutRef.current);
    };
  }, [phone, isOnline]);

  useEffect(() => {
    const raw = companyName.trim();
    if (!raw) {
      setCompanyNameTakenCheck(null);
      if (companyCheckTimeoutRef.current) clearTimeout(companyCheckTimeoutRef.current);
      return;
    }
    if (!isOnline) return;
    if (companyCheckTimeoutRef.current) clearTimeout(companyCheckTimeoutRef.current);
    setCompanyNameTakenCheck((prev) => (prev ? { ...prev, loading: true } : { loading: true, taken: false }));
    companyCheckTimeoutRef.current = setTimeout(async () => {
      const result = await checkOrganizationNameTaken(raw);
      setCompanyNameTakenCheck({ loading: false, taken: !result.error && result.taken });
    }, 600);
    return () => {
      if (companyCheckTimeoutRef.current) clearTimeout(companyCheckTimeoutRef.current);
    };
  }, [companyName, isOnline]);

  const continuePhoneStep = async () => {
    if (!isOnline) return Alert.alert('No internet', 'Connect to the internet to continue.');
    if (!phone.trim()) return Alert.alert('Required', 'Enter your 10-digit mobile number.');
    const phoneErr = validatePhone(phone);
    if (phoneErr) return Alert.alert('Invalid', phoneErr);
    setLoading(true);
    const existing = await checkExistingUserByPhone(phone);
    setLoading(false);
    if (existing.error) return Alert.alert('Check failed', existing.error.message);
    if (existing.exists && existing.email) {
      Alert.alert(
        'Account already exists',
        existing.masked_email
          ? `Sign in with ${existing.masked_email}.`
          : 'An account with this phone already exists.',
        [{ text: 'Sign in', onPress: () => router.replace(`/sign-in?direct=1&email=${encodeURIComponent(existing.email!)}`) }],
      );
      return;
    }
    goToPage(1);
  };

  const filteredLocations = useMemo(() => {
    const q = citySearch.trim().toLowerCase();
    if (!q) return ALL_LOCATIONS;
    return ALL_LOCATIONS.filter(
      (l) => l.city.toLowerCase().includes(q) || l.state.toLowerCase().includes(q),
    );
  }, [citySearch]);

  const continueBusinessStep = () => {
    const fullNameErr = validateFullName(false)(fullName);
    if (fullNameErr) return Alert.alert('Invalid', fullNameErr);
    const companyTrim = companyName.trim();
    if (!companyTrim) return Alert.alert('Required', 'Please enter company name.');
    const companyErr = maxLength(
      VALIDATION.COMPANY_NAME_MAX_LENGTH,
      `Company name must be at most ${VALIDATION.COMPANY_NAME_MAX_LENGTH} characters.`,
    )(companyTrim);
    if (companyErr) return Alert.alert('Invalid', companyErr);
    if (companyNameTakenCheck?.taken) return Alert.alert('Invalid', 'Company name already exists.');
    const normalizedCity = citySearch.trim().toLowerCase();
    const inferredLocation =
      selectedLocation ??
      (normalizedCity ? ALL_LOCATIONS.find((loc) => loc.city.toLowerCase() === normalizedCity) ?? null : null);
    if (!inferredLocation) return Alert.alert('Required', 'Please select your city.');
    if (!selectedLocation) setSelectedLocation(inferredLocation);
    setCityPickerOpen(false);
    setCitySearch('');
    goToPage(2);
  };

  const createAccount = async () => {
    if (!isOnline) return Alert.alert('No internet', 'Connect to the internet to create an account.');
    const emailErr = validateEmail(email);
    if (emailErr) return Alert.alert('Invalid', emailErr);
    const passwordErr = validatePassword(password);
    if (passwordErr) return Alert.alert('Invalid', passwordErr);
    if (password !== confirmPassword) return Alert.alert('Invalid', 'Passwords do not match.');
    const storedPhone = normalizeIndianPhoneForMetadata(phone);
    if (!storedPhone || !extractIndianMobileTenDigits(phone)) return Alert.alert('Invalid', 'Enter a valid phone number.');
    const companyTrim = companyName.trim();
    setLoading(true);
    const dup = await checkOrganizationNameTaken(companyTrim);
    if (dup.error) {
      setLoading(false);
      return Alert.alert('Error', dup.error.message);
    }
    if (dup.taken) {
      setLoading(false);
      return Alert.alert('Invalid', 'Company name already exists.');
    }
    const { error } = await signUp(
      email.trim(),
      password,
      fullName.trim() || undefined,
      'user',
      operatingModel,
      storedPhone,
      companyTrim,
      addressLine.trim() || undefined,
      selectedLocation?.city,
      selectedLocation?.state,
      selectedLocation?.zone,
    );
    setLoading(false);
    if (error) return Alert.alert('Error', error.message);
    goToPage(3);
  };

  const handleBack = () => {
    if (step > 0) {
      goToPage(step - 1);
      return;
    }
    router.back();
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 20 : 0}
    >
      {!isDesktop ? (
        <>
          <TouchableOpacity
            style={[styles.backLink, { paddingTop: insets.top + 8 }]}
            onPress={handleBack}
            hitSlop={12}
          >
            <FontAwesome name="chevron-left" size={20} color={LIGHT.textMuted} />
            <Text style={styles.backLinkText}>{step === 0 ? 'Back' : 'Previous'}</Text>
          </TouchableOpacity>
          <View style={styles.brandRow}>
            <Text style={styles.brandText}>PULSE.</Text>
          </View>
        </>
      ) : null}

      <View style={isDesktop ? styles.panelShell : styles.mobileFlowShell}>
        {isDesktop ? (
          <View style={styles.leftPanel}>
            <Text style={styles.leftLogo}>PULSE<Text style={styles.logoDot}>.</Text></Text>
            <Text style={styles.leftTag}>Business Hub Onboarding</Text>
            <Text style={styles.leftTitle}>Build your workspace.</Text>
            <Text style={styles.leftSubtitle}>
              Organize your fleet and logistics operations with Pulse.
            </Text>
          </View>
        ) : null}

        <View style={isDesktop ? styles.rightPanel : styles.mobileRightPanel}>
          {isDesktop ? (
            <TouchableOpacity style={[styles.backLink, styles.backLinkDesktop]} onPress={handleBack} hitSlop={12}>
              <FontAwesome name="chevron-left" size={20} color={LIGHT.textMuted} />
              <Text style={styles.backLinkText}>{step === 0 ? 'Back' : 'Previous'}</Text>
            </TouchableOpacity>
          ) : null}

          <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        style={[styles.pagesScroller, isDesktop && styles.pagesScrollerDesktop]}
        contentContainerStyle={styles.pagesWrap}
        keyboardShouldPersistTaps="handled"
          >
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
                  editable={!loading}
                />
              </View>
              {phoneInlineError ? <Text style={styles.fieldError}>{phoneInlineError}</Text> : null}
              {phoneExistsCheck?.loading ? (
                <Text style={styles.phoneHint}>Checking...</Text>
              ) : phoneExistsCheck?.exists ? (
                <Text style={styles.phoneHint}>This number is already registered.</Text>
              ) : null}
            </View>
            <TouchableOpacity
              style={[styles.primaryBtn, (!isPhoneValid(phone) || loading) && styles.primaryBtnDisabled]}
              onPress={continuePhoneStep}
              disabled={!isPhoneValid(phone) || loading}
            >
              <Text style={styles.primaryBtnText}>Continue</Text>
            </TouchableOpacity>
          </View>
        </View>

            <View style={[styles.page, { width: pageWidth }]}>
          <View style={styles.pageContent}>
            <Text style={styles.mainTitle}>{STEP_CONTENT[1].title}</Text>
            <Text style={styles.subTitle}>{STEP_CONTENT[1].subtitle}</Text>
            <View style={styles.inputGroup}>
              <Text style={styles.fieldLabel}>Full name</Text>
              <TextInput
                style={styles.input}
                placeholder="Your name"
                placeholderTextColor={LIGHT.placeholder}
                value={fullName}
                onChangeText={setFullName}
                editable={!loading}
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.fieldLabel}>Company name</Text>
              <TextInput
                style={styles.input}
                placeholder="Company"
                placeholderTextColor={LIGHT.placeholder}
                value={companyName}
                onChangeText={setCompanyName}
                editable={!loading}
              />
              {companyNameTakenCheck?.loading ? <Text style={styles.phoneHint}>Checking company...</Text> : null}
              {companyNameTakenCheck?.taken ? <Text style={styles.fieldError}>Company name already exists.</Text> : null}
            </View>
            <Text style={styles.fieldLabel}>Business model</Text>
            <View style={styles.modelRow}>
              {OPERATING_MODELS.map(({ value, label }) => (
                <TouchableOpacity
                  key={value}
                  style={[styles.modelChip, operatingModel === value && styles.modelChipActive]}
                  onPress={() => setOperatingModel(value)}
                  disabled={loading}
                >
                  <Text style={[styles.modelChipText, operatingModel === value && styles.modelChipTextActive]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.fieldLabel}>Address / Street</Text>
              <TextInput
                style={styles.input}
                placeholder="Building, street, area"
                placeholderTextColor={LIGHT.placeholder}
                value={addressLine}
                onChangeText={setAddressLine}
                editable={!loading}
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.fieldLabel}>City / District <Text style={{ color: Theme.destructive }}>*</Text></Text>
              <View style={styles.cityFieldWrap}>
                <View style={[styles.input, styles.citySearchInputWrap, cityPickerOpen && styles.citySearchInputWrapActive]}>
                  <FontAwesome name="search" size={15} color={LIGHT.textMuted} style={styles.searchIconInline} />
                  <TextInput
                    style={styles.citySearchInput}
                    placeholder="Search & select city"
                    placeholderTextColor={LIGHT.placeholder}
                    value={cityPickerOpen ? citySearch : (selectedLocation?.city ?? '')}
                    onFocus={() => {
                      setCityPickerOpen(true);
                      setCitySearch(selectedLocation?.city ?? '');
                    }}
                    onChangeText={(text) => {
                      setCityPickerOpen(true);
                      setCitySearch(text);
                    }}
                    editable={!loading}
                    autoCapitalize="words"
                    clearButtonMode="while-editing"
                  />
                  <TouchableOpacity
                    onPress={() => {
                      if (cityPickerOpen) {
                        setCityPickerOpen(false);
                        setCitySearch('');
                      } else {
                        setCityPickerOpen(true);
                        setCitySearch(selectedLocation?.city ?? '');
                      }
                    }}
                    hitSlop={10}
                    disabled={loading}
                  >
                    <FontAwesome name={cityPickerOpen ? 'chevron-up' : 'chevron-down'} size={14} color={LIGHT.textMuted} />
                  </TouchableOpacity>
                </View>
                {selectedLocation && !cityPickerOpen ? (
                  <Text style={styles.selectorSubText} numberOfLines={1}>{selectedLocation.state}</Text>
                ) : null}
                {cityPickerOpen ? (
                  <View style={styles.inlineDropdown}>
                    <FlatList
                      data={filteredLocations}
                      keyExtractor={(_, i) => String(i)}
                      keyboardShouldPersistTaps="handled"
                      getItemLayout={(_, index) => ({ length: ITEM_HEIGHT, offset: ITEM_HEIGHT * index, index })}
                      initialNumToRender={20}
                      maxToRenderPerBatch={20}
                      removeClippedSubviews
                      renderItem={({ item }) => (
                        <TouchableOpacity
                          style={[styles.stateItem, selectedLocation?.city === item.city && selectedLocation?.state === item.state && styles.stateItemActive]}
                          onPress={() => {
                            setSelectedLocation(item);
                            setCityPickerOpen(false);
                            setCitySearch('');
                          }}
                        >
                          <View>
                            <Text style={[styles.stateItemText, selectedLocation?.city === item.city && selectedLocation?.state === item.state && styles.stateItemTextActive]}>
                              {item.city}
                            </Text>
                            <Text style={styles.stateZoneBadge}>{item.state}</Text>
                          </View>
                          <View style={styles.zonePill}>
                            <Text style={styles.zonePillText}>{item.zone}</Text>
                          </View>
                        </TouchableOpacity>
                      )}
                      ItemSeparatorComponent={() => <View style={styles.stateSep} />}
                      ListEmptyComponent={<Text style={styles.emptyText}>No results found</Text>}
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
            <TouchableOpacity style={[styles.primaryBtn, loading && styles.primaryBtnDisabled]} onPress={continueBusinessStep} disabled={loading}>
              <Text style={styles.primaryBtnText}>Continue</Text>
            </TouchableOpacity>
          </View>
        </View>

            <View style={[styles.page, { width: pageWidth }]}>
          <View style={styles.pageContent}>
            <Text style={styles.mainTitle}>{STEP_CONTENT[2].title}</Text>
            <Text style={styles.subTitle}>{STEP_CONTENT[2].subtitle}</Text>
            <View style={styles.inputGroup}>
              <Text style={styles.fieldLabel}>Email</Text>
              <TextInput
                style={styles.input}
                placeholder="you@example.com"
                placeholderTextColor={LIGHT.placeholder}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                editable={!loading}
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.fieldLabel}>Password</Text>
              <View style={styles.passwordRow}>
                <TextInput
                  style={styles.inputPassword}
                  placeholder="At least 6 characters"
                  placeholderTextColor={LIGHT.placeholder}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  editable={!loading}
                />
                <TouchableOpacity onPress={() => setShowPassword((v) => !v)} style={styles.eyeButton}>
                  <FontAwesome name={showPassword ? 'eye-slash' : 'eye'} size={20} color={LIGHT.textMuted} />
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.fieldLabel}>Confirm password</Text>
              <TextInput
                style={styles.input}
                placeholder="Re-enter password"
                placeholderTextColor={LIGHT.placeholder}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showPassword}
                editable={!loading}
              />
            </View>
            <TouchableOpacity style={[styles.primaryBtn, loading && styles.primaryBtnDisabled]} onPress={createAccount} disabled={loading}>
              {loading ? <ActivityIndicator color={Theme.textOnPrimary} /> : <Text style={styles.primaryBtnText}>Create account</Text>}
            </TouchableOpacity>
          </View>
        </View>

            <View style={[styles.page, { width: pageWidth }]}>
          <View style={styles.pageContent}>
            <View style={styles.crownWrap}>
              <FontAwesome name="check-circle" size={48} color={LIGHT.accent} />
            </View>
            <Text style={styles.mainTitle}>{STEP_CONTENT[3].title}</Text>
            <Text style={styles.subTitle}>{STEP_CONTENT[3].subtitle}</Text>
            <TouchableOpacity style={styles.primaryBtn} onPress={() => router.replace('/')}>
              <Text style={styles.primaryBtnText}>Go to app</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.linkRow} onPress={() => router.replace('/sign-in?direct=1')}>
              <Text style={styles.linkText}>Already have an account? Sign in</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.linkRow} onPress={() => router.push('/driver-signup')}>
              <Text style={styles.linkText}>Driver? Sign up as driver</Text>
            </TouchableOpacity>
          </View>
            </View>
          </ScrollView>

          <View style={[styles.stepIndicator, { paddingBottom: insets.bottom + 8 }]}>
            {STEP_CONTENT.map((_, i) => (
              <View key={i} style={[styles.stepDot, i === step && styles.stepDotActive, i < step && styles.stepDotDone]} />
            ))}
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: LIGHT.background },
  mobileFlowShell: { flex: 1 },
  panelShell: {
    flex: 1,
    flexDirection: 'row',
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
  logoDot: {
    color: Theme.driverPrimary,
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
    backgroundColor: '#ffffff',
  },
  mobileRightPanel: {
    flex: 1,
  },
  backLink: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 24, paddingBottom: 8 },
  backLinkDesktop: { paddingHorizontal: 0, alignSelf: 'center', width: 560, paddingTop: 16 },
  backLinkText: { fontSize: 14, color: LIGHT.textMuted, fontWeight: '600' },
  brandRow: { paddingHorizontal: 24, paddingBottom: 4 },
  brandText: { fontSize: 28, fontWeight: '900', fontStyle: 'italic', letterSpacing: -0.8, color: Theme.driverPrimary },
  pagesWrap: { flexGrow: 1 },
  pagesScroller: { flex: 1 },
  pagesScrollerDesktop: { width: 560, alignSelf: 'center' },
  page: { flex: 1, paddingHorizontal: 24, paddingTop: 24, justifyContent: 'flex-start' },
  pageContent: { maxWidth: 360, alignSelf: 'center', width: '100%' },
  mainTitle: { fontSize: 28, fontWeight: '800', color: LIGHT.text, marginBottom: 10, letterSpacing: -0.5, textAlign: 'center' },
  subTitle: { fontSize: 16, color: LIGHT.text, opacity: 0.85, marginBottom: 24, lineHeight: 22, textAlign: 'center' },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: LIGHT.textMuted, marginBottom: 8, letterSpacing: 0.5 },
  inputGroup: { marginBottom: 16 },
  inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: LIGHT.inputBg, borderRadius: 12, borderWidth: 1, borderColor: LIGHT.border },
  inputRowError: { borderColor: Theme.destructive },
  flagIcon: { fontSize: 24, marginLeft: 14, marginRight: 6 },
  dialCode: { fontSize: 16, fontWeight: '600', color: LIGHT.text, marginRight: 8 },
  phoneInput: { flex: 1, minHeight: 48, paddingVertical: 14, paddingHorizontal: 12, fontSize: 16, color: LIGHT.text },
  input: { minHeight: 48, paddingVertical: 14, paddingHorizontal: 14, fontSize: 16, color: LIGHT.text, backgroundColor: LIGHT.inputBg, borderRadius: 12, borderWidth: 1, borderColor: LIGHT.border },
  inputPassword: { flex: 1, minHeight: 48, paddingVertical: 14, paddingHorizontal: 14, paddingRight: 48, fontSize: 16, color: LIGHT.text, backgroundColor: LIGHT.inputBg, borderRadius: 12, borderWidth: 1, borderColor: LIGHT.border },
  passwordRow: { flexDirection: 'row', alignItems: 'center' },
  eyeButton: { position: 'absolute', right: 12, padding: 8 },
  modelRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  modelChip: { flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: LIGHT.border, backgroundColor: LIGHT.surface, alignItems: 'center' },
  modelChipActive: { backgroundColor: LIGHT.accent, borderColor: LIGHT.accent },
  modelChipText: { fontSize: 14, fontWeight: '600', color: LIGHT.textMuted },
  modelChipTextActive: { color: '#fff' },
  primaryBtn: { backgroundColor: LIGHT.buttonPrimary, borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  primaryBtnDisabled: { opacity: 0.6 },
  primaryBtnText: { fontSize: 15, fontWeight: '700', color: '#fff', letterSpacing: 0.5 },
  fieldError: { fontSize: 12, color: Theme.destructive, marginTop: 6, marginLeft: 2 },
  phoneHint: { fontSize: 12, color: LIGHT.textMuted, marginTop: 6, marginLeft: 2 },
  crownWrap: { width: 88, height: 88, borderRadius: 44, backgroundColor: LIGHT.surface, borderWidth: 1, borderColor: LIGHT.border, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 24 },
  linkRow: { marginTop: 14, alignSelf: 'center' },
  linkText: { fontSize: 14, color: LIGHT.accent, fontWeight: '600' },
  stepIndicator: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, paddingTop: 16 },
  stepDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: LIGHT.border },
  stepDotActive: { backgroundColor: LIGHT.accent, width: 24 },
  stepDotDone: { backgroundColor: LIGHT.accent, opacity: 0.6 },
  // City picker trigger
  stateSelector: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10, minHeight: 48 },
  stateSelectorText: { fontSize: 15, color: LIGHT.text, fontWeight: '500' },
  stateSelectorPlaceholder: { fontSize: 15, color: LIGHT.placeholder },
  selectorSubText: { fontSize: 12, color: LIGHT.textMuted, marginTop: 1 },
  // Zone badge (auto-filled display)
  zoneBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  zoneBadgeLabel: { fontSize: 12, fontWeight: '700', color: LIGHT.textMuted, letterSpacing: 0.5 },
  zoneBadge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8, backgroundColor: LIGHT.surface, borderWidth: 1, borderColor: LIGHT.border },
  zoneBadgeText: { fontSize: 13, fontWeight: '600', color: LIGHT.accent },
  cityFieldWrap: { width: '100%' },
  citySearchInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 50,
    paddingHorizontal: 12,
    marginBottom: 0,
    ...Platform.select({
      web: { outlineStyle: 'none' } as object,
    }),
  },
  citySearchInputWrapActive: {
    borderColor: '#cbd5e1',
    shadowColor: '#0f172a',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  searchIconInline: { marginRight: 8 },
  citySearchInput: {
    flex: 1,
    fontSize: 15,
    color: LIGHT.text,
    paddingVertical: 10,
    ...Platform.select({
      web: { outlineStyle: 'none' } as object,
    }),
  },
  inlineDropdown: {
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#dbe3ee',
    backgroundColor: '#fff',
    maxHeight: 320,
    overflow: 'hidden',
    shadowColor: '#0f172a',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  // List items
  stateItem: { height: ITEM_HEIGHT, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stateItemActive: { backgroundColor: 'rgba(15,23,42,0.04)' },
  stateItemText: { fontSize: 15, color: LIGHT.text, fontWeight: '500' },
  stateItemTextActive: { color: LIGHT.text, fontWeight: '700' },
  stateZoneBadge: { fontSize: 12, color: LIGHT.textMuted, marginTop: 2 },
  stateSep: { height: 1, backgroundColor: LIGHT.border, marginHorizontal: 16 },
  zonePill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: LIGHT.surface, borderWidth: 1, borderColor: LIGHT.border },
  zonePillText: { fontSize: 10, fontWeight: '700', color: LIGHT.textMuted, letterSpacing: 0.3 },
  emptyText: { textAlign: 'center', color: LIGHT.textMuted, paddingVertical: 32, fontSize: 14 },
});
