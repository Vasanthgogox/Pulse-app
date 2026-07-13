import type { FlowStep } from '@/lib/flowStep.types';
import {
  AUTH_UID,
  HANDLE_NEW_USER_TRIGGER,
  PROFILE_UPDATE,
  RPC_GET_EMAIL_BY_PHONE,
  SIGNUP_AUTH_INSERT,
} from '@/lib/flows/shared/sqlSnippets';

export const DRIVER_SIGNUP_STEPS: FlowStep[] = [
  {
    id: 'dr-phone',
    order: 1,
    label: 'Phone',
    title: 'Welcome',
    subtitle: 'India mobile number',
    route: '/driver-signup',
    screen: 'driver-signup.tsx',
    service: 'checkExistingUserByPhone',
    phase: 'ui',
    fields: ['phone'],
    reads: ['profiles via get_email_by_phone'],
    queries: [
      {
        label: 'Phone exists',
        when: 'validatePhoneStep',
        sql: RPC_GET_EMAIL_BY_PHONE,
      },
    ],
  },
  {
    id: 'dr-otp',
    order: 2,
    label: 'OTP',
    title: 'Verify',
    route: '/driver-signup',
    phase: 'ui',
    fields: ['6-digit OTP (UI gate)'],
    queries: [
      {
        label: 'No DB read/write',
        when: 'Mock OTP UI gate only',
        sql: '-- Client-side validation; no resolver on driver path',
      },
    ],
    notes: ['Mock OTP — no invitation resolver on driver path'],
  },
  {
    id: 'dr-credentials',
    order: 3,
    label: 'Account',
    title: 'Registry',
    subtitle: 'Full name, email, password',
    route: '/driver-signup',
    phase: 'ui',
    fields: ['callsign/full_name', 'email', 'password'],
    queries: [
      {
        label: 'No DB write',
        when: 'Form state until establishLink',
        sql: '-- Stored locally until step 6 signUp',
      },
    ],
  },
  {
    id: 'dr-avatar',
    order: 4,
    label: 'Avatar',
    title: 'Choose identity',
    route: '/driver-signup',
    phase: 'ui',
    fields: ['avatar_seed preset or photo pick'],
    queries: [
      {
        label: 'No DB write',
        when: 'Local preview + AsyncStorage DRIVER_AVATAR key',
        sql: '-- avatar_seed / profilePreviewUri until establishLink updateProfile',
      },
    ],
  },
  {
    id: 'dr-docs',
    order: 5,
    label: 'Documents',
    title: 'KYC uploads',
    subtitle: 'License · Aadhaar · PAN (skippable)',
    route: '/driver-signup',
    phase: 'ui',
    fields: ['license', 'aadhaar', 'pan'],
    queries: [
      {
        label: 'No DB write yet',
        when: 'pendingDocs in memory; upload on establishLink',
        sql: '-- storage:driver-documents upload after signUp + signIn',
      },
    ],
  },
  {
    id: 'dr-auth',
    order: 6,
    label: 'Sign up',
    title: 'establishLink',
    route: '/driver-signup',
    service: 'auth.service signUp + signIn',
    serviceCalls: ['signUp(role=driver)', 'signIn', 'handle_new_user trigger'],
    phase: 'auth',
    authMetadata: ['role=driver', 'operating_model=ASSET_BASED', 'full_name', 'phone'],
    tables: ['auth.users', 'public.users', 'public.profiles'],
    queries: [
      {
        label: '1) auth.users INSERT',
        when: 'establishLink → signUp',
        sql: `${SIGNUP_AUTH_INSERT}
-- role=driver, operating_model=ASSET_BASED, full_name, phone`,
      },
      {
        label: '2) handle_new_user (driver profile)',
        when: 'AFTER INSERT',
        sql: `${HANDLE_NEW_USER_TRIGGER}
-- profiles: aggregated=false, asset=false; NO organizations`,
      },
      {
        label: '3) signIn session',
        when: 'Immediately after signUp',
        sql: '-- supabase.auth.signInWithPassword — existing session for post-auth writes',
      },
    ],
    notes: ['profiles: aggregated=false, asset=false · no org'],
  },
  {
    id: 'dr-post',
    order: 7,
    label: 'Post-auth',
    title: 'Profile + documents',
    service: 'updateProfile · uploadDriverDocuments · syncDriverDocumentMetadata',
    phase: 'post-auth',
    tables: [
      'profiles',
      'driver_profiles',
      'storage:driver-documents',
      'auth.users metadata (driver_documents)',
    ],
    queries: [
      {
        label: 'Avatar',
        when: 'establishLink after session',
        sql: `${PROFILE_UPDATE}
UPDATE public.profiles SET avatar_url = :path, avatar_seed = :seed WHERE id = ${AUTH_UID};`,
      },
      {
        label: 'Documents storage + metadata',
        when: 'uploadDriverDocuments',
        sql: `-- Storage: supabase.storage.from('driver-documents').upload(...)
-- auth.updateUser({ data: { driver_documents: { license, aadhaar, pan } } })
-- May INSERT/UPDATE driver_profiles / entity_documents per syncDriverDocumentMetadata`,
      },
      {
        label: 'Auto-link roster',
        when: 'DB trigger trg_auto_link_driver_on_signup (if phone match)',
        sql: `-- May link public.drivers row to user_id by phone on signup`,
      },
    ],
    notes: ['trg_auto_link_driver_on_signup may link roster drivers row by phone'],
  },
];
