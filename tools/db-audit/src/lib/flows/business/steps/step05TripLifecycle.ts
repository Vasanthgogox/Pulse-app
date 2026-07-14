import type { FlowStep } from '@/lib/flowStep.types';
import {
  TRIP_DETAIL_READ,
  TRIP_STATUS_UPDATE,
} from '@/lib/flows/shared/sqlSnippets';
import {
  businessCreateTripAllocationBranches,
} from './step05CreateTripAllocation';
import {
  businessCreateTripSubmitBranches,
} from './step05CreateTripSubmit';
import {
  businessCreateTripTracks,
  createTripTrackStepCount,
} from './step05CreateTripTracks';
import {
  businessManageTripAssignmentBranches,
} from './step05ManageTripAssignment';
import { businessManageTripTracks, manageTripTrackStepCount } from './step05ManageTripTracks';

/** Wizard steps 1–3 before allocation branches */
export const businessCreateTripPrefixSteps: FlowStep[] = [
  {
    id: 'bu-trip-wiz-route',
    order: 1,
    label: 'Route',
    title: 'Route',
    subtitle: 'Pickup, drop, trip date',
    route: '/add-trip',
    screen: 'AddTripModal · addTripWizardSteps route',
    phase: 'ui',
    fields: ['pickup', 'drop', 'tripDate'],
    queries: [
      {
        label: 'No DB write',
        when: 'Wizard step 1 — form state only',
        sql: '-- LocationSearchField geocode → lat/lon in state',
      },
    ],
  },
  {
    id: 'bu-trip-wiz-commodity',
    order: 2,
    label: 'Load',
    title: 'Commodity & client',
    subtitle: 'Vehicle type, load, weight, billing client',
    route: '/add-trip',
    screen: 'TripCommodityFields · TripClientPickerSection',
    phase: 'ui',
    fields: ['vehicleType', 'loadType', 'tons', 'client'],
    reads: ['clients (from Fleet & party roster module)'],
    queries: [
      {
        label: 'Client picker',
        when: 'Requires customers registered in party roster',
        sql: `SELECT id, name, phone FROM public.clients WHERE organization_id = :org_id;`,
      },
    ],
    notes: ['Merged step: commodity + client'],
  },
  {
    id: 'bu-trip-wiz-sale',
    order: 3,
    label: 'Sale',
    title: 'Sale value',
    subtitle: 'Client sale amount (client_price)',
    route: '/add-trip',
    screen: 'ClientSaleKeypadFlow',
    phase: 'ui',
    fields: ['clientPrice'],
    queries: [
      {
        label: 'No DB write',
        when: 'Form state until submit step',
        sql: '-- client_price → trips.client_price on INSERT',
      },
    ],
  },
];

const manageTripSuffixSteps: FlowStep[] = [
  {
    id: 'bu-trip-ops',
    order: 1,
    label: 'Ops',
    title: 'Trip operations',
    subtitle: 'Fuel · toll · other · expenses',
    route: '/trip/[id]/operations/*',
    screen: 'operations launcher',
    service: 'useTripOperationsSync',
    phase: 'post-auth',
    tables: ['trip_operations', 'transactions?'],
    queries: [
      {
        label: 'Record operation',
        when: 'Save fuel/toll/other',
        sql: `INSERT INTO public.trip_operations (
  trip_id,
  organization_id,
  operation_type,
  amount,
  notes,
  created_by
) VALUES (
  :trip_id,
  :org_id,
  :operation_type,
  :amount,
  :notes,
  :created_by
);`,
      },
    ],
  },
  {
    id: 'bu-trip-verify',
    order: 2,
    label: 'Verify',
    title: 'Verification',
    subtitle: 'POD / LR verification',
    route: '/trip/[id]/verification',
    screen: 'trip/[id]/verification',
    service: 'useTripVerificationSync',
    phase: 'post-auth',
    tables: ['trip_documents', 'trips'],
    queries: [
      {
        label: 'Complete verification',
        when: 'Confirm POD/LR',
        sql: TRIP_STATUS_UPDATE,
      },
    ],
    notes: ['Returns to Trips hub Active/History'],
  },
];

export const businessManageTripDetailStep: FlowStep = {
  id: 'bu-trip-detail',
  order: 1,
  label: 'Detail',
  title: 'Trip detail',
  subtitle: 'Tabs: Trip · Finance · Expenses · Docs',
  route: '/trip/[id]',
  screen: 'TripDetailScreen',
  service: 'useTripDetail · getTripById',
  phase: 'ui',
  reads: ['trips', 'trip_adjustments', 'transactions', 'trip_documents'],
  queries: [
    {
      label: 'Trip bootstrap',
      when: 'Trip card tap from Trips hub',
      sql: TRIP_DETAIL_READ,
    },
  ],
  routing: [
    { context: 'Assignment', track: 'assign', nextScreen: '/trip/[id]/assignment' },
    { context: 'Operations', track: 'ops', nextScreen: '/trip/[id]/operations/launcher' },
    { context: 'Verification', track: 'verify', nextScreen: '/trip/[id]/verification' },
  ],
};

export {
  businessCreateTripAllocationBranches,
  businessCreateTripSubmitBranches,
  businessCreateTripTracks,
  businessManageTripAssignmentBranches,
  businessManageTripTracks,
};

function flattenTrackSteps(tracks: typeof businessCreateTripTracks): FlowStep[] {
  const out: FlowStep[] = [];
  for (const t of tracks) {
    out.push(...t.allocationSteps);
    if (t.submitSteps) out.push(...t.submitSteps);
    for (const f of t.submitForks ?? []) out.push(...f.steps);
    if (t.lifecycleSteps) out.push(...t.lifecycleSteps);
  }
  return out;
}

export function businessCreateTripStepCount(): number {
  return businessCreateTripPrefixSteps.length + createTripTrackStepCount();
}

export function businessManageTripStepCount(): number {
  return 1 + manageTripTrackStepCount() + manageTripSuffixSteps.length;
}

/** Flat list for findStep — includes all track steps */
export const businessCreateTripSteps: FlowStep[] = [
  ...businessCreateTripPrefixSteps,
  ...flattenTrackSteps(businessCreateTripTracks),
];

export const businessManageTripSteps: FlowStep[] = [
  businessManageTripDetailStep,
  ...flattenTrackSteps(businessManageTripTracks),
  ...manageTripSuffixSteps,
];

export const businessManageTripSuffixSteps = manageTripSuffixSteps;

/** @deprecated Use businessCreateTripPrefixSteps + allocation/submit branches */
export const businessTripWizardSteps = businessCreateTripSteps;

/** @deprecated */
export const businessTripPostCreateSteps = businessManageTripSteps;

/** @deprecated */
export const businessTripLifecycleGroups = [
  {
    id: 'wizard',
    label: 'Create trip',
    summary: '/add-trip — route → load → sale → allocation variants → submit variants',
    steps: businessCreateTripSteps,
  },
  {
    id: 'post',
    label: 'Manage trip',
    summary: 'Trip detail · assignment variants · operations · verification',
    steps: businessManageTripSteps,
  },
] as const;

export const businessTripLifecycleSteps: FlowStep[] = [
  ...businessCreateTripSteps,
  ...businessManageTripSteps,
];
