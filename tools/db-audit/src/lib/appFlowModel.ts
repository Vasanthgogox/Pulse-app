import type { FlowAppModule, FlowBranch, FlowStep, PersonaFlow, PersonaId } from '@/lib/flowStep.types';
import { businessEnterOperationsSteps } from '@/lib/flows/business/steps/step02EnterOperations';
import { businessWorkspaceSteps } from '@/lib/flows/business/steps/step03WorkspaceOperations';
import { businessFleetPartyRosterBranches, businessFleetPartyRosterSteps, fleetPartyRosterBranchIds, fleetPartyRosterStepCount } from '@/lib/flows/business/steps/step04FleetPartyRoster';
import { businessCreateTripPrefixSteps, businessCreateTripStepCount, businessCreateTripSteps, businessManageTripDetailStep, businessManageTripStepCount, businessManageTripSteps, businessManageTripSuffixSteps } from '@/lib/flows/business/steps/step05TripLifecycle';
import {
  businessCreateTripTracks,
  createTripAssetTrackIds,
  createTripAggregateTrackIds,
  createTripTrackIds,
  DEFAULT_CREATE_TRIP_TRACK_ID,
} from '@/lib/flows/business/steps/step05CreateTripTracks';
import {
  businessManageTripTracks,
  DEFAULT_MANAGE_TRIP_TRACK_ID,
  manageTripTrackIds,
} from '@/lib/flows/business/steps/step05ManageTripTracks';
import { businessGoogleOAuthSignInStep } from '@/lib/flows/business/steps/stepGoogleOAuthSignIn';
import { BUSINESS_SIGNUP_FLOW } from '@/lib/flows/business/businessSignUp.flow';
import { driverEnterHubSteps } from '@/lib/flows/driver/steps/step02EnterDriverHub';
import { driverWorkspaceSteps } from '@/lib/flows/driver/steps/step03DriverOperations';
import { driverTripLifecycleSteps } from '@/lib/flows/driver/steps/step04DriverTripLifecycle';
import { DRIVER_SIGNUP_FLOW } from '@/lib/flows/driver/driverSignUp.flow';
import { triggerHandleNewUser } from '@/lib/flows/shared/triggerHandleNewUser';

/** All documented app flows for the Pulse Flow Map visualizer. */
export const APP_FLOWS: PersonaFlow[] = [BUSINESS_SIGNUP_FLOW, DRIVER_SIGNUP_FLOW];

export { triggerHandleNewUser as TRIGGER_STEP };

export type { FlowAppModule, FlowBranch, FlowStep, PersonaFlow, PersonaId };

export function signupModuleId(personaId: PersonaId): string {
  return `module-signup-${personaId}`;
}

export function enterAppModuleId(personaId: PersonaId): string {
  return `module-enter-app-${personaId}`;
}

export function workspaceModuleId(personaId: PersonaId): string {
  return `module-workspace-${personaId}`;
}

export function fleetPartyRosterModuleId(personaId: PersonaId): string {
  return `module-fleet-roster-${personaId}`;
}

export function createTripModuleId(personaId: PersonaId): string {
  return `module-create-trip-${personaId}`;
}

export function manageTripModuleId(personaId: PersonaId): string {
  return `module-manage-trip-${personaId}`;
}

export function tripLifecycleModuleId(personaId: PersonaId): string {
  return `module-trip-lifecycle-${personaId}`;
}

export function signupModuleStats(persona: PersonaFlow): FlowAppModule {
  const shared = persona.sharedSteps.length;
  const maxBranch = Math.max(0, ...persona.branches.map((b) => b.steps.length));
  const tail = persona.tailSteps?.length ?? 0;

  return {
    id: signupModuleId(persona.id),
    order: 1,
    label: 'Signup',
    title: persona.id === 'business' ? 'Workspace onboarding' : 'Driver registry · phone sign-in',
    summary: persona.description,
    route: persona.route,
    screen: persona.screen,
    kind: 'signup-embed',
    variantCount: persona.branches.length,
    stepCount: shared + maxBranch + tail,
  };
}

