import { useAuth } from '@/contexts/AuthContext';
import { useIsOnline } from '@/contexts/NetworkContext';
import {
  checkExistingUserByPhone,
  checkOrganizationNameTaken,
  resendVerificationEmail,
  setPendingOAuthMetadata,
  type OperatingModel,
} from '@/features/auth';
import { validateEmail } from '@/lib/emailValidation';
import { formatMobileNumber } from '@/lib/format';
import { ROUTES } from '@/lib/routes';
import {
  extractIndianMobileTenDigits,
  isPhoneValid,
  normalizeIndianPhoneForMetadata,
  validatePhone,
} from '@/lib/phoneValidation';
import { validateFullName, validatePassword } from '@/lib/validation';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, ScrollView, useWindowDimensions } from 'react-native';

import type { IndiaLocation } from '../components/CityPicker';

type BusinessType = 'SOLE_PROPRIETOR' | 'PARTNERSHIP' | 'PVT_LTD' | 'LLP' | 'OPC' | 'OTHER';
type EmployeeCount = '1-10' | '11-50' | '51-200' | '201-500' | '500+';
type FleetSize = '1-5' | '6-15' | '16-30' | '31-50' | '50+';
type MonthlyVolume = '<50' | '50-200' | '200-500' | '500-1000' | '1000+';

export const STEP_LABELS = ['Phone', 'Verify', 'Company', 'Details', 'Account'] as const;

export const OPERATING_MODELS: { value: OperatingModel; label: string; sub: string }[] = [
  { value: 'ASSET_BASED', label: 'Asset', sub: 'Own trucks' },
  { value: 'NON_ASSET', label: 'Aggregate', sub: 'Broker only' },
  { value: 'HYBRID', label: 'Both', sub: 'Mixed fleet' },
];

export const BUSINESS_TYPES: { value: BusinessType; label: string }[] = [
  { value: 'SOLE_PROPRIETOR', label: 'Sole Proprietor' },
  { value: 'PARTNERSHIP', label: 'Partnership' },
  { value: 'PVT_LTD', label: 'Pvt. Limited' },
  { value: 'LLP', label: 'LLP' },
  { value: 'OPC', label: 'OPC' },
  { value: 'OTHER', label: 'Other' },
];

export const EMPLOYEE_COUNTS: EmployeeCount[] = ['1-10', '11-50', '51-200', '201-500', '500+'];
export const FLEET_SIZES: FleetSize[] = ['1-5', '6-15', '16-30', '31-50', '50+'];
export const MONTHLY_VOLUMES: { value: MonthlyVolume; label: string }[] = [
  { value: '<50', label: 'Under 50' },
  { value: '50-200', label: '50–200' },
  { value: '200-500', label: '200–500' },
  { value: '500-1000', label: '500–1,000' },
  { value: '1000+', label: '1,000+' },
];

