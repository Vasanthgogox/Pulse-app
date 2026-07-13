import type { FlowStep } from '@/lib/flowStep.types';

const AUTH_UID = 'auth.uid() /* after exchangeCodeForSession */';

/**
 * Business signup · Google OAuth owner path (variant step 4).
 * Source: useBusinessSignUpFlow.continueWithGoogle · auth.service
 */
export const businessGoogleOAuthSignInStep: FlowStep = {
  id: 'bu-google-oauth',
  order: 4,
  label: 'Google',
  title: 'OAuth sign-in',
  subtitle: 'AsyncStorage queue → Google session → patch auth + profiles + organizations',
  route: '/sign-up · /auth/callback (web redirect)',
  screen: 'AccountStep continueWithGoogle · auth/callback.tsx',
  service: 'setPendingOAuthMetadata → signInWithGoogle → applyPendingOAuthMetadata',
  serviceCalls: [
    'setPendingOAuthMetadata (AsyncStorage @pulse_pending_oauth_metadata_v1)',
    'supabase.auth.signInWithOAuth({ provider: google })',
    'exchangeCodeForSession(code) — web: auth/callback.tsx',
    'supabase.auth.updateUser({ data }) — auth metadata',
    'profiles.update(...).eq(id, userId)',
    'organization_members select → organizations.update(...)',
    'DB trigger handle_new_user on auth.users INSERT (may run before metadata patch)',
  ],
  phase: 'auth',
  fields: [
    'Queued from wizard: full_name, phone, company_name, operating_model',
    'address_line, locality, pincode, city, state, zone, office lat/lon',
    'business_type, employee_count, fleet_size_band, monthly_volume_band',
    'role=user · onboarding_type=owner (default when not member)',
  ],
  authMetadata: [
    'role=user',
    'onboarding_type=owner',
    'operating_model',
    'full_name',
    'phone',
    'company_name',
    'address_line',
    'locality',
    'pincode',
    'city',
    'state',
    'zone',
    'office_latitude',
    'office_longitude',
    'business_type',
    'employee_count',
    'fleet_size_band (auth only)',
    'monthly_volume_band (auth only)',
  ],
  tables: [
    'auth.users (INSERT via OAuth + UPDATE raw_user_meta_data)',
    'public.users (INSERT trigger)',
    'public.profiles (INSERT trigger + UPDATE client)',
    'public.organizations (INSERT trigger + UPDATE client)',
    'public.organization_members (INSERT trigger)',
  ],
  reads: [
    'AsyncStorage pending JSON (before session)',
    'organization_members — resolve org_id for UPDATE (retry up to 5×)',
  ],
  queries: [
    {
      label: '0) Pre-session queue (not SQL)',
      when: 'continueWithGoogle before OAuth redirect',
      sql: `-- Client only (auth.service setPendingOAuthMetadata)
-- AsyncStorage.setItem('@pulse_pending_oauth_metadata_v1', JSON.stringify({
--   fullName, phone, companyName, role: 'user', operatingModel,
--   addressLine, locality, pincode, city, state, zone,
--   officeLatitude, officeLongitude, businessType, employeeCount,
--   fleetSizeBand, monthlyVolumeBand
-- }));`,
    },
    {
      label: '1) auth.users — OAuth INSERT (Supabase Auth)',
      when: 'exchangeCodeForSession — first Google sign-in',
      sql: `-- GoTrue creates auth.users row (Google identity + sparse metadata).
-- Fires AFTER INSERT trigger → handle_new_user (see step 5).
-- Email from Google; raw_user_meta_data may lack wizard fields until step 2.`,
    },
    {
      label: '2) auth.users — metadata UPDATE',
      when: 'applyPendingOAuthMetadata step auth_metadata',
      sql: `-- Client: supabase.auth.updateUser({ data: { ... } })
-- Equivalent column:
UPDATE auth.users
SET raw_user_meta_data = raw_user_meta_data || :pending_json::jsonb
WHERE id = ${AUTH_UID};

-- Keys written (owner Google path):
-- role, onboarding_type, operating_model, full_name, phone, company_name,
-- address_line, locality, pincode, city, state, zone,
-- office_latitude, office_longitude, business_type, employee_count,
-- fleet_size_band, monthly_volume_band`,
    },
    {
      label: '3) public.profiles — UPDATE',
      when: 'applyPendingOAuthMetadata step profile',
      sql: `UPDATE public.profiles
SET
  full_name = :full_name,          -- if pending
  company_name = :company_name,    -- if pending
  phone = :phone_e164              -- if pending
WHERE id = ${AUTH_UID};

-- PostgREST:
-- .from('profiles').update({ full_name, company_name, phone }).eq('id', userId)`,
    },
    {
      label: '4) public.organizations — resolve org + UPDATE',
      when: 'applyPendingOAuthMetadata step organization (owner only)',
      sql: `-- Lookup (retried ≤5 × 400ms — trigger may lag)
SELECT organization_id
FROM public.organization_members
WHERE user_id = ${AUTH_UID}
  AND status = 'active'
  AND role IN ('owner', 'admin')
ORDER BY created_at ASC
LIMIT 1;

-- Update by membership org_id, else fallback owner_id:
UPDATE public.organizations
SET
  name = :company_name,
  operating_model = :operating_model,
  address_line = :address_line,
  locality = :locality,
  pincode = :pincode_digits,
  city = :city,
  state = :state,
  zone = :zone,
  business_type = :business_type,
  employee_count = :employee_count
WHERE id = :org_id_from_membership
   OR owner_id = ${AUTH_UID};

-- NOT updated here: fleet_size_band, monthly_volume_band, office lat/lon (auth metadata only)`,
    },
    {
      label: '5) handle_new_user — on auth.users INSERT (trigger)',
      when: 'Same transaction as OAuth user INSERT (may precede step 2 patch)',
      sql: `-- INSERT public.users
INSERT INTO public.users (id, name)
VALUES (:user_id, :display_name)
ON CONFLICT (id) DO NOTHING;

-- INSERT public.profiles (if missing)
INSERT INTO public.profiles (
  id, email, full_name, role, aggregated, asset, company_name, phone
) VALUES (
  :user_id, :email, :display_name, 'user', true, true,
  :company_name_from_metadata, :phone_from_metadata
) ON CONFLICT (id) DO NOTHING;

-- Owner org provision (when role=user AND onboarding_type=owner at INSERT time)
INSERT INTO public.organizations (
  owner_id, name, operating_model,
  address_line, locality, pincode, city, state, zone,
  business_type, employee_count
) VALUES (...from raw_user_meta_data at INSERT...);

INSERT INTO public.organization_members (
  organization_id, user_id, role, status
) VALUES (:org_id, :user_id, 'owner', 'active')
ON CONFLICT (organization_id, user_id) DO UPDATE
  SET status = 'active', role = 'owner';`,
    },
  ],
  notes: [
    'No email/password signUp — session from Google OAuth only',
    'No avatar_seed on Google path (unlike email signUp random seed)',
    'partial_failure if auth_metadata | profile | organization write fails — user still signed in',
    'Web callback: app/auth/callback.tsx also calls applyPendingOAuthMetadata',
    'After success → enterPostAuthBranding (logo / photo / success) same as email owner',
  ],
};
