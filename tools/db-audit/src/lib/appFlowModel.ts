import type { FlowAppModule, FlowBranch, FlowStep, PersonaFlow, PersonaId } from '@/lib/flowStep.types';
import { BUSINESS_SIGNUP_FLOW } from '@/lib/flows/business/businessSignUp.flow';
import { DRIVER_SIGNUP_FLOW } from '@/lib/flows/driver/driverSignUp.flow';
import { triggerHandleNewUser } from '@/lib/flows/shared/triggerHandleNewUser';

/** All documented app flows for the Pulse Flow Map visualizer. */
export const APP_FLOWS: PersonaFlow[] = [BUSINESS_SIGNUP_FLOW, DRIVER_SIGNUP_FLOW];

export { triggerHandleNewUser as TRIGGER_STEP };

export type { FlowAppModule, FlowBranch, FlowStep, PersonaFlow, PersonaId };

export function signupModuleId(personaId: PersonaId): string {
  return `module-signup-${personaId}`;
}

export function signupModuleStats(persona: PersonaFlow): FlowAppModule {
  const shared = persona.sharedSteps.length;
  const maxBranch = Math.max(0, ...persona.branches.map((b) => b.steps.length));
  const tail = persona.tailSteps?.length ?? 0;

  return {
    id: signupModuleId(persona.id),
    order: 1,
    label: 'Signup',
    title: persona.id === 'business' ? 'Workspace onboarding' : 'Driver registry',
    summary: persona.description,
    route: persona.route,
    screen: persona.screen,
    variantCount: persona.branches.length,
    stepCount: shared + maxBranch + tail,
  };
}

export function getSignupModuleStep(persona: PersonaFlow): FlowStep {
  const stats = signupModuleStats(persona);
  return {
    id: stats.id,
    order: stats.order,
    label: stats.label,
    title: stats.title,
    subtitle: stats.summary,
    route: stats.route,
    screen: stats.screen,
    phase: 'ui',
    notes: [
      `${stats.stepCount} steps in longest path`,
      persona.id === 'business'
        ? `${stats.variantCount} variants after OTP resolver`
        : 'Single linear path',
      'Expand to inspect individual steps',
    ],
  };
}

export function findStep(stepId: string): FlowStep | undefined {
  for (const persona of APP_FLOWS) {
    if (stepId === signupModuleId(persona.id)) {
      return getSignupModuleStep(persona);
    }
    for (const s of [...persona.sharedSteps, ...(persona.tailSteps ?? [])]) {
      if (s.id === stepId) return s;
    }
    for (const branch of persona.branches) {
      const hit = branch.steps.find((s) => s.id === stepId);
      if (hit) return hit;
    }
  }
  if (stepId === triggerHandleNewUser.id) return triggerHandleNewUser;
  return undefined;
}

export function branchStepCount(branch: FlowBranch): number {
  return branch.steps.length;
}
