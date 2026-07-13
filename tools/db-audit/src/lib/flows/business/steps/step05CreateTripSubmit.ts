import type { FlowBranch } from '@/lib/flowStep.types';
import {
  ASSIGN_AGGREGATE_DRIVER_RPC,
  ASSIGN_DRIVER_BY_PHONE,
  GENERATE_TRIP_OTP,
  LEDGER_ADVANCE_SUPPLIER,
  ORG_RESOLVE_FOR_USER,
  TRIP_INSERT_AGGREGATE,
  TRIP_INSERT_ASSET,
} from '@/lib/flows/shared/sqlSnippets';

/** Submit variants — mirrors add-trip/index.tsx handleComplete branches */
export const businessCreateTripSubmitBranches: FlowBranch[] = [
  {
    id: 'submit-asset-now',
    label: 'Save · asset assigned',
    badge: 'asset',
    summary: 'createTrip with driver_id + vehicle_id · trip_payout_mode=asset',
    steps: [
      {
        id: 'bu-submit-asset-now',
        order: 1,
        label: 'INSERT',
        title: 'createTrip · fleet assigned',
        subtitle: 'handleComplete — non-aggregate path with driver_id + vehicle_id',
        route: '/add-trip',
        screen: 'add-trip/index.tsx handleComplete',
        service: 'trips.service createTrip',
        serviceCalls: ['getDriverOngoingTrip', 'getVehicleOngoingTrip', 'useInvalidateTrips'],
        phase: 'auth',
        tables: ['trips'],
        fieldMappings: [
          { input: 'driver_id', storesTo: 'trips.driver_id (from assetDriver picker)' },
          { input: 'vehicle_id', storesTo: 'trips.vehicle_id (from assetVehicle picker)' },
          { input: 'trip_payout_mode', storesTo: 'asset' },
        ],
        queries: [
          {
            label: 'INSERT trip',
            when: 'Wizard complete · supplySource=asset · assignLater=false',
            sql: `${ORG_RESOLVE_FOR_USER}

${TRIP_INSERT_ASSET}`,
          },
        ],
        routing: [
          { context: 'Success', track: 'default', nextScreen: 'router.replace(/(tabs)/trips)' },
        ],
        notes: ['Conflict: driver or vehicle already on ongoing trip'],
      },
    ],
  },
  {
    id: 'submit-asset-later',
    label: 'Save · asset deferred',
    badge: 'asset',
    summary: 'createTrip without driver_id/vehicle_id — assign from trip detail',
    steps: [
      {
        id: 'bu-submit-asset-later',
        order: 1,
        label: 'INSERT',
        title: 'createTrip · unassigned asset',
        subtitle: 'driver_id and vehicle_id omitted',
        route: '/add-trip',
        screen: 'add-trip/index.tsx handleComplete',
        service: 'trips.service createTrip',
        phase: 'auth',
        tables: ['trips'],
        fieldMappings: [
          { input: 'assignLater', storesTo: 'driver_id NULL · vehicle_id NULL on INSERT' },
          { input: 'trip_payout_mode', storesTo: 'asset' },
        ],
        queries: [
          {
            label: 'INSERT trip',
            when: 'supplySource=asset · assignLater=true',
            sql: `${ORG_RESOLVE_FOR_USER}

${TRIP_INSERT_ASSET}
-- Omit driver_id and vehicle_id columns / use NULL`,
          },
        ],
        routing: [
          { context: 'Then assign', track: 'assign', nextScreen: '/trip/[id]/assignment' },
        ],
      },
    ],
  },
  {
    id: 'submit-aggregate-now',
    label: 'Save · aggregate + phone assign',
    badge: 'aggregate',
    summary: 'createTripWithOtp(skipOtp) → assignTripDriverByPhone → OTP if unlinked',
    steps: [
      {
        id: 'bu-submit-agg-insert',
        order: 1,
        label: 'INSERT',
        title: 'createTripWithOtp · market',
        subtitle: 'supplier_id set · skipOtpGeneration when driverPhone provided',
        route: '/add-trip',
        screen: 'add-trip/index.tsx handleComplete (isAggregate branch)',
        service: 'trips.service createTripWithOtp',
        phase: 'auth',
        tables: ['trips'],
        fieldMappings: [
          { input: 'supplier_id', storesTo: 'trips.supplier_id' },
          { input: 'vehicle_display_number', storesTo: 'trips.vehicle_display_number (optional)' },
          { input: 'trip_payout_mode', storesTo: 'market' },
        ],
        queries: [
          {
            label: 'INSERT aggregate trip',
            when: 'supplySource=aggregate && supplier_id',
            sql: `${ORG_RESOLVE_FOR_USER}

${TRIP_INSERT_AGGREGATE}`,
          },
        ],
      },
      {
        id: 'bu-submit-agg-ledger',
        order: 2,
        label: 'Ledger',
        title: 'Advance ledger entry',
        subtitle: 'When advance_paid > 0',
        route: '/add-trip',
        screen: 'createLedgerEntry',
        service: 'finance createLedgerEntry',
        phase: 'post-auth',
        tables: ['transactions'],
        queries: [
          {
            label: 'Advance OUT to supplier',
            when: 'advance_paid > 0 && supplier_id',
            sql: LEDGER_ADVANCE_SUPPLIER,
          },
        ],
      },
      {
        id: 'bu-submit-agg-phone-assign',
        order: 3,
        label: 'Assign',
        title: 'assignTripDriverByPhone',
        subtitle: 'trackingOnly after INSERT when driverPhone set',
        route: '/add-trip',
        screen: 'assignTripDriverByPhone',
        service: 'trips.service assignTripDriverByPhone',
        serviceCalls: ['ensureDriverRowByPhone', 'updateTripAssignment', 'generateTripOtp'],
        phase: 'post-auth',
        tables: ['trips', 'drivers', 'trip_otp_codes?'],
        fieldMappings: [
          { input: 'driverPhone', storesTo: 'ensureDriverRowByPhone → trips.driver_id' },
        ],
        queries: [
          {
            label: 'Phone assign chain',
            when: 'options.driverPhone after createTripWithOtp',
            sql: ASSIGN_DRIVER_BY_PHONE,
          },
        ],
      },
      {
        id: 'bu-submit-agg-otp-success',
        order: 4,
        label: 'OTP UI',
        title: 'AddTripOtpSuccessBody',
        subtitle: 'Show OTP when driver has no linked user_id',
        route: '/add-trip',
        screen: 'AddTripOtpSuccessBody',
        phase: 'ui',
        reads: ['trip_otp_codes'],
        queries: [
          {
            label: 'OTP display',
            when: 'assignOtp or getTripOtpForDisplay',
            sql: `SELECT code, expires_at FROM public.trip_otp_codes WHERE trip_id = :trip_id;`,
          },
        ],
        routing: [
          { context: 'OTP shown', track: 'otp', nextScreen: 'AddTripOtpSuccessBody' },
          { context: 'Linked driver', track: 'default', nextScreen: 'trips list success' },
        ],
      },
    ],
  },
  {
    id: 'submit-aggregate-later',
    label: 'Save · aggregate deferred',
    badge: 'aggregate',
    summary: 'createTripWithOtp without assignment — optional OTP when fields on form',
    steps: [
      {
        id: 'bu-submit-agg-later-insert',
        order: 1,
        label: 'INSERT',
        title: 'createTripWithOtp · partner only',
        subtitle: 'No driverPhone — no assignTripDriverByPhone on create',
        route: '/add-trip',
        screen: 'add-trip/index.tsx handleComplete',
        service: 'trips.service createTripWithOtp',
        phase: 'auth',
        tables: ['trips'],
        fieldMappings: [
          { input: 'assignLater', storesTo: 'no driver_id · no vehicle_display on create' },
          { input: 'trip_payout_mode', storesTo: 'market' },
        ],
        queries: [
          {
            label: 'INSERT',
            when: 'aggregate + assignLater — hasAssignment=false → no OTP',
            sql: `${ORG_RESOLVE_FOR_USER}

${TRIP_INSERT_AGGREGATE}
-- createTripWithOtp: skip OTP when !hasAssignment`,
          },
        ],
      },
      {
        id: 'bu-submit-agg-later-ledger',
        order: 2,
        label: 'Ledger',
        title: 'Advance entry (optional)',
        subtitle: 'Same as aggregate-now when advance_paid > 0',
        route: '/add-trip',
        service: 'createLedgerEntry',
        phase: 'post-auth',
        tables: ['transactions'],
        queries: [
          {
            label: 'Advance',
            when: 'advance_paid > 0',
            sql: LEDGER_ADVANCE_SUPPLIER,
          },
        ],
      },
    ],
  },
  {
    id: 'submit-aggregate-otp-inline',
    label: 'Save · aggregate + inline OTP',
    badge: 'aggregate',
    summary: 'createTripWithOtp generates OTP when assignment on form (no phone path)',
    steps: [
      {
        id: 'bu-submit-agg-otp-insert',
        order: 1,
        label: 'INSERT',
        title: 'createTripWithOtp · with assignment fields',
        subtitle: 'vehicle_display_number on INSERT triggers OTP generation',
        route: '/add-trip',
        service: 'trips.service createTripWithOtp',
        phase: 'auth',
        tables: ['trips', 'trip_otp_codes'],
        queries: [
          {
            label: 'INSERT + OTP',
            when: 'hasAssignment=true && !skipOtpGeneration',
            sql: `${TRIP_INSERT_AGGREGATE}

${GENERATE_TRIP_OTP}`,
          },
        ],
      },
      {
        id: 'bu-submit-agg-rpc-assign',
        order: 2,
        label: 'RPC assign',
        title: 'assign_aggregate_trip_driver',
        subtitle: 'Post-create reassignment path (also used from trip detail)',
        route: '/trip/[id]/assignment',
        service: 'trips.service assignAggregateTripDriverByPhone',
        phase: 'post-auth',
        queries: [
          {
            label: 'RPC',
            when: 'TripAssignmentBlock aggregate save',
            sql: ASSIGN_AGGREGATE_DRIVER_RPC,
          },
        ],
      },
    ],
  },
];

export function createTripSubmitBranchIds(): string[] {
  return businessCreateTripSubmitBranches.map((b) => b.id);
}

export function createTripSubmitStepCount(): number {
  return businessCreateTripSubmitBranches.reduce((n, b) => n + b.steps.length, 0);
}