export function useBusinessSignUpFlow() {
  const { width } = useWindowDimensions();
  const router = useRouter();
  const isOnline = useIsOnline();
  const { signUp, signInWithGoogle } = useAuth();
  const scrollRef = useRef<ScrollView>(null);
  /** Per-page vertical scroll (horizontal pager does not scroll vertically). */
  const pageVerticalScrollRefs = useRef<Array<ScrollView | null>>([]);

  const isDesktop = width >= 1024;
  const pageWidth = isDesktop ? Math.min(560, width - 120) : width;

  const [step, setStep] = useState(0);

  // Step 0
  const [phone, setPhone] = useState('');
  const [phoneExistsCheck, setPhoneExistsCheck] = useState<{
    loading: boolean; exists: boolean; email?: string; masked_email?: string;
  } | null>(null);
  const phoneCheckRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Step 1
  const [otp, setOtp] = useState('');
  const [otpResendSecs, setOtpResendSecs] = useState(0);
  const resendTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Step 2
  const [orgName, setOrgName] = useState('');
  const [orgCheck, setOrgCheck] = useState<{ loading: boolean; taken: boolean } | null>(null);
  const orgCheckRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [orgJoinMode, setOrgJoinMode] = useState(false);

  // Step 3
  const [businessType, setBusinessType] = useState<BusinessType | null>(null);
  const [employeeCount, setEmployeeCount] = useState<EmployeeCount | null>(null);
  const [operatingModel, setOperatingModel] = useState<OperatingModel>('HYBRID');
  const [fleetSize, setFleetSize] = useState<FleetSize | null>(null);
  const [monthlyVolume, setMonthlyVolume] = useState<MonthlyVolume | null>(null);
  const [addressLine, setAddressLine] = useState('');
  const [selectedLocation, setSelectedLocation] = useState<IndiaLocation | null>(null);

  // Step 4
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  // Step 5
  const [emailVerificationRequired, setEmailVerificationRequired] = useState(false);
  const [resendingSecs, setResendingSecs] = useState(0);
  const resendEmailTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [step2Attempted, setStep2Attempted] = useState(false);
  const [step3Attempted, setStep3Attempted] = useState(false);
  const [step4Attempted, setStep4Attempted] = useState(false);

  const phoneInlineError = useMemo(() => {
    const t = phone.trim();
    if (!t) return null;
    if (!isPhoneValid(phone)) return 'Enter a valid 10-digit number.';
    return null;
  }, [phone]);

  /** Sign-up requires a full valid number; `isPhoneValid` alone treats empty as valid. */
  const phoneValid = useMemo(() => validatePhone(phone) === null, [phone]);

  const step3Errors = useMemo(() => ({
    businessType: !businessType ? 'Select your business structure.' : null,
    fleetSize:
      (operatingModel === 'ASSET_BASED' || operatingModel === 'HYBRID') && !fleetSize
        ? 'Select your fleet size.' : null,
    monthlyVolume:
      (operatingModel === 'NON_ASSET' || operatingModel === 'HYBRID') && !monthlyVolume
        ? 'Select your monthly shipment volume.' : null,
    employeeCount: !employeeCount ? 'Select your employee count.' : null,
    city: !selectedLocation ? 'Select your city.' : null,
  }), [businessType, fleetSize, monthlyVolume, employeeCount, selectedLocation, operatingModel]);

  const step4Errors = useMemo(() => ({
    fullName: validateFullName(true)(fullName),
    email: !email.trim()
      ? 'Email is required.'
      : validateEmail(email),
    password: !password
      ? 'Password is required.'
      : validatePassword(password),
    confirmPassword: !confirmPassword
      ? 'Please confirm your password.'
      : password !== confirmPassword ? 'Passwords do not match.' : null,
  }), [fullName, email, password, confirmPassword]);

  const passwordStrength = useMemo(() => {
    if (!password || password.length < 6) return 0;
    let score = 1;
    if (password.length >= 8) score++;
    if (/[A-Z]/.test(password) && /[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    return Math.min(score, 4);
  }, [password]);

  const confirmMismatch =
    password.length > 0 && confirmPassword.length > 0 && password !== confirmPassword;

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

  useEffect(() => () => {
    if (phoneCheckRef.current) clearTimeout(phoneCheckRef.current);
    if (orgCheckRef.current) clearTimeout(orgCheckRef.current);
    if (resendTimerRef.current) clearInterval(resendTimerRef.current);
    if (resendEmailTimerRef.current) clearInterval(resendEmailTimerRef.current);
  }, []);

  const goToPage = (index: number) => {
    setStep(index);
    scrollRef.current?.scrollTo({ x: index * pageWidth, animated: true });
  };

  const handleBack = () => {
    if (step === 0) { router.back(); return; }
    if (step === 5) { router.replace('/'); return; }
    if (step === 4 && orgJoinMode) { goToPage(2); return; }
    goToPage(step - 1);
  };

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

  const guardOrgName = async (): Promise<boolean> => {
    if (orgJoinMode) return true;
    const dup = await checkOrganizationNameTaken(orgName.trim());
    if (dup.error) {
      Alert.alert('Error', dup.error.message);
      return false;
    }
    if (dup.taken) {
      Alert.alert('Taken', 'This company name was just registered. Please choose another.');
      return false;
    }
    return true;
  };

  const continuePhone = async () => {
    if (!isOnline) return Alert.alert('No internet', 'Connect to continue.');
    const phoneErr = validatePhone(phone);
    if (phoneErr) return Alert.alert('Invalid', phoneErr);
    if (phoneExistsCheck?.loading) return;
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
    setOtp('');
    startOtpCountdown();
    goToPage(1);
  };

  const verifyOtp = () => {
    if (otp.replace(/\s/g, '').length < 6) {
      return Alert.alert('Invalid', 'Enter the 6-digit OTP.');
    }
    goToPage(2);
  };

  const continueOrgCheck = () => {
    setStep2Attempted(true);
    if (!orgName.trim()) return;
    if (orgCheck?.loading) return;
    const isTaken = orgCheck?.taken ?? false;
    setOrgJoinMode(isTaken);
    if (isTaken) {
      goToPage(4);
    } else {
      goToPage(3);
    }
  };

  const continueCompanyDetails = () => {
    setStep3Attempted(true);
    const errs = step3Errors;
    if (errs.businessType || errs.fleetSize || errs.monthlyVolume || errs.employeeCount || errs.city) return;
    goToPage(4);
  };

  const createAccount = async () => {
    if (!isOnline) return Alert.alert('No internet', 'Connect to create an account.');
    setStep4Attempted(true);
    const errs = step4Errors;
    if (errs.fullName || errs.email || errs.password || errs.confirmPassword) return;
    const storedPhone = normalizeIndianPhoneForMetadata(phone);
    if (!storedPhone || !extractIndianMobileTenDigits(phone)) {
      return Alert.alert('Invalid', 'Enter a valid phone number.');
    }

    setLoading(true);
    const ok = await guardOrgName();
    if (!ok) { setLoading(false); return; }

    const result = await signUp({
      email: email.trim(),
      password,
      fullName: fullName.trim(),
      role: 'user',
      phone: storedPhone,
      ...(orgJoinMode
        ? { skipOrgCreation: true }
        : {
            operatingModel,
            companyName: orgName.trim(),
            addressLine: addressLine.trim() || undefined,
            city: selectedLocation?.city,
            state: selectedLocation?.state,
            zone: selectedLocation?.zone,
            businessType: businessType ?? undefined,
            employeeCount: employeeCount ?? undefined,
          }),
    });
    setLoading(false);
    if (result.error) return Alert.alert('Error', result.error.message);
    if (result.emailVerificationRequired) setEmailVerificationRequired(true);
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
    const ok = await guardOrgName();
    if (!ok) { setGoogleLoading(false); return; }

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

  const continueWithGoogleFromWelcome = async () => {
    if (!isOnline) return Alert.alert('No internet', 'Connect to continue.');
    setGoogleLoading(true);
    const storedPhone = normalizeIndianPhoneForMetadata(phone);
    const tenDigits = extractIndianMobileTenDigits(phone);
    const pending = await setPendingOAuthMetadata({
      role: 'user',
      // Default to HYBRID at the welcome step since we don't have org details yet.
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

  const resendVerification = async () => {
    const { error: resendErr } = await resendVerificationEmail(email.trim());
    if (resendErr) { Alert.alert('Error', resendErr.message); return; }
    setResendingSecs(60);
    const t = setInterval(() => {
      setResendingSecs(s => {
        if (s <= 1) { clearInterval(t); return 0; }
        return s - 1;
      });
    }, 1000);
    resendEmailTimerRef.current = t;
  };

  return {
    // layout
    isDesktop,
    pageWidth,
    scrollRef,
    pageVerticalScrollRefs,

    isOnline,

    // state
    step,
    setStep,
    phone,
    setPhone: (t: string) => setPhone(formatMobileNumber(t)),
    phoneInlineError,
    phoneValid,
    phoneExistsCheck,
    otp,
    setOtp,
    otpResendSecs,
    orgName,
    setOrgName: (t: string) => { setOrgName(t); setStep2Attempted(false); },
    orgCheck,
    orgJoinMode,

    businessType,
    setBusinessType,
    employeeCount,
    setEmployeeCount,
    operatingModel,
    setOperatingModel: (m: OperatingModel) => {
      setOperatingModel(m);
      setFleetSize(null);
      setMonthlyVolume(null);
    },
    fleetSize,
    setFleetSize,
    monthlyVolume,
    setMonthlyVolume,
    addressLine,
    setAddressLine,
    selectedLocation,
    setSelectedLocation,

    fullName,
    setFullName,
    email,
    setEmail,
    password,
    setPassword,
    confirmPassword,
    setConfirmPassword,
    showPassword,
    setShowPassword,
    showConfirmPassword,
    setShowConfirmPassword,
    loading,
    googleLoading,

    emailVerificationRequired,
    resendingSecs,

    step2Attempted,
    step3Attempted,
    step4Attempted,
    setStep3Attempted,
    setStep4Attempted,

    step3Errors,
    step4Errors,
    passwordStrength,
    confirmMismatch,

    // actions
    goToPage,
    handleBack,
    continuePhone,
    verifyOtp,
    startOtpCountdown,
    continueOrgCheck,
    continueCompanyDetails,
    createAccount,
    continueWithGoogle,
    continueWithGoogleFromWelcome,
    resendVerification,
  };
}

