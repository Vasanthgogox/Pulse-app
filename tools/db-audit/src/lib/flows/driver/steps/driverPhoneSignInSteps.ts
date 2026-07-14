import type { FlowStep } from '@/lib/flowStep.types';
import {
  AUTH_UID,
  EDGE_DRIVER_PHONE_SIGNIN,
  RPC_GET_EMAIL_BY_PHONE,
} from '@/lib/flows/shared/sqlSnippets';

/**
 * Driver phone sign-in · /driver-sign-in
 * Source: app/driver-sign-in.tsx · auth.service
 *   checkExistingUserByPhone · signInDriverByPhoneUnverified (current)
 *   sendDriverPhoneOtp · verifyDriverPhoneOtp · link-driver-phone (verified path, SMS pending)
 *
 * Edge: check-user-by-phone (intent=driver_signin) · driver-phone-signin-unverified (legacy)
 * Shared: _shared/driverSessionExchange.ts (magic link → session)
 */
export const DRIVER_PHONE_SIGNIN_STEPS: FlowStep[] = [
  {
    id: 'dr-signin-phone',
    order: 1,
    label: 'Phone',
    title: 'Sign in as a driver',
    subtitle: 'India mobile · account must already exist',
    route: '/driver-sign-in',
    screen: 'driver-sign-in.tsx · step 0',
    service: 'checkExistingUserByPhone',
    serviceCalls: [
      'RPC get_email_by_phone',
      'Edge check-user-by-phone (exists_check fallback)',
    ],
    phase: 'ui',
    fields: ['phone (10-digit India → +91 E.164)'],
    fieldMappings: [
      { input: 'phone', storesTo: 'normalized 10 digits → checkExistingUserByPhone' },
    ],
    reads: ['profiles via get_email_by_phone', 'check-user-by-phone Edge'],
    queries: [
      {
        label: '1) Phone exists (RPC)',
        when: 'handleSendOtp → checkExistingUserByPhone',
        sql: RPC_GET_EMAIL_BY_PHONE,
      },
      {
        label: '2) Edge fallback (exists_check)',
        when: 'RPC missing / error',
        sql: `-- Edge: check-user-by-phone POST { phone, intent omitted | exists_check }
-- admin.rpc('get_email_by_phone') or profiles phone scan
-- → { exists, email, masked_email }`,
      },
    ],
    routing: [
      { context: 'exists=true', track: 'default', nextScreen: 'OTP step (UI advance)' },
      {
        context: 'exists=false',
        track: 'no account',
        nextScreen: 'hint + link → /driver-signup (ROUTES.ONBOARDING.DRIVER)',
      },
    ],
    notes: [
      'No session yet — lookup only',
      'Not found → “New driver? Sign up” footer',
    ],
  },
  {
    id: 'dr-signin-otp',
    order: 2,
    label: 'OTP',
    title: 'Verify your number',
    subtitle: '4-digit UI gate · TEMPORARY (no SMS verification yet)',
    route: '/driver-sign-in',
    screen: 'driver-sign-in.tsx · step 1 · SignUpOtpBoxes',
    service: 'handleVerifyOtp → signInDriverByPhoneUnverified',
    phase: 'ui',
    fields: ['4-digit OTP (OTP_LENGTH=4)'],
    queries: [
      {
        label: 'No DB / Auth OTP check (current)',
        when: 'UI length gate only — does not call verifyOtp',
        sql: `-- TEMPORARY / INSECURE: OTP digits are not verified server-side.
-- Anyone who knows the driver's phone can sign in via this screen.
-- Swap to sendDriverPhoneOtp / verifyDriverPhoneOtp when SMS provider is enabled.`,
      },
    ],
    notes: [
      'Current: mock OTP UI — real possession not proved',
      'Verified path (built, unused): sendDriverPhoneOtp → signInWithOtp({ phone })',
    ],
  },
  {
    id: 'dr-signin-session',
    order: 3,
    label: 'Session',
    title: 'Phone → real driver session',
    subtitle: 'Edge magic-link exchange · no password',
    route: '/driver-sign-in',
    screen: 'driver-sign-in.tsx',
    service: 'signInDriverByPhoneUnverified',
    serviceCalls: [
      'Edge check-user-by-phone { intent: driver_signin } (primary)',
      'Edge driver-phone-signin-unverified (legacy fallback)',
      '_shared/driverSessionExchange exchangeMagicLinkForSession',
      'supabase.auth.setSession | verifyOtp magiclink',
    ],
    phase: 'auth',
    reads: ['get_email_by_phone → auth.users email'],
    tables: ['auth.sessions (via magic link)', 'profiles (session restore)'],
    queries: [
      {
        label: '1) Edge driver phone sign-in',
        when: 'signInDriverByPhoneUnverified',
        sql: EDGE_DRIVER_PHONE_SIGNIN,
      },
      {
        label: '2) Magic link → session tokens',
        when: 'driverSessionExchange.exchangeMagicLinkForSession',
        sql: `-- admin.auth.admin.generateLink({ type: 'magiclink', email })
-- anon.auth.verifyOtp({ token_hash | email+token, type: magiclink|email })
-- → { access_token, refresh_token } OR hashed_token for client exchange`,
      },
      {
        label: '3) Client sets session',
        when: 'applyDriverAuthSession / completeDriverMagicLinkSignIn',
        sql: `-- supabase.auth.setSession({ access_token, refresh_token })
-- OR supabase.auth.verifyOtp({ email, token: magicLinkToken, type: 'magiclink' })
-- AuthContext onAuthStateChange → user → router.replace('/')`,
      },
    ],
    routing: [
      { context: 'session ok', track: 'default', nextScreen: '/ → role gate → /(driver)' },
      { context: 'no_account', track: 'error', nextScreen: 'alert on sign-in screen' },
    ],
    notes: [
      'TEMPORARY — delete driver-phone-signin-unverified + unverified client path after SMS live',
      'Primary Edge intent=driver_signin on check-user-by-phone; legacy fn is fallback only',
    ],
  },
  {
    id: 'dr-signin-verified-path',
    order: 4,
    label: 'Verified',
    title: 'SMS OTP path (built · not wired in UI)',
    subtitle: 'signInWithOtp → verifyOtp → link-driver-phone',
    route: '/driver-sign-in (future swap)',
    screen: 'auth.service sendDriverPhoneOtp · verifyDriverPhoneOtp',
    service: 'sendDriverPhoneOtp → verifyDriverPhoneOtp → link-driver-phone',
    serviceCalls: [
      'supabase.auth.signInWithOtp({ phone })',
      'supabase.auth.verifyOtp({ phone, token, type: sms })',
      'Edge link-driver-phone (Bearer = phone-verified JWT)',
      'RPC get_driver_invitee_by_phone',
      'admin.updateUserById(realAccount, { phone, phone_confirm })',
      'admin.deleteUser(temporary phone identity) best-effort',
      'verifyOtp magiclink on real email when first link',
    ],
    phase: 'auth',
    tables: [
      'auth.users (temp phone identity → deleted)',
      'auth.users (real driver: phone attached)',
      'profiles / drivers (lookup only)',
    ],
    reads: ['get_driver_invitee_by_phone from JWT phone — never request body'],
    queries: [
      {
        label: '1) SMS OTP send / verify',
        when: 'SMS provider enabled',
        sql: `-- Client: supabase.auth.signInWithOtp({ phone: '+91…' })
-- Client: supabase.auth.verifyOtp({ phone, token, type: 'sms' })
-- First success may create a NEW disconnected auth.users phone identity`,
      },
      {
        label: '2) link-driver-phone',
        when: 'After phone JWT with phone_confirmed_at',
        sql: `-- Phone from caller's JWT only (phone_confirmed_at required)
SELECT * FROM public.get_driver_invitee_by_phone(p_phone := :jwt_phone);
-- If match.user_id = caller.id → { alreadyCurrent: true }
-- Else: admin.updateUserById(match.user_id, { phone, phone_confirm: true })
--       admin.deleteUser(caller.id)  -- retire temp identity
--       admin.generateLink magiclink → client verifyOtp → real session`,
      },
      {
        label: '3) Steady state (later sign-ins)',
        when: 'Phone already linked on real account',
        sql: `-- Supabase phone auth resolves straight to real account
-- link-driver-phone returns alreadyCurrent — no migration`,
      },
    ],
    notes: [
      'Security: link-driver-phone never reads phone from request body',
      'Replace handleSendOtp/handleVerifyOtp in driver-sign-in.tsx when SMS is configured',
    ],
  },
  {
    id: 'dr-signin-boot',
    order: 5,
    label: 'Boot',
    title: 'Index → driver shell',
    subtitle: 'Same role gate as post-signup entry',
    route: '/ → /(driver)',
    screen: 'app/index.tsx · (driver)/_layout',
    service: 'AuthContext session · claimIndexBootRedirect',
    phase: 'post-auth',
    reads: ['profiles.role=driver'],
    queries: [
      {
        label: 'profiles.role (driver gate)',
        when: 'app/index.tsx after session',
        sql: `SELECT id, role, aggregated, asset, full_name, email, phone
FROM public.profiles
WHERE id = ${AUTH_UID};`,
      },
    ],
    routing: [
      { context: 'role=driver', track: 'default', nextScreen: '/(driver)' },
    ],
    notes: [
      'Skips DriverSignupSuccessStep — returning driver, not new signup',
      'Shares hub shell bootstrap with enter-app module (dr-enter-shell)',
    ],
  },
];
