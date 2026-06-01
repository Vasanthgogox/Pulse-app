import { useAuth } from '@/contexts/AuthContext';
import { useIsOnline } from '@/contexts/NetworkContext';
import {
  checkExistingUserByPhone,
  checkOrganizationNameTaken,
  resendVerificationEmail,
  setPendingOAuthMetadata,
  updateProfile,
  type OperatingModel,
} from '@/features/auth';
import { getOrganizationsForUser } from '@/features/organization/services/organization.service';
import { validateEmail } from '@/lib/emailValidation';
import { formatMobileNumber } from '@/lib/format';
import { ROUTES } from '@/lib/routes';
import {
  clearBusinessSignupBranding,
  hydrateBusinessSignupBrandingFlag,
  persistBusinessSignupBrandingStep,
  readBusinessSignupBrandingStep,
  setBusinessSignupBrandingActive,
} from '@/lib/onboarding/businessSignupBranding.util';
import {
  extractIndianMobileTenDigits,
  isPhoneValid,
  normalizeIndianPhoneForMetadata,
  validatePhone,
} from '@/lib/phoneValidation';
import { validateFullName, validatePassword } from '@/lib/validation';
import {
  pickAndUploadAvatar,
  pickAndUploadOrgLogo,
  uploadAvatarFromLocal,
  updateOrganizationLogo,
} from '@/lib/avatarUpload';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, ScrollView, useWindowDimensions } from 'react-native';

import type { IndiaLocation } from '../components/CityPicker';
import {
  CONFIRM_SCROLL_DELAY_MS,
  DEBOUNCE_MS,
  DESKTOP_BREAKPOINT,
  DESKTOP_MAX_PANEL_WIDTH,
  EMAIL_RESEND_SECS,
  OTP_LENGTH,
  OTP_RESEND_SECS,
  STEP_LABELS,
  type BusinessType,
  type EmployeeCount,
  type FleetSize,
  type MonthlyVolume,
} from '../signUpConstants';
import { useCountdown } from './useCountdown';

export { STEP_LABELS };

