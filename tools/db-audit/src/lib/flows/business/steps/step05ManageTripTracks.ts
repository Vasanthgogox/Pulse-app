import type { FlowWizardTrack } from '@/lib/flowStep.types';
import { businessManageTripAssignmentBranches } from './step05ManageTripAssignment';

/** Re-assign paths after opening trip detail */
export const businessManageTripTracks: FlowWizardTrack[] =
  businessManageTripAssignmentBranches.map((branch) => ({
    id: `manage-${branch.id}`,
    label: branch.label,
    badge: branch.badge,
    summary: branch.summary,
    allocationSteps: branch.steps,
    exits: [{ label: 'Back to trip detail', route: '/trip/[id]', context: 'onUpdated' }],
  }));

export const DEFAULT_MANAGE_TRIP_TRACK_ID = 'manage-manage-assign-asset-fleet';

export function manageTripTrackIds(): string[] {
  return businessManageTripTracks.map((t) => t.id);
}

export function manageTripTrackStepCount(): number {
  return businessManageTripTracks.reduce((n, t) => n + t.allocationSteps.length, 0);
}

export function findManageTripTrackForStep(stepId: string): FlowWizardTrack | undefined {
  return businessManageTripTracks.find((t) => t.allocationSteps.some((s) => s.id === stepId));
}
