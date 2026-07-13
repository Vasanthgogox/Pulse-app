import type { FlowWizardTrack } from '@/lib/flowStep.types';
import { businessCreateTripAllocationBranches } from './step05CreateTripAllocation';
import { businessCreateTripSubmitBranches } from './step05CreateTripSubmit';

function allocSteps(branchId: string) {
  return businessCreateTripAllocationBranches.find((b) => b.id === branchId)?.steps ?? [];
}

function submitSteps(branchId: string) {
  return businessCreateTripSubmitBranches.find((b) => b.id === branchId)?.steps ?? [];
}

/** Four end-to-end Create trip journeys after Route → Load → Sale */
export const businessCreateTripTracks: FlowWizardTrack[] = [
  {
    id: 'track-asset-now',
    label: 'Asset · assign now',
    badge: 'asset',
    summary: 'Fleet driver + vehicle on supply → createTrip → Trips list',
    allocationSteps: allocSteps('alloc-asset-now'),
    submitSteps: submitSteps('submit-asset-now'),
    exits: [{ label: 'Trips list', route: '/(tabs)/trips', context: 'Success' }],
  },
  {
    id: 'track-asset-later',
    label: 'Asset · assign later',
    badge: 'asset',
    summary: 'Assign later ON → createTrip without driver/vehicle → assign on trip detail',
    allocationSteps: allocSteps('alloc-asset-later'),
    submitSteps: submitSteps('submit-asset-later'),
    exits: [
      {
        label: 'Trip assignment',
        route: '/trip/[id]/assignment',
        context: 'Then assign fleet driver + vehicle',
      },
    ],
  },
  {
    id: 'track-aggregate-now',
    label: 'Aggregate · assign now',
    badge: 'aggregate',
    summary: 'Partner + rates + phone/name/vehicle → createTripWithOtp → phone assign or OTP',
    allocationSteps: allocSteps('alloc-aggregate-now'),
    submitSteps: submitSteps('submit-aggregate-now'),
    submitForks: [
      {
        id: 'fork-aggregate-inline-otp',
        label: 'Alternate save: inline OTP on INSERT',
        summary: 'When assignment fields on form without phone-assign path',
        steps: submitSteps('submit-aggregate-otp-inline'),
        exits: [{ label: 'OTP or trip detail', route: '/add-trip · /trip/[id]/assignment' }],
      },
    ],
    exits: [
      { label: 'Trips list', route: '/(tabs)/trips', context: 'Linked driver' },
      { label: 'OTP success', route: 'AddTripOtpSuccessBody', context: 'Unlinked driver' },
    ],
  },
  {
    id: 'track-aggregate-later',
    label: 'Aggregate · assign later',
    badge: 'aggregate',
    summary: 'Partner + rates only → createTripWithOtp → assign on trip detail',
    allocationSteps: allocSteps('alloc-aggregate-later'),
    submitSteps: submitSteps('submit-aggregate-later'),
    exits: [
      {
        label: 'Trip assignment',
        route: '/trip/[id]/assignment',
        context: 'TripPhoneAssignmentWizard',
      },
    ],
  },
];

export const DEFAULT_CREATE_TRIP_TRACK_ID = 'track-asset-now';

export function createTripTrackIds(): string[] {
  return businessCreateTripTracks.map((t) => t.id);
}

export function createTripTrackStepCount(): number {
  return businessCreateTripTracks.reduce((n, t) => {
    const forkSteps = (t.submitForks ?? []).reduce((fn, f) => fn + f.steps.length, 0);
    return n + t.allocationSteps.length + (t.submitSteps?.length ?? 0) + forkSteps;
  }, 0);
}

export function createTripAssetTrackIds(): string[] {
  return businessCreateTripTracks.filter((t) => t.badge === 'asset').map((t) => t.id);
}

export function createTripAggregateTrackIds(): string[] {
  return businessCreateTripTracks.filter((t) => t.badge === 'aggregate').map((t) => t.id);
}

export function findCreateTripTrackForStep(stepId: string): FlowWizardTrack | undefined {
  return businessCreateTripTracks.find(
    (t) =>
      t.allocationSteps.some((s) => s.id === stepId) ||
      t.submitSteps?.some((s) => s.id === stepId) ||
      t.submitForks?.some((f) => f.steps.some((s) => s.id === stepId)),
  );
}
