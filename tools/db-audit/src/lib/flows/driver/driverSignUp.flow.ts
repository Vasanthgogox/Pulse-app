import type { PersonaFlow } from '@/lib/flowStep.types';
import { DRIVER_PHONE_SIGNIN_STEPS } from '@/lib/flows/driver/steps/driverPhoneSignInSteps';
import { DRIVER_SIGNUP_STEPS } from '@/lib/flows/driver/steps/driverSignupSteps';
import { triggerHandleNewUser } from '@/lib/flows/shared/triggerHandleNewUser';

export const DRIVER_SIGNUP_FLOW: PersonaFlow = {
  id: 'driver',
  label: 'Driver',
  route: '/driver-signup · /driver-sign-in · /onboarding/driver',
  screen: 'driver-signup.tsx · driver-sign-in.tsx',
  description:
    'Driver persona — registry signup (KYC, no org) or returning phone sign-in (edge magic-link / SMS link).',
  sharedSteps: [],
  branches: [
    {
      id: 'driver-main',
      label: 'Driver signup',
      summary: 'Phone → OTP → account → KYC → signUp',
      badge: 'default',
      steps: DRIVER_SIGNUP_STEPS,
    },
    {
      id: 'driver-phone-signin',
      label: 'Phone sign-in',
      summary: 'Existing account · phone → UI OTP → edge session (no password)',
      badge: 'signin',
      steps: DRIVER_PHONE_SIGNIN_STEPS,
    },
  ],
  tailSteps: [triggerHandleNewUser],
};
