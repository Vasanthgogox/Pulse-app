import type { FlowBranch } from '@/lib/flowStep.types';
import {
  ASSIGN_AGGREGATE_DRIVER_RPC,
  ASSIGN_DRIVER_BY_PHONE,
  GENERATE_TRIP_OTP,
  UPDATE_TRIP_ASSIGNMENT,
} from '@/lib/flows/shared/sqlSnippets';

/** Post-create assignment — TripAssignmentFlowScreen · TripAssignmentBlock variants */
export const businessManageTripAssignmentBranches: FlowBranch[] = [
  {
    id: 'manage-assign-asset-fleet',
    label: 'Asset · fleet picker',
    badge: 'asset',
    summary: 'TripAssignmentFlowScreen — driver step → vehicle step · updateTripAssignment',
    steps: [
      {
        id: 'bu-manage-asset-driver',
        order: 1,
        label: 'Driver',
        title: 'Re-assign fleet driver',
        subtitle: 'FleetEntityPickerModal or roster list',
        route: '/trip/[id]/assignment',
        screen: 'TripAssignmentFlowScreen · fleetStep=driver',
        phase: 'post-auth',
        reads: ['drivers', 'getActiveDriverIds'],
        fieldMappings: [{ input: 'driver_id', storesTo: 'trips.driver_id' }],
        queries: [
          {
            label: 'Roster read',
            when: 'Assignment flow open',
            sql: `SELECT id, name, phone FROM public.drivers
WHERE organization_id = :org_id AND left_at IS NULL;`,
          },
        ],
      },
      {
        id: 'bu-manage-asset-vehicle',
        order: 2,
        label: 'Vehicle',
        title: 'Re-assign fleet vehicle',
        subtitle: 'After driver saved → fleetStep=vehicle',
        route: '/trip/[id]/assignment',
        screen: 'TripAssignmentFlowScreen · fleetStep=vehicle',
        phase: 'post-auth',
        reads: ['vehicles'],
        fieldMappings: [{ input: 'vehicle_id', storesTo: 'trips.vehicle_id' }],
        queries: [
          {
            label: 'UPDATE assignment',
            when: 'Save on vehicle step',
            sql: UPDATE_TRIP_ASSIGNMENT,
          },
        ],
        notes: ['Blocked when isTripCompleted or !canAssign'],
      },
    ],
  },
  {
    id: 'manage-assign-aggregate-phone',
    label: 'Aggregate · phone wizard',
    badge: 'aggregate',
    summary: 'TripPhoneAssignmentWizard · assignAggregateTripDriverByPhone',
    steps: [
      {
        id: 'bu-manage-agg-phone-entry',
        order: 1,
        label: 'Phone',
        title: 'Driver phone entry',
        subtitle: 'TripPhoneAssignmentWizard · validatePhone',
        route: '/trip/[id]/assignment',
        screen: 'TripPhoneAssignmentWizard',
        phase: 'ui',
        reads: ['getDriverAvailabilityByPhoneGlobal'],
        fieldMappings: [
          { input: 'phone', storesTo: 'normalized → assign_aggregate_trip_driver p_driver_phone' },
        ],
        queries: [
          {
            label: 'Availability',
            when: 'Before save',
            sql: `-- getDriverAvailabilityByPhoneGlobal(excludeTripId, anyOpenTripBlocks=true)`,
          },
        ],
      },
      {
        id: 'bu-manage-agg-phone-meta',
        order: 2,
        label: 'Meta',
        title: 'Driver name & vehicle',
        subtitle: 'Optional p_driver_name · p_vehicle_display_number · p_vehicle_id',
        route: '/trip/[id]/assignment',
        screen: 'TripAssignmentBlock · assignAggregateMeta',
        phase: 'ui',
        fieldMappings: [
          { input: 'driverName', storesTo: 'p_driver_name RPC arg' },
          { input: 'vehicleDisplayNumber', storesTo: 'trips.vehicle_display_number' },
          { input: 'fleetVehicleId', storesTo: 'p_vehicle_id (optional fleet vehicle)' },
        ],
        queries: [
          {
            label: 'RPC assign',
            when: 'Save aggregate assignment',
            sql: ASSIGN_AGGREGATE_DRIVER_RPC,
          },
        ],
      },
    ],
  },
  {
    id: 'manage-assign-phone-fallback',
    label: 'Phone assign · fallback',
    badge: 'shared',
    summary: 'assignTripDriverByPhone when RPC stale or missing columns',
    steps: [
      {
        id: 'bu-manage-phone-fallback',
        order: 1,
        label: 'Fallback',
        title: 'assignTripDriverByPhone',
        subtitle: 'RPC error → trackingOnly + forceOtpClaim',
        route: '/trip/[id]/assignment',
        screen: 'TripAssignmentBlock',
        service: 'trips.service assignTripDriverByPhone',
        serviceCalls: ['ensureDriverRowByPhone', 'updateTripAssignment'],
        phase: 'post-auth',
        tables: ['trips', 'drivers'],
        queries: [
          {
            label: 'Fallback chain',
            when: 'assignAggregateTripDriverByPhone RPC signature mismatch',
            sql: `${ASSIGN_DRIVER_BY_PHONE}

${UPDATE_TRIP_ASSIGNMENT}
-- vehicle_display_number updated in separate updateTripAssignment call`,
          },
        ],
      },
    ],
  },
  {
    id: 'manage-assign-otp',
    label: 'OTP claim',
    badge: 'otp',
    summary: 'generateTripOtp · regenerateTripOtp · driver app claim',
    steps: [
      {
        id: 'bu-manage-otp-generate',
        order: 1,
        label: 'Generate',
        title: 'Trip OTP for unlinked driver',
        subtitle: 'When driver row has no user_id',
        route: '/trip/[id]/assignment',
        screen: 'TripAssignmentBlock · OTP display',
        service: 'tripOtp.service generateTripOtp',
        phase: 'post-auth',
        tables: ['trip_otp_codes'],
        queries: [
          {
            label: 'INSERT OTP',
            when: 'assignTripDriverByPhone returns otp or manual regenerate',
            sql: GENERATE_TRIP_OTP,
          },
        ],
      },
      {
        id: 'bu-manage-otp-claim',
        order: 2,
        label: 'Claim',
        title: 'Driver app OTP entry',
        subtitle: 'Driver persona — claim trip with code',
        route: '/driver/trip-claim',
        screen: 'Driver OTP claim flow',
        phase: 'auth',
        reads: ['trip_otp_codes', 'trips'],
        queries: [
          {
            label: 'Validate OTP',
            when: 'Driver enters code in mobile app',
            sql: `SELECT trip_id, code, expires_at
FROM public.trip_otp_codes
WHERE trip_id = :trip_id AND code = :code AND expires_at > now();

UPDATE public.trips
SET driver_id = :claimed_driver_id
WHERE id = :trip_id;`,
          },
        ],
        routing: [
          { context: 'Driver linked', track: 'claim', nextScreen: 'Driver trip hub' },
        ],
      },
    ],
  },
];

export function manageTripAssignmentBranchIds(): string[] {
  return businessManageTripAssignmentBranches.map((b) => b.id);
}

export function manageTripAssignmentStepCount(): number {
  return businessManageTripAssignmentBranches.reduce((n, b) => n + b.steps.length, 0);
}
