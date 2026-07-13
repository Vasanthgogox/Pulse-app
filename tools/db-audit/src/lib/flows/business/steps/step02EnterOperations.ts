import type { FlowStep } from '@/lib/flowStep.types';

const AUTH_UID = 'auth.uid() /* session user id */';

/** Business · app step 2 — activation → index boot → dispatcher tab shell. */
export const businessEnterOperationsSteps: FlowStep[] = [
  {
    id: 'bu-enter-activation',
    order: 1,
    label: 'Ready',
    title: 'Workspace activation',
    subtitle: 'Success screen after signup · clear branding flag',
    route: '/sign-up (step 8) → /(tabs)/trips',
    screen: 'SuccessStep · SignUpWorkspaceReadyCard',
    service: 'finishBusinessSignup · clearBusinessSignupBranding',
    phase: 'post-auth',
    reads: [
      'UI: flow.orgName (wizard state — not SELECT on step 8 render)',
      'UI: profilePreviewUri | profileAvatarSeed (local / preset — not SELECT for preview)',
      'DB (steps 6–7): resolveProvisionedOrgId → getOrganizationsForUser',
      'DB (optional): refreshSession after persistProfilePhoto → profiles by id',
    ],
    queries: [
      {
        label: 'organizations.name (provisioned org — steps 6–7)',
        when: 'resolveProvisionedOrgId after signUp session exists',
        sql: `-- PostgREST (organization.service getOrganizationsForUser)
-- 1) Memberships
SELECT organization_id, role, status
FROM public.organization_members
WHERE user_id = ${AUTH_UID}
  AND status = 'active';

-- 2) Org rows (match wizard name in app code)
SELECT id, name, slug, owner_id, operating_model, logo_url
FROM public.organizations
WHERE id IN (
  SELECT organization_id FROM public.organization_members
  WHERE user_id = ${AUTH_UID} AND status = 'active'
);

-- Fallback RPC (same session)
SELECT * FROM public.get_organizations_for_user();

-- Equivalent: pick row whose name matches signup orgName
SELECT o.id, o.name
FROM public.organization_members om
JOIN public.organizations o ON o.id = om.organization_id
WHERE om.user_id = ${AUTH_UID}
  AND om.status = 'active'
  AND lower(btrim(o.name)) = lower(btrim(:org_name_from_wizard))
LIMIT 1;`,
      },
      {
        label: 'profiles avatar (after photo step — not SuccessStep preview)',
        when: 'persistProfilePhoto → refreshSession (if session exists)',
        sql: `-- Write (step 7 ProfilePhotoStep)
UPDATE public.profiles
SET avatar_url = :path_or_null,
    avatar_seed = :seed_or_null
WHERE id = ${AUTH_UID};

-- Read merge (auth.service refreshSession)
SELECT *
FROM public.profiles
WHERE id = ${AUTH_UID};

-- Auth metadata merge (parallel, not SQL in public schema)
-- supabase.auth.getUser() → user.user_metadata.avatar_url | avatar_seed`,
      },
    ],
    notes: [
      'SuccessStep shows flow.orgName from form state — same string sent as companyName on signUp',
      'Card avatar uses local profilePreviewUri or USER_2D_AVATARS[profileAvatarSeed]',
      'Team invite path skips step 8 — router.replace TRIPS after acceptInvitation',
      'Email verification path: resend link · operational access pending',
    ],
  },
  {
    id: 'bu-enter-index',
    order: 2,
    label: 'Boot',
    title: 'Index route guard',
    subtitle: 'app/index.tsx resolves session + last tab',
    route: '/',
    screen: 'app/index.tsx',
    service: 'getLastTabRoute · preloadTabForRoute · claimIndexBootRedirect',
    phase: 'ui',
    reads: [
      'auth session (useAuth)',
      'profiles.role (must be user, not driver)',
      'AsyncStorage last tab route',
    ],
    queries: [
      {
        label: 'profiles.role (dispatcher gate)',
        when: 'app/index.tsx after session restore',
        sql: `SELECT id, role, aggregated, asset, full_name, email, phone, avatar_url, avatar_seed
FROM public.profiles
WHERE id = ${AUTH_UID};`,
      },
    ],
    routing: [
      { context: 'authenticated dispatcher', track: 'default', nextScreen: 'last tab or /(tabs)/trips' },
      { context: 'business signup branding flag', track: 'resume', nextScreen: '/onboarding/business' },
    ],
    notes: ['Blocks redirect while businessSignupBranding or driver success flags active'],
  },
  {
    id: 'bu-enter-tabs',
    order: 3,
    label: 'Shell',
    title: 'Dispatcher tab shell',
    subtitle: 'Fiscal · Trips · Network dock + workspace drawer',
    route: '/(tabs)',
    screen: '(tabs)/_layout · DemoTabBar',
    service: 'OrganizationContext · OrgVerificationReminderProvider',
    serviceCalls: [
      'preloadTabScreen (trips, finance, network)',
      'preloadFinanceWarmup',
      'preloadChatRoute',
      'scheduleDispatcherTabPreloads',
    ],
    phase: 'ui',
    reads: [
      'organization_members (current org)',
      'organizations',
      'profiles (aggregated / asset flags)',
    ],
    queries: [
      {
        label: 'OrganizationContext bootstrap',
        when: '(tabs)/_layout mount — same as getOrganizationsForUser',
        sql: `SELECT organization_id, role, status
FROM public.organization_members
WHERE user_id = ${AUTH_UID}
  AND status = 'active';

SELECT id, name, slug, owner_id, operating_model, logo_url
FROM public.organizations
WHERE id IN (
  SELECT organization_id FROM public.organization_members
  WHERE user_id = ${AUTH_UID} AND status = 'active'
);`,
      },
    ],
    tables: ['organization_members', 'organizations', 'profiles'],
    notes: [
      'Default landing: Trips tab',
      'Load center via ROUTES.PULSE_LOADS from dock',
      'Profile drawer → ROUTES.WORKSPACE',
    ],
  },
];