export function useBusinessSignUpFlow() {
  const { width } = useWindowDimensions();
  const router = useRouter();
  const isOnline = useIsOnline();
  const { signUp, signIn, signInWithGoogle, refreshSession } = useAuth();
  const scrollRef = useRef<ScrollView>(null);
  const accountScrollRef = useRef<ScrollView>(null);
  const sessionEnsuredRef = useRef(false);

  const isDesktop = width >= DESKTOP_BREAKPOINT;
  const useMobileLayout = !isDesktop;
  const pageWidth = isDesktop ? Math.min(DESKTOP_MAX_PANEL_WIDTH, width - 120) : width;

  const [step, setStep] = useState(0);

  // Step 0
  const [phone, setPhoneRaw] = useState('');
  const [phoneExistsCheck, setPhoneExistsCheck] = useState<{
    loading: boolean; exists: boolean; email?: string; masked_email?: string;
  } | null>(null);
  const phoneCheckRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Step 1
  const [otp, setOtp] = useState('');
  const [otpResendSecs, setOtpResendSecs] = useState(0);
  const otpCountdown = useCountdown();

  // Step 2
  const [orgName, setOrgNameRaw] = useState('');
  const [orgCheck, setOrgCheck] = useState<{ loading: boolean; taken: boolean } | null>(null);
  const orgCheckRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [orgTakenError, setOrgTakenError] = useState<string | null>(null);

  // Step 3
  const [businessType, setBusinessType] = useState<BusinessType | null>(null);
  const [employeeCount, setEmployeeCount] = useState<EmployeeCount | null>(null);
  const [operatingModel, setOperatingModelRaw] = useState<OperatingModel>('HYBRID');
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

  // Step 5 (account)
  const [emailVerificationRequired, setEmailVerificationRequired] = useState(false);
  const [resendingSecs, setResendingSecs] = useState(0);
  const resendEmailCountdown = useCountdown();

  // Step 6 — workspace logo (post-auth)
  const [provisionedOrgId, setProvisionedOrgId] = useState<string | null>(null);
  const [logoPreviewUri, setLogoPreviewUri] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [pendingLogoPath, setPendingLogoPath] = useState<string | null>(null);

  // Step 7 — profile photo (post-auth)
  const [profileAvatarSeed, setProfileAvatarSeed] = useState<string | null>(null);
  const [profilePreviewUri, setProfilePreviewUri] = useState<string | null>(null);
  const [profileLocalBase64, setProfileLocalBase64] = useState<string | null>(null);
  const [profileAvatarPath, setProfileAvatarPath] = useState<string | null>(null);
  const [profileUploading, setProfileUploading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);

  const [step2Attempted, setStep2Attempted] = useState(false);
  const [step3Attempted, setStep3Attempted] = useState(false);
  const [step4Attempted, setStep4Attempted] = useState(false);
  const [step5Attempted, setStep5Attempted] = useState(false);

  // ─── Derived / memoised ──────────────────────────────────────────────────

  const phoneInlineError = useMemo(() => {
    if (!phone.trim()) return null;
    if (!isPhoneValid(phone)) return 'Enter a valid 10-digit number.';
    return null;
  }, [phone]);

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
  }), [businessType, fleetSize, monthlyVolume, employeeCount, operatingModel]);

  const step4Errors = useMemo(() => ({
    city: !selectedLocation ? 'Select your city.' : null,
  }), [selectedLocation]);

  const step5Errors = useMemo(() => ({
    fullName: validateFullName(true)(fullName),
    email: !email.trim() ? 'Email is required.' : validateEmail(email),
    password: !password ? 'Password is required.' : validatePassword(password),
    confirmPassword: !confirmPassword
      ? 'Please confirm your password.'
      : password !== confirmPassword ? 'Passwords do not match.' : null,
  }), [fullName, email, password, confirmPassword]);

  const passwordStrength = useMemo(() => {
    if (!password || password.length < OTP_LENGTH) return 0;
    let score = 1;
    if (password.length >= 8) score++;
    if (/[A-Z]/.test(password) && /[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    return Math.min(score, 4);
  }, [password]);

  const confirmMismatch =
    password.length > 0 && confirmPassword.length > 0 && password !== confirmPassword;

  // ─── Side effects ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!phone.trim() || !isPhoneValid(phone)) {
      setPhoneExistsCheck(null);
      if (phoneCheckRef.current) clearTimeout(phoneCheckRef.current);
      return;
    }
    if (!isOnline) return;
    if (phoneCheckRef.current) clearTimeout(phoneCheckRef.current);
    setPhoneExistsCheck(p => (p ? { ...p, loading: true } : { loading: true, exists: false }));
    phoneCheckRef.current = setTimeout(async () => {
      const r = await checkExistingUserByPhone(phone);
      setPhoneExistsCheck({ loading: false, exists: r.exists, email: r.email, masked_email: r.masked_email });
    }, DEBOUNCE_MS);
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
    setOrgCheck(p => (p ? { ...p, loading: true } : { loading: true, taken: false }));
    orgCheckRef.current = setTimeout(async () => {
      const r = await checkOrganizationNameTaken(raw);
      setOrgCheck({ loading: false, taken: !r.error && r.taken });
    }, DEBOUNCE_MS);
    return () => { if (orgCheckRef.current) clearTimeout(orgCheckRef.current); };
  }, [orgName, isOnline]);

  // Restore branding steps after auth refresh / navigation bounce.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const active = await hydrateBusinessSignupBrandingFlag();
      if (cancelled || !active) return;
      const savedStep = await readBusinessSignupBrandingStep();
      if (cancelled || savedStep == null) return;
      setStep(savedStep);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Resolve org when entering branding steps (trigger may lag sign-up).
  // sessionEnsuredRef prevents re-running ensureAuthSession on every back/forward
  // between steps 6 and 7, which would otherwise fire signIn+refreshSession on each
  // step change and risk a routing cascade from app/index.tsx.
  useEffect(() => {
    if (step !== 6 && step !== 7) return;
    let cancelled = false;
    void (async () => {
      if (!sessionEnsuredRef.current) {
        const ok = await ensureAuthSession();
        if (cancelled) return;
        if (ok) sessionEnsuredRef.current = true;
      }
      if (cancelled || provisionedOrgId) return;
      const orgId = await resolveProvisionedOrgId();
      if (!cancelled && orgId) setProvisionedOrgId(orgId);
    })();
    return () => {
      cancelled = true;
    };
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (step >= 6 && step <= 8) {
      setBusinessSignupBrandingActive(true);
      void persistBusinessSignupBrandingStep(step);
    }
  }, [step]);

  // Cleanup debounce timers on unmount (countdowns clean themselves via useCountdown).
  useEffect(() => () => {
    if (phoneCheckRef.current) clearTimeout(phoneCheckRef.current);
    if (orgCheckRef.current) clearTimeout(orgCheckRef.current);
  }, []);

  // ─── Navigation ──────────────────────────────────────────────────────────

  const goToPage = (index: number) => {
    setStep(index);
    if (index >= 6 && index <= 8) {
      setBusinessSignupBrandingActive(true);
      void persistBusinessSignupBrandingStep(index);
    }
    scrollRef.current?.scrollTo({ x: index * pageWidth, animated: true });
  };

  const handleBack = () => {
    if (step === 0) { router.back(); return; }
    if (step === 8) {
      clearBusinessSignupBranding();
      router.replace('/');
      return;
    }
    // Step 6 is the first post-account-creation step. Pressing back here would
    // land on an already-submitted form, and further back presses would trigger
    // router.back() which exits the screen — then the branding flag redirects
    // straight back, creating a reload loop. Treat back from step 6 as "finish
    // later": clear the flag and let app/index.tsx route to the right screen.
    if (step === 6) {
      clearBusinessSignupBranding();
      router.replace('/');
      return;
    }
    goToPage(step - 1);
  };

  const resolveProvisionedOrgId = async (): Promise<string | null> => {
    const trimmed = orgName.trim().toLowerCase();
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const { organizations, error } = await getOrganizationsForUser();
      if (error) {
        console.warn('[signup] resolve org failed:', error.message);
      } else if (organizations.length > 0) {
        const match =
          organizations.find((o) => o.name.trim().toLowerCase() === trimmed) ?? organizations[0];
        if (match?.id) return match.id;
      }
      if (attempt < 5) {
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
    }
    return null;
  };

  const ensureAuthSession = async (): Promise<boolean> => {
    const { data: { session } } = await supabase().auth.getSession();
    if (session?.user?.id) return true;

    const signInResult = await signIn(email.trim(), password, true);
    if (!signInResult.error) {
      await refreshSession();
      return true;
    }

    const { data: { session: afterSignIn } } = await supabase().auth.getSession();
    return !!afterSignIn?.user?.id;
  };

  // ─── Setters with side-effects ───────────────────────────────────────────

  const setPhone = (t: string) => setPhoneRaw(formatMobileNumber(t));

  const setOrgName = (t: string) => {
    setOrgNameRaw(t);
    setStep2Attempted(false);
    setOrgTakenError(null);
  };

  const orgTakenMessage = (name: string) =>
    `The workspace '${name}' is already registered. Please ask your company's administrator to send you an invite.`;

  const setOperatingModel = (m: OperatingModel) => {
    setOperatingModelRaw(m);
    setFleetSize(null);
    setMonthlyVolume(null);
  };

  const toggleShowPassword = () => setShowPassword(v => !v);
  const toggleShowConfirmPassword = () => setShowConfirmPassword(v => !v);

  // ─── Step actions ────────────────────────────────────────────────────────

  const startOtpCountdown = () => otpCountdown.start(OTP_RESEND_SECS, setOtpResendSecs);

  const continuePhone = async () => {
    if (!isOnline) return Alert.alert('No internet', 'Connect to continue.');
    const phoneErr = validatePhone(phone);
    if (phoneErr) return Alert.alert('Invalid', phoneErr);

    // Cancel any in-flight debounce and use the cached result if fresh, else re-fetch once.
    if (phoneCheckRef.current) { clearTimeout(phoneCheckRef.current); phoneCheckRef.current = null; }

    let existing = phoneExistsCheck;
    if (!existing || existing.loading) {
      setLoading(true);
      const r = await checkExistingUserByPhone(phone);
      setLoading(false);
      existing = { loading: false, exists: r.exists, email: r.email, masked_email: r.masked_email };
      setPhoneExistsCheck(existing);
    }

    if (existing.exists && existing.email) {
      return Alert.alert(
        'Account exists',
        existing.masked_email
          ? `Sign in with ${existing.masked_email}.`
          : 'An account with this phone already exists.',
        [{ text: 'Sign in', onPress: () => router.replace(`${ROUTES.SIGN_IN}?email=${encodeURIComponent(existing!.email!)}`) }],
      );
    }
    setOtp('');
    startOtpCountdown();
    goToPage(1);
  };

  const verifyOtp = () => {
    const clean = otp.replace(/\s/g, '');
    if (clean.length < OTP_LENGTH) return Alert.alert('Invalid', 'Enter the 6-digit OTP.');
    // Mock OTP in all environments until a real SMS provider is wired.
    goToPage(2);
  };

  const continueOrgCheck = async () => {
    setStep2Attempted(true);
    const trimmed = orgName.trim();
    if (!trimmed) return;
    if (!isOnline) return Alert.alert('No internet', 'Connect to continue.');

    if (orgCheckRef.current) {
      clearTimeout(orgCheckRef.current);
      orgCheckRef.current = null;
    }

    let check = orgCheck;
    if (!check || check.loading) {
      setLoading(true);
      const r = await checkOrganizationNameTaken(trimmed);
      setLoading(false);
      if (r.error) return Alert.alert('Error', r.error.message);
      check = { loading: false, taken: r.taken };
      setOrgCheck(check);
    }

    if (check.taken) {
      setOrgTakenError(orgTakenMessage(trimmed));
      return;
    }

    setOrgTakenError(null);
    goToPage(3);
  };

  const continueCompanyDetails = () => {
    setStep3Attempted(true);
    const { businessType: bt, fleetSize: fs, monthlyVolume: mv, employeeCount: ec } = step3Errors;
    if (bt || fs || mv || ec) return;
    goToPage(4);
  };

  const continueCompanyLocation = () => {
    setStep4Attempted(true);
    if (step4Errors.city) return;
    goToPage(5);
  };

  /**
   * Validate org name before submit only when cache is stale (> 10s old would
   * require a timestamp — here we trust the debounced result is fresh enough
   * since orgCheck is reset on every orgName change). Skip the extra round-trip.
   */
  const guardOrgName = async (): Promise<boolean> => {
    const trimmed = orgName.trim();
    if (orgCheck && !orgCheck.loading) {
      if (orgCheck.taken) {
        setOrgTakenError(orgTakenMessage(trimmed));
        goToPage(2);
        return false;
      }
      return true;
    }
    const dup = await checkOrganizationNameTaken(trimmed);
    if (dup.error) {
      Alert.alert('Error', dup.error.message);
      return false;
    }
    if (dup.taken) {
      setOrgCheck({ loading: false, taken: true });
      setOrgTakenError(orgTakenMessage(trimmed));
      goToPage(2);
      return false;
    }
    return true;
  };

  const createAccount = async () => {
    if (!isOnline) return Alert.alert('No internet', 'Connect to create an account.');
    setStep5Attempted(true);
    const { fullName: fn, email: em, password: pw, confirmPassword: cp } = step5Errors;
    if (fn || em || pw || cp) return;

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
      operatingModel,
      companyName: orgName.trim(),
      addressLine: addressLine.trim() || undefined,
      city: selectedLocation?.city,
      state: selectedLocation?.state,
      zone: selectedLocation?.zone,
      businessType: businessType ?? undefined,
      employeeCount: employeeCount ?? undefined,
      fleetSizeBand: fleetSize ?? undefined,
      monthlyVolumeBand: monthlyVolume ?? undefined,
    });
    setLoading(false);
    if (result.error) return Alert.alert('Error', result.error.message);
    if (result.emailVerificationRequired) setEmailVerificationRequired(true);

    // Advance to branding before auth refresh so index boot guard cannot skip logo/photo.
    setBusinessSignupBrandingActive(true);
    goToPage(6);

    setLoading(true);
    await ensureAuthSession();
    const orgId = await resolveProvisionedOrgId();
    setProvisionedOrgId(orgId);
    setLoading(false);
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
      companyName: orgName.trim(),
      role: 'user',
      operatingModel,
      addressLine: addressLine.trim() || undefined,
      city: selectedLocation?.city,
      state: selectedLocation?.state,
      zone: selectedLocation?.zone,
      businessType: businessType ?? undefined,
      employeeCount: employeeCount ?? undefined,
      fleetSizeBand: fleetSize ?? undefined,
      monthlyVolumeBand: monthlyVolume ?? undefined,
    });
    if (pending.error) { setGoogleLoading(false); return Alert.alert('Error', pending.error.message); }

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
      operatingModel: 'HYBRID',
      ...(storedPhone && tenDigits ? { phone: storedPhone } : {}),
    });
    if (pending.error) { setGoogleLoading(false); return Alert.alert('Error', pending.error.message); }
    const { error } = await signInWithGoogle(true);
    setGoogleLoading(false);
    if (error) return Alert.alert('Error', error.message);
  };

  const resendVerification = async () => {
    const { error: resendErr } = await resendVerificationEmail(email.trim());
    if (resendErr) { Alert.alert('Error', resendErr.message); return; }
    resendEmailCountdown.start(EMAIL_RESEND_SECS, setResendingSecs);
  };

  const uploadOrgLogo = async () => {
    setLogoUploading(true);
    try {
      const hasSession = await ensureAuthSession();
      if (!hasSession) {
        Alert.alert(
          'Sign in required',
          'Confirm your email or sign in to upload a logo. You can skip and add one later in settings.',
        );
        return;
      }

      let orgId = provisionedOrgId;
      if (!orgId) {
        orgId = await resolveProvisionedOrgId();
        if (orgId) setProvisionedOrgId(orgId);
      }
      if (!orgId) {
        Alert.alert(
          'Workspace provisioning',
          'Your workspace is still being created. Skip for now and upload a logo from workspace settings.',
        );
        return;
      }

      const result = await pickAndUploadOrgLogo(orgId);
      if (result.error) {
        Alert.alert('Upload failed', result.error.message);
        return;
      }
      if (!result.path) return;
      const { error } = await updateOrganizationLogo(orgId, result.path);
      if (error) {
        Alert.alert('Save failed', error.message);
        return;
      }
      setPendingLogoPath(result.path);
      if (result.previewUri) setLogoPreviewUri(result.previewUri);
    } finally {
      setLogoUploading(false);
    }
  };

  const continueFromLogo = () => goToPage(7);
  const skipOrgLogo = () => goToPage(7);

  const selectProfileAvatarSeed = (seed: string) => {
    setProfileAvatarSeed(seed);
    setProfileAvatarPath(null);
    setProfilePreviewUri(null);
  };

  const uploadProfilePhoto = async () => {
    setProfileUploading(true);
    try {
      const hasSession = await ensureAuthSession();
      if (!hasSession) {
        Alert.alert(
          'Sign in required',
          'Confirm your email to upload a photo, or pick a preset and continue.',
        );
        return;
      }

      const { data: { user } } = await supabase().auth.getUser();
      if (!user?.id) return;

      const result = await pickAndUploadAvatar(user.id);
      if (result.error) {
        Alert.alert('Upload failed', result.error.message);
        return;
      }
      if (!result.path) return;
      setProfileAvatarPath(result.path);
      setProfileAvatarSeed('');
      if (result.previewUri) setProfilePreviewUri(result.previewUri);
    } finally {
      setProfileUploading(false);
    }
  };

  const persistProfilePhoto = async (): Promise<boolean> => {
    setProfileSaving(true);
    try {
      const { data: { session } } = await supabase().auth.getSession();
      if (!session?.user?.id) {
        // Email verification pending — advance without blocking onboarding.
        return true;
      }

      const userId = session.user.id;

      if (profilePreviewUri) {
        const uploaded = await uploadAvatarFromLocal(
          userId,
          profilePreviewUri,
          profileLocalBase64,
        );
        if (uploaded.error) {
          Alert.alert('Photo upload failed', uploaded.error.message);
          return false;
        }
        if (uploaded.path) {
          const { error } = await updateProfile({
            avatar_url: uploaded.path,
            avatar_seed: null,
          });
          if (error) {
            Alert.alert('Save failed', error.message);
            return false;
          }
          if (uploaded.previewUri) setProfilePreviewUri(uploaded.previewUri);
          setProfileAvatarPath(uploaded.path);
        }
      } else if (profileAvatarSeed) {
        const { error } = await updateProfile({
          avatar_url: null,
          avatar_seed: profileAvatarSeed,
        });
        if (error) {
          Alert.alert('Save failed', error.message);
          return false;
        }
      }
      await refreshSession();
      return true;
    } finally {
      setProfileSaving(false);
    }
  };

  const continueFromProfilePhoto = async () => {
    const ok = await persistProfilePhoto();
    if (ok) goToPage(8);
  };

  const skipProfilePhoto = async () => {
    const ok = await persistProfilePhoto();
    if (ok) goToPage(8);
  };

  const scrollAccountFieldIntoView = () => {
    setTimeout(() => {
      accountScrollRef.current?.scrollToEnd({ animated: true });
    }, CONFIRM_SCROLL_DELAY_MS);
  };

  return {
    // layout
    isDesktop,
    useMobileLayout,
    pageWidth,
    scrollRef,
    accountScrollRef,
    isOnline,

    // step
    step,
    goToPage,
    handleBack,

    // step 0
    phone,
    setPhone,
    phoneInlineError,
    phoneValid,
    phoneExistsCheck,

    // step 1
    otp,
    setOtp,
    otpResendSecs,
    startOtpCountdown,

    // step 2
    orgName,
    setOrgName,
    orgCheck,
    orgTakenError,
    step2Attempted,

    // step 3
    businessType,
    setBusinessType,
    employeeCount,
    setEmployeeCount,
    operatingModel,
    setOperatingModel,
    fleetSize,
    setFleetSize,
    monthlyVolume,
    setMonthlyVolume,
    addressLine,
    setAddressLine,
    selectedLocation,
    setSelectedLocation,
    step3Attempted,
    step3Errors,

    // step 4 (location)
    step4Attempted,
    step4Errors,

    // step 5 (account)
    fullName,
    setFullName,
    email,
    setEmail,
    password,
    setPassword,
    confirmPassword,
    setConfirmPassword,
    showPassword,
    toggleShowPassword,
    showConfirmPassword,
    toggleShowConfirmPassword,
    loading,
    googleLoading,
    step5Attempted,
    step5Errors,
    passwordStrength,
    confirmMismatch,
    scrollAccountFieldIntoView,

    // step 6 — logo
    provisionedOrgId,
    logoPreviewUri,
    logoUploading,
    pendingLogoPath,

    // step 7 — profile photo
    profileAvatarSeed,
    profilePreviewUri,
    profileAvatarPath,
    profileUploading,
    profileSaving,

    // step 8 — success
    emailVerificationRequired,
    resendingSecs,

    // actions
    continuePhone,
    verifyOtp,
    continueOrgCheck,
    continueCompanyDetails,
    continueCompanyLocation,
    createAccount,
    continueWithGoogle,
    continueWithGoogleFromWelcome,
    resendVerification,
    uploadOrgLogo,
    continueFromLogo,
    skipOrgLogo,
    selectProfileAvatarSeed,
    uploadProfilePhoto,
    continueFromProfilePhoto,
    skipProfilePhoto,
    finishBusinessSignup: clearBusinessSignupBranding,
  };
}

export type SignUpFlow = ReturnType<typeof useBusinessSignUpFlow>;
