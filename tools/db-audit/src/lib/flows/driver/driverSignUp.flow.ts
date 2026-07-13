import type { PersonaFlow } from '@/lib/flowStep.types';
import { DRIVER_SIGNUP_STEPS } from '@/lib/flows/driver/steps/driverSignupSteps';
import { triggerHandleNewUser } from '@/lib/flows/shared/triggerHandleNewUser';

export const DRIVER_SIGNUP_FLOW: PersonaFlow = {
  id: 'driver',
  label: 'Driver',
  route: '/driver-signup · /onboarding/driver',
  screen: 'driver-signup.tsx',
  description: 'Driver persona — KYC docs, no organization provisioning.',
  sharedSteps: [],
  branches: [
    { id: 'driver-main', label: 'Driver signup', summary: 'Single linear path', steps: DRIVER_SIGNUP_STEPS },
  ],
  tailSteps: [triggerHandleNewUser],
};
