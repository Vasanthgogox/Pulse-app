import type { FlowStep } from '@/lib/flowStep.types';
import {
  ORG_RESOLVE_FOR_USER,
  ORG_VERIFICATION_READ,
  RPC_GET_TRIPS_FOR_ORG,
} from '@/lib/flows/shared/sqlSnippets';

/** Business · app step 3 — dispatcher workspace after tab shell loads. */
export const businessWorkspaceSteps: FlowStep[] = [
  {
    id: 'bu-ws-trips',
    order: 1,
    label: 'Trips',
    title: 'Trips hub',
    subtitle: 'Default landing · Active & History · Add Trip',
    route: '/(tabs)/trips',
    screen: 'TripsScreen · HubScreenShell',
    service: 'trips.service getTripsForOrg',
    serviceCalls: ['useTripsQuery', 'useTripsInfiniteQuery', 'useOpenTripDetail'],
    phase: 'ui',
    reads: ['trips (org-scoped RPC)', 'organization context', 'trip finance summaries'],
    queries: [
      {
        label: 'Org trips list',
        when: 'TripsScreen mount — currentOrganization.id',
        sql: `${ORG_RESOLVE_FOR_USER}

${RPC_GET_TRIPS_FOR_ORG}`,
      },
      {
        label: 'Trip detail (on card tap)',
        when: 'useOpenTripDetail → trip/:id',
        sql: `SELECT * FROM public.trips WHERE id = :trip_id;
-- Plus adjustments, documents, finance rows per tab`,
      },
    ],
    routing: [
      { context: 'Add Trip FAB', track: 'create', nextScreen: 'Module 4 Parties → Module 5 Create trip' },
      { context: 'Trip card tap', track: 'detail', nextScreen: '/trip/[id]' },
    ],
    notes: [
      'First trip: complete module 4 Fleet & party roster before /add-trip',
      'Private Book vs Shared Ledger trip cards',
      'Dock tab: TRIPS (default after signup)',
      'saveLastTabRoute persists return path',
    ],
  },
  {
    id: 'bu-ws-finance',
    order: 2,
    label: 'Fiscal',
    title: 'Cash ledger',
    subtitle: 'Customers · Suppliers · Drivers · Garage · transactions',
    route: '/(tabs)/finance',
    screen: 'FinanceScreen',
    service: 'finance.service',
    serviceCalls: ['preloadFinanceWarmup', 'useAlertRegistryFinanceHandlers'],
    phase: 'ui',
    reads: ['transactions', 'contacts (clients/suppliers/drivers)', 'ledger balances'],
    queries: [
      {
        label: 'Ledger bootstrap',
        when: 'Finance tab mount — org scoped',
        sql: `SELECT * FROM public.transactions
WHERE organization_id = :org_id
ORDER BY transaction_date DESC;

-- Entity lists: clients, suppliers, drivers, vehicles (per finance tabs)`,
      },
    ],
    notes: ['Double-entry model — see docs/CORE_ACCOUNTING_MODEL.md', 'Dock tab: FISCAL'],
  },
  {
    id: 'bu-ws-network',
    order: 3,
    label: 'Network',
    title: 'Connections feed',
    subtitle: 'Marketplace · org connections · hub profile',
    route: '/(tabs)/network',
    screen: 'NetworkScreen · network/hub',
    service: 'network services',
    phase: 'ui',
    reads: ['market_indents', 'connection_requests', 'organizations (peer)'],
    queries: [
      {
        label: 'Network feed',
        when: 'NetworkScreen mount',
        sql: `-- RLS-scoped reads on marketplace / connections tables for :org_id
SELECT * FROM public.market_indents WHERE ...;
-- Hub: /(tabs)/network/hub → org profile tabs`,
      },
    ],
    routing: [
      { context: 'Org hub', track: 'profile', nextScreen: '/(tabs)/network/hub' },
      { context: 'Connection request', track: 'modal', nextScreen: 'BusinessConnectionRequestModal' },
    ],
    notes: ['Re-tap NETWORK while on hub does not downgrade to feed', 'Dock tab: NETWORK'],
  },
  {
    id: 'bu-ws-loads',
    order: 4,
    label: 'Loads',
    title: 'Pulse Load Center',
    subtitle: 'Dock shortcut — indents / load board',
    route: '/pulse-loads',
    screen: 'pulse-loads stack',
    phase: 'ui',
    reads: ['indents', 'market loads'],
    queries: [
      {
        label: 'Load board',
        when: 'DemoTabBar loadCenter → ROUTES.PULSE_LOADS',
        sql: `-- Indent / marketplace load queries (org-scoped)
SELECT * FROM public.indents WHERE organization_id = :org_id;`,
      },
    ],
    notes: ['Not a bottom tab — opened from dock Load Center icon'],
  },
  {
    id: 'bu-ws-drawer',
    order: 5,
    label: 'Drawer',
    title: 'Profile & workspace',
    subtitle: 'Header drawer · org KYC reminder · settings routes',
    route: '/workspace · /account',
    screen: 'Profile drawer · OrgVerificationReminderProvider',
    service: 'useOrgVerificationBannerQuery',
    phase: 'ui',
    reads: ['organizations.verification_status', 'profiles'],
    queries: [
      {
        label: 'KYC reminder eligibility',
        when: 'OrgVerificationReminderProvider — unverified org',
        sql: ORG_VERIFICATION_READ,
      },
      {
        label: 'Workspace hub',
        when: 'Drawer → ROUTES.WORKSPACE',
        sql: `-- Org settings: logo, name, team, invoice branding, KYC panel
SELECT * FROM public.organizations WHERE id = :org_id;
SELECT * FROM public.organization_members WHERE organization_id = :org_id;`,
      },
    ],
    routing: [
      { context: 'Verify CTA', track: 'kyc', nextScreen: '/workspace?panel=kyc' },
      { context: 'My account', track: 'personal', nextScreen: '/account' },
      { context: 'Resources', track: 'more', nextScreen: '/(tabs)/resources' },
    ],
    notes: [
      'OrgVerificationReminderModal when verification_status=unverified',
      'Resources tab: Drivers · Vehicles · More (hidden from main dock)',
    ],
  },
];
