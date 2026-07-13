import type { FlowStep } from '@/lib/flowStep.types';
import { AUTH_UID, DRIVER_ASSIGNED_TRIPS } from '@/lib/flows/shared/sqlSnippets';

/** Driver · app step 3 — daily driver app after tab shell. */
export const driverWorkspaceSteps: FlowStep[] = [
  {
    id: 'dr-ops-dashboard',
    order: 1,
    label: 'Home',
    title: 'Driver dashboard',
    subtitle: 'Compliance checkpoints · assigned trip summary',
    route: '/(driver)',
    screen: 'DriverHomeScreen · (driver)/index',
    service: 'DriverTripOpsProvider',
    phase: 'ui',
    reads: ['driver_profiles', 'profiles', 'trips (assigned)', 'pending invites'],
    queries: [
      {
        label: 'Driver bootstrap',
        when: '(driver)/_layout mount',
        sql: `SELECT id, role, full_name, phone, avatar_url
FROM public.profiles WHERE id = ${AUTH_UID};

SELECT * FROM public.driver_profiles WHERE user_id = ${AUTH_UID};`,
      },
      {
        label: 'Pending roster invite',
        when: 'consumePendingDriverInviteAfterAuth',
        sql: `-- Deep link / AsyncStorage invite token → link driver roster row`,
      },
    ],
    notes: ['Default tab after index redirect', 'Trip access gated on KYC if docs skipped'],
  },
  {
    id: 'dr-ops-trip',
    order: 2,
    label: 'Trip',
    title: 'Active trip control',
    subtitle: 'Ongoing trip ops · status updates · chat',
    route: '/(driver)/control',
    screen: '(driver)/control',
    service: 'DriverTripOpsContext',
    phase: 'ui',
    reads: ['trips', 'trip_events', 'driver location'],
    queries: [
      {
        label: 'Ongoing trip',
        when: 'Driver trip tab / control screen',
        sql: `${DRIVER_ASSIGNED_TRIPS}
-- Filter status IN (assigned, in_transit, ...) for active leg`,
      },
      {
        label: 'Trip chat',
        when: 'Hidden route /(driver)/chat',
        sql: `-- Trip-scoped chat messages (realtime)`,
      },
    ],
    routing: [
      { context: 'No active trip', track: 'empty', nextScreen: 'dashboard CTA' },
      { context: 'Trip chat', track: 'hidden', nextScreen: '/(driver)/chat' },
    ],
    notes: ['Hidden from tab bar when no trip — href in DriverTabBar config'],
  },
  {
    id: 'dr-ops-history',
    order: 3,
    label: 'History',
    title: 'Trip history',
    subtitle: 'Completed legs · trip detail drill-down',
    route: '/(driver)/trip-history',
    screen: '(driver)/trip-history/index',
    phase: 'ui',
    reads: ['trips (completed)', 'trip settlements'],
    queries: [
      {
        label: 'History list',
        when: 'trip-history tab',
        sql: `${DRIVER_ASSIGNED_TRIPS}
-- WHERE status IN (completed, cancelled, ...)`,
      },
      {
        label: 'Trip detail',
        when: '/(driver)/trip-history/[tripId]',
        sql: `SELECT * FROM public.trips WHERE id = :trip_id AND driver_id = :driver_id;`,
      },
    ],
    notes: ['DriverTabBar: History tab'],
  },
  {
    id: 'dr-ops-wallet',
    order: 4,
    label: 'Earnings',
    title: 'Transactions & wallet',
    subtitle: 'Passbook · salary requests · pending earnings',
    route: '/(driver)/wallet',
    screen: '(driver)/wallet · passbook · salary-request',
    phase: 'ui',
    reads: ['driver_earnings', 'transactions', 'salary_requests'],
    queries: [
      {
        label: 'Wallet / passbook',
        when: 'Transactions tab',
        sql: `-- Org-scoped driver ledger rows
SELECT * FROM public.transactions
WHERE driver_id = :driver_id AND organization_id = :org_id;`,
      },
    ],
    routing: [
      { context: 'Passbook', track: 'hidden', nextScreen: '/(driver)/passbook/[orgId]' },
      { context: 'Salary request', track: 'hidden', nextScreen: '/(driver)/salary-request' },
      { context: 'Documents', track: 'hidden', nextScreen: '/(driver)/documents' },
    ],
    notes: [
      'Hidden routes: profile, settings, notifications, documents',
      'DriverTabBar label: Transactions',
    ],
  },
];