export function enterAppModuleStats(persona: PersonaFlow): FlowAppModule {
  const embeddedSteps =
    persona.id === 'business' ? businessEnterOperationsSteps : driverEnterHubSteps;

  return {
    id: enterAppModuleId(persona.id),
    order: 2,
    label: persona.id === 'business' ? 'Operations' : 'Driver hub',
    title: persona.id === 'business' ? 'Enter workspace' : 'Enter driver app',
    summary:
      persona.id === 'business'
        ? 'Activation success → index boot → dispatcher tab shell.'
        : 'Success screen → index boot → driver tab shell.',
    route: persona.id === 'business' ? '/(tabs)/trips' : '/(driver)',
    screen: persona.id === 'business' ? '(tabs)/_layout · DemoTabBar' : '(driver)/_layout · DriverTabBar',
    kind: 'steps',
    variantCount: 0,
    stepCount: embeddedSteps.length,
    embeddedSteps,
    embeddedSectionLabel: 'Post-signup entry path',
  };
}

export function workspaceModuleStats(persona: PersonaFlow): FlowAppModule {
  const embeddedSteps =
    persona.id === 'business' ? businessWorkspaceSteps : driverWorkspaceSteps;

  return {
    id: workspaceModuleId(persona.id),
    order: 3,
    label: persona.id === 'business' ? 'Workspace' : 'Driver ops',
    title: persona.id === 'business' ? 'Dispatcher workspace' : 'Driver daily app',
    summary:
      persona.id === 'business'
        ? 'Trips · Fiscal · Network · Load center · profile drawer.'
        : 'Dashboard · Trip · History · Transactions.',
    route: persona.id === 'business' ? '/(tabs)/trips' : '/(driver)',
    screen: persona.id === 'business' ? 'TripsScreen · FinanceScreen · NetworkScreen' : 'DriverHomeScreen · control · wallet',
    kind: 'steps',
    variantCount: 0,
    stepCount: embeddedSteps.length,
    embeddedSteps,
    embeddedSectionLabel: 'In-app tabs & routes',
  };
}

/** Business only — register parties before Add trip. */
export function fleetPartyRosterModuleStats(persona: PersonaFlow): FlowAppModule | null {
  if (persona.id !== 'business') return null;

  return {
    id: fleetPartyRosterModuleId(persona.id),
    order: 4,
    label: 'Parties',
    title: 'Fleet & party roster',
    summary:
      'Party directory — register customers, suppliers, drivers, and vehicles (offline). Prerequisite for Create trip.',
    route: '/party/customers · /party/suppliers · /party/drivers · /party/vehicles',
    screen: 'PartyDirectoryScreen · AddClientModal · AddSupplierModal · AddDriverModal · AddVehicleModal',
    kind: 'branch-embed',
    variantCount: businessFleetPartyRosterBranches.length,
    stepCount: fleetPartyRosterStepCount(),
    embeddedBranches: businessFleetPartyRosterBranches,
    embeddedSteps: businessFleetPartyRosterSteps,
    embeddedSectionLabel: 'Party types — expand for form steps & DB columns',
  };
}

export { fleetPartyRosterBranchIds };

/** Business · module 5 — /add-trip end-to-end tracks */
export function createTripModuleStats(persona: PersonaFlow): FlowAppModule | null {
  if (persona.id !== 'business') return null;

  return {
    id: createTripModuleId(persona.id),
    order: 5,
    label: 'Create',
    title: 'Create trip',
    summary:
      'Route → load → sale, then one of 4 journeys (allocate + save + exit on the same track).',
    route: '/add-trip',
    screen: 'AddTripModal · AllocationMobileWizardShell · handleComplete',
    kind: 'wizard-embed',
    variantCount: businessCreateTripTracks.length,
    stepCount: businessCreateTripStepCount(),
    embeddedPrefixSteps: businessCreateTripPrefixSteps,
    embeddedTracks: businessCreateTripTracks,
    wizardTrackMode: 'create',
    embeddedSectionLabel: 'Add trip wizard',
  };
}

