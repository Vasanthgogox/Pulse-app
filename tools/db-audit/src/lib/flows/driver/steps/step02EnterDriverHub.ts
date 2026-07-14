import type { FlowStep } from '@/lib/flowStep.types';
import { AUTH_UID } from '@/lib/flows/shared/sqlSnippets';

/** Driver · app step 2 — success screen → index boot → driver tab shell. */
export const driverEnterHubSteps: FlowStep[] = [
  {
    id: 'dr-enter-success',
    order: 1,
    label: 'Ready',
    title: 'Driver activation',
    subtitle: 'Success screen · compliance checkpoints',
    route: '/driver-signup (success) → /',
    screen: 'DriverSignupSuccessStep · SignUpWorkspaceReadyCard',
    service: 'clearDriverSignupSuccess · initializeHub',
    phase: 'post-auth',
    queries: [
      {
        label: 'No DB read on success screen',
        when: 'DriverSignupSuccessStep render',
        sql: `-- Checkpoints from local signup state + upload results
-- UI: callsign, doc upload flags — not SELECT profiles on mount`,
      },
      {
        label: 'AsyncStorage flags',
        when: 'clearDriverSignupSuccess on "Go to app"',
        sql: `-- Removes driver signup success / branding keys from AsyncStorage
-- router.replace("/")`,
      },
    ],
    notes: [
      'Go to app → router.replace("/")',
      'Checkpoints: account · docs · photo · trip access',
      'Skipped KYC docs → trip access in_progress until profile upload',
    ],
  },
  {
    id: 'dr-enter-index',
    order: 2,
    label: 'Boot',
    title: 'Index route guard',
    subtitle: 'Redirect driver role away from dispatcher tabs',
    route: '/',
    screen: 'app/index.tsx',
    service: 'claimIndexBootRedirect · DEFAULT_DRIVER_ROUTE',
    phase: 'ui',
    reads: ['profiles.role=driver', 'auth session'],
    queries: [
      {
        label: 'profiles.role (driver gate)',
        when: 'app/index.tsx after session restore',
        sql: `SELECT id, role, aggregated, asset, full_name, email, phone, avatar_url, avatar_seed
FROM public.profiles
WHERE id = ${AUTH_UID};`,
      },
    ],
    routing: [
      { context: 'driver authenticated', track: 'default', nextScreen: '/(driver) dashboard' },
      { context: 'driver signup success flag', track: 'resume', nextScreen: '/driver-signup' },
      {
        context: 'from /driver-sign-in phone session',
        track: 'returning',
        nextScreen: '/(driver) — skips signup success screen',
      },
    ],
    notes: [
      '(tabs)/_layout rejects role=driver → ROUTES.DRIVER_ROOT',
      'Phone sign-in also lands here via router.replace("/") after setSession',
    ],
  },
  {
    id: 'dr-enter-shell',
    order: 3,
    label: 'Shell',
    title: 'Driver tab shell',
    subtitle: 'Dashboard · Trip · History · Transactions',
    route: '/(driver)',
    screen: '(driver)/_layout · DriverTabBar',
    service: 'DriverTripOpsProvider · DriverCommunicationProvider',
    serviceCalls: [
      'consumePendingDriverInviteAfterAuth',
      'hydrateDriverSignupSuccessFlag',
    ],
    phase: 'ui',
    reads: ['driver_profiles', 'profiles', 'trips (assigned)'],
    tables: ['profiles', 'driver_profiles'],
    queries: [
      {
        label: 'Driver profile bootstrap',
        when: '(driver)/_layout mount',
        sql: `SELECT id, role, full_name, phone, avatar_url, avatar_seed
FROM public.profiles
WHERE id = ${AUTH_UID};

SELECT id, user_id, license_number, compliance_status, ...
FROM public.driver_profiles
WHERE user_id = ${AUTH_UID};`,
      },
      {
        label: 'Assigned trips (dashboard)',
        when: 'DriverTripOpsProvider',
        sql: `-- RLS-scoped SELECT on public.trips WHERE driver_id matches roster link
-- May join drivers table linked by trg_auto_link_driver_on_signup`,
      },
    ],
    notes: [
      'Hidden routes: chat, profile, documents, settings, wallet',
      'Roster auto-link via trg_auto_link_driver_on_signup (from signup)',
    ],
  },
];
