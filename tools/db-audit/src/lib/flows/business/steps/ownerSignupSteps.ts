import type { FlowStep } from '@/lib/flowStep.types';
import {
  AUTH_UID,
  HANDLE_NEW_USER_TRIGGER,
  PROFILE_UPDATE,
  RPC_ORG_NAME_TAKEN,
  RPC_UPDATE_ORG_LOGO,
  SIGNUP_AUTH_INSERT,
  ORG_RESOLVE_FOR_USER,
} from '@/lib/flows/shared/sqlSnippets';

export const OWNER_SIGNUP_STEPS: FlowStep[] = [
  {
    id: 'bu-owner-org',
    order: 3,
    label: 'Org',
    title: 'Workspace',
    subtitle: 'Name your operator on the Pulse network',
    route: '/sign-up',
    screen: 'OrgStep',
    service: 'checkOrganizationNameTaken',
    phase: 'ui',
    fields: ['company_name → orgName'],
    reads: ['organizations.name uniqueness (RPC)'],
    queries: [
      {
        label: 'Name taken check',
        when: 'Debounced on orgName change + continueOrgCheck',
        sql: RPC_ORG_NAME_TAKEN,
      },
    ],
    notes: ['UI state only — no INSERT until signUp step 6'],
  },
  {
    id: 'bu-owner-profile',
    order: 4,
    label: 'Profile',
    title: 'Operations profile',
    subtitle: 'How do you operate? · fleet model, scale, and structure',
    route: '/sign-up',
    screen: 'CompanyDetailsStep',
    phase: 'ui',
    fields: [
      'operating_model (ASSET_BASED | NON_ASSET | HYBRID)',
      'business_type',
      'employee_count',
      'fleet_size_band (Asset · Hybrid)',
      'monthly_volume_band (Aggregate · Hybrid)',
    ],
    routing: [
      {
        context: 'ASSET_BASED',
        track: 'Asset · own trucks',
        nextScreen: 'Required: business_type · employee_count · fleet_size_band',
      },
      {
        context: 'NON_ASSET',
        track: 'Aggregate · broker only',
        nextScreen: 'Required: business_type · employee_count · monthly_volume_band',
      },
      {
        context: 'HYBRID',
        track: 'Both · mixed fleet',
        nextScreen: 'Required: business_type · employee_count · fleet_size_band · monthly_volume_band',
      },
    ],
    queries: [
      {
        label: 'No DB write on this step',
        when: 'Form state → signUp metadata at step 6',
        sql: `-- Stored in React state until createAccount / signUp()
-- operating_model → auth.users metadata + organizations.operating_model (trigger)
-- business_type, employee_count → auth + organizations
-- fleet_size_band (ASSET_BASED|HYBRID), monthly_volume_band (NON_ASSET|HYBRID) → auth metadata ONLY`,
      },
    ],
    notes: [
      'CompanyDetailsStep: fleet_size required for ASSET_BASED + HYBRID',
      'CompanyDetailsStep: monthly_volume required for NON_ASSET + HYBRID',
      'fleet_size_band & monthly_volume_band → auth metadata only (not org columns)',
    ],
  },
  {
    id: 'bu-owner-city',
    order: 5,
    label: 'City',
    title: 'Base location',
    subtitle: 'Primary office for dispatch context',
    route: '/sign-up',
    screen: 'CompanyLocationStep',
    phase: 'ui',
    fields: ['address_line', 'locality', 'pincode', 'city', 'state', 'zone', 'office lat/lon'],
    queries: [
      {
        label: 'No DB write on this step',
        when: 'Form state → signUp metadata at step 6',
        sql: `-- address_line, locality, pincode, city, state, zone → auth metadata + organizations (trigger)
-- office_latitude, office_longitude → auth metadata only`,
      },
    ],
  },
  {
    id: 'bu-owner-account',
    order: 6,
    label: 'Account',
    title: 'Credentials',
    subtitle: 'Secure account before activation',
    route: '/sign-up',
    screen: 'AccountStep',
    service: 'auth.service signUp',
    serviceCalls: ['guardOrgName → organization_name_is_taken', 'supabase.auth.signUp', 'handle_new_user trigger'],
    phase: 'auth',
    fields: ['full_name', 'email', 'password'],
    authMetadata: [
      'role=user',
      'onboarding_type=owner',
      'phone',
      'company_name',
      'operating_model',
      'business_type',
      'employee_count',
      'address_line',
      'locality',
      'pincode',
      'city',
      'state',
      'zone',
      'fleet_size_band',
      'monthly_volume_band',
      'avatar_seed (random driver-1…10)',
    ],
    tables: [
      'auth.users',
      'public.users',
      'public.profiles',
      'public.organizations',
      'public.organization_members',
    ],
    queries: [
      {
        label: '1) auth.users INSERT',
        when: 'createAccount → signUp()',
        sql: `${SIGNUP_AUTH_INSERT}
-- metadata keys: see auth.users metadata list on this step`,
      },
      {
        label: '2) handle_new_user trigger',
        when: 'AFTER INSERT auth.users',
        sql: HANDLE_NEW_USER_TRIGGER,
      },
    ],
    notes: ['email_confirmed_at null → email verification path', 'Then enterPostAuthBranding → steps 7–8'],
  },
  {
    id: 'bu-owner-logo',
    order: 7,
    label: 'Logo',
    title: 'Workspace branding',
    subtitle: 'Optional org logo (post-auth)',
    route: '/sign-up',
    screen: 'OrgLogoStep',
    service: 'pickAndUploadOrgLogo + updateOrganizationLogo',
    phase: 'post-auth',
    tables: ['organizations.logo_url', 'storage:org-logos'],
    reads: [ORG_RESOLVE_FOR_USER],
    queries: [
      {
        label: 'Resolve org id',
        when: 'uploadOrgLogo — provisionedOrgId or resolveProvisionedOrgId',
        sql: `${ORG_RESOLVE_FOR_USER}

SELECT id, name FROM public.organizations
WHERE id IN (SELECT organization_id FROM public.organization_members
  WHERE user_id = ${AUTH_UID} AND status = 'active');`,
      },
      {
        label: 'Save logo path',
        when: 'After storage upload',
        sql: RPC_UPDATE_ORG_LOGO,
      },
    ],
  },
  {
    id: 'bu-owner-photo',
    order: 8,
    label: 'Photo',
    title: 'Profile photo',
    subtitle: 'Avatar seed or upload (post-auth)',
    route: '/sign-up',
    screen: 'ProfilePhotoStep',
    service: 'updateProfile · uploadAvatarFromLocal',
    phase: 'post-auth',
    fields: ['avatar_seed | avatar_url'],
    tables: ['profiles', 'auth.users metadata', 'storage:avatars'],
    queries: [
      {
        label: 'Profile + auth metadata',
        when: 'persistProfilePhoto',
        sql: `${PROFILE_UPDATE}
-- avatar_url path OR avatar_seed:
UPDATE public.profiles
SET avatar_url = :path_or_null, avatar_seed = :seed_or_null
WHERE id = ${AUTH_UID};

-- supabase.auth.updateUser({ data: { avatar_url, avatar_seed } })`,
      },
    ],
    notes: ['If no session yet → setPendingPersonalization queue'],
  },
];