export {
  createTripTrackIds,
  createTripAssetTrackIds,
  createTripAggregateTrackIds,
  DEFAULT_CREATE_TRIP_TRACK_ID,
};

/** Business · module 6 — trip detail & ops after INSERT */
export function manageTripModuleStats(persona: PersonaFlow): FlowAppModule | null {
  if (persona.id !== 'business') return null;

  return {
    id: manageTripModuleId(persona.id),
    order: 6,
    label: 'Manage',
    title: 'Manage trip',
    summary: 'Trip detail → re-assign track → shared ops & verification.',
    route: '/trip/[id]',
    screen: 'TripDetailScreen · TripAssignmentFlowScreen · operations · verification',
    kind: 'wizard-embed',
    variantCount: businessManageTripTracks.length,
    stepCount: businessManageTripStepCount(),
    embeddedPrefixSteps: [businessManageTripDetailStep],
    embeddedTracks: businessManageTripTracks,
    embeddedSuffixSteps: businessManageTripSuffixSteps,
    wizardTrackMode: 'manage',
    embeddedSectionLabel: 'Open trip lifecycle',
  };
}

export { manageTripTrackIds, DEFAULT_MANAGE_TRIP_TRACK_ID };

/** Driver · module 5 — active trip execution */
export function tripLifecycleModuleStats(persona: PersonaFlow): FlowAppModule | null {
  if (persona.id !== 'business') {
    return {
      id: tripLifecycleModuleId(persona.id),
      order: 5,
      label: 'Trips',
      title: 'Driver trip execution',
      summary: 'Control screen → history · docs · chat.',
      route: '/(driver)/control',
      screen: 'DriverControlScreen · trip-history · chat',
      kind: 'steps',
      variantCount: 0,
      stepCount: driverTripLifecycleSteps.length,
      embeddedSteps: driverTripLifecycleSteps,
      embeddedSectionLabel: 'Trip drill-down',
    };
  }
  return null;
}

export function getAppModules(persona: PersonaFlow): FlowAppModule[] {
  const modules: FlowAppModule[] = [
    signupModuleStats(persona),
    enterAppModuleStats(persona),
    workspaceModuleStats(persona),
  ];
  const roster = fleetPartyRosterModuleStats(persona);
  if (roster) modules.push(roster);
  const createTrip = createTripModuleStats(persona);
  if (createTrip) modules.push(createTrip);
  const manageTrip = manageTripModuleStats(persona);
  if (manageTrip) modules.push(manageTrip);
  const driverTrips = tripLifecycleModuleStats(persona);
  if (driverTrips) modules.push(driverTrips);
  return modules;
}

function moduleOverviewStep(module: FlowAppModule, persona: PersonaFlow): FlowStep {
  return {
    id: module.id,
    order: module.order,
    label: module.label,
    title: module.title,
    subtitle: module.summary,
    route: module.route,
    screen: module.screen,
    phase: 'ui',
    notes: [
      `${module.stepCount} inner steps`,
      module.kind === 'signup-embed' && persona.id === 'business'
        ? `${module.variantCount} signup variants`
        : module.kind === 'signup-embed' && persona.id === 'driver'
          ? `${module.variantCount} paths (signup · phone sign-in)`
          : module.kind === 'branch-embed'
            ? `${module.variantCount} party types`
            : module.variantCount > 0
              ? `${module.variantCount} sections`
              : 'Linear path',
      'Expand module to inspect individual steps',
    ],
  };
}

export function getSignupModuleStep(persona: PersonaFlow): FlowStep {
  return moduleOverviewStep(signupModuleStats(persona), persona);
}

export function getEnterAppModuleStep(persona: PersonaFlow): FlowStep {
  return moduleOverviewStep(enterAppModuleStats(persona), persona);
}

export function getWorkspaceModuleStep(persona: PersonaFlow): FlowStep {
  return moduleOverviewStep(workspaceModuleStats(persona), persona);
}

export function getFleetPartyRosterModuleStep(persona: PersonaFlow): FlowStep {
  return moduleOverviewStep(fleetPartyRosterModuleStats(persona)!, persona);
}

export function getCreateTripModuleStep(persona: PersonaFlow): FlowStep {
  return moduleOverviewStep(createTripModuleStats(persona)!, persona);
}

export function getManageTripModuleStep(persona: PersonaFlow): FlowStep {
  return moduleOverviewStep(manageTripModuleStats(persona)!, persona);
}

export function getTripLifecycleModuleStep(persona: PersonaFlow): FlowStep {
  return moduleOverviewStep(tripLifecycleModuleStats(persona)!, persona);
}

export function findStep(stepId: string): FlowStep | undefined {
  for (const persona of APP_FLOWS) {
    if (stepId === signupModuleId(persona.id)) {
      return getSignupModuleStep(persona);
    }
    if (stepId === enterAppModuleId(persona.id)) {
      return getEnterAppModuleStep(persona);
    }
    if (stepId === workspaceModuleId(persona.id)) {
      return getWorkspaceModuleStep(persona);
    }
    if (persona.id === 'business' && stepId === fleetPartyRosterModuleId(persona.id)) {
      return getFleetPartyRosterModuleStep(persona);
    }
    if (persona.id === 'business' && stepId === createTripModuleId(persona.id)) {
      return getCreateTripModuleStep(persona);
    }
    if (persona.id === 'business' && stepId === manageTripModuleId(persona.id)) {
      return getManageTripModuleStep(persona);
    }
    if (persona.id === 'driver' && stepId === tripLifecycleModuleId(persona.id)) {
      return getTripLifecycleModuleStep(persona);
    }

    const enterSteps =
      persona.id === 'business' ? businessEnterOperationsSteps : driverEnterHubSteps;
    const enterHit = enterSteps.find((s) => s.id === stepId);
    if (enterHit) return enterHit;

    const workspaceSteps =
      persona.id === 'business' ? businessWorkspaceSteps : driverWorkspaceSteps;
    const workspaceHit = workspaceSteps.find((s) => s.id === stepId);
    if (workspaceHit) return workspaceHit;

    if (persona.id === 'business') {
      const rosterHit = businessFleetPartyRosterSteps.find((s) => s.id === stepId);
      if (rosterHit) return rosterHit;
      const createHit = businessCreateTripSteps.find((s) => s.id === stepId);
      if (createHit) return createHit;
      const manageHit = businessManageTripSteps.find((s) => s.id === stepId);
      if (manageHit) return manageHit;
    }

    if (persona.id === 'driver') {
      const tripHit = driverTripLifecycleSteps.find((s) => s.id === stepId);
      if (tripHit) return tripHit;
    }

    for (const s of [...persona.sharedSteps, ...(persona.tailSteps ?? [])]) {
      if (s.id === stepId) return s;
    }
    for (const branch of persona.branches) {
      const hit = branch.steps.find((s) => s.id === stepId);
      if (hit) return hit;
    }
    if (stepId === businessGoogleOAuthSignInStep.id) return businessGoogleOAuthSignInStep;
  }
  if (stepId === triggerHandleNewUser.id) return triggerHandleNewUser;
  return undefined;
}

export function branchStepCount(branch: FlowBranch): number {
  return branch.steps.length;
}

export function allBranchIds(persona: PersonaFlow): string[] {
  return persona.branches.map((b) => b.id);
}

/** Default variant expanded inside signup (owner / driver-main). */
export function defaultExpandedBranchIds(persona: PersonaFlow): string[] {
  const preferred = persona.id === 'business' ? 'owner' : 'driver-main';
  if (persona.branches.some((b) => b.id === preferred)) return [preferred];
  return persona.branches[0] ? [persona.branches[0].id] : [];
}
