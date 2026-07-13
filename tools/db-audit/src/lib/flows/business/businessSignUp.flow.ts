import type { FlowBranch, PersonaFlow } from '@/lib/flowStep.types';
import { businessGoogleOAuthSignInStep } from '@/lib/flows/business/steps/stepGoogleOAuthSignIn';
import { businessSignUpStep01PhoneIdentity } from '@/lib/flows/business/steps/step01PhoneIdentity';
import { businessSignUpStep02OtpVerify } from '@/lib/flows/business/steps/step02OtpVerify';
import { GOOGLE_BRANDING_STEP, GOOGLE_WIZARD_STEP } from '@/lib/flows/business/steps/googleSignupSteps';
import { OWNER_SIGNUP_STEPS } from '@/lib/flows/business/steps/ownerSignupSteps';
import {
  TEAM_EXISTING_SIGNUP_STEPS,
  TEAM_NEW_SIGNUP_STEPS,
} from '@/lib/flows/business/steps/teamSignupSteps';
import { triggerHandleNewUser } from '@/lib/flows/shared/triggerHandleNewUser';

const BUSINESS_SHARED = [businessSignUpStep01PhoneIdentity, businessSignUpStep02OtpVerify];

const GOOGLE_OWNER_STEPS = [GOOGLE_WIZARD_STEP, businessGoogleOAuthSignInStep, GOOGLE_BRANDING_STEP];

export const BUSINESS_SIGNUP_FLOW: PersonaFlow = {
  id: 'business',
  label: 'Business user',
  route: '/sign-up · /onboarding/business',
  screen: 'BusinessSignUpScreen',
  description: 'Dispatcher / fleet owner workspace signup with OTP resolver and invite branches.',
  sharedSteps: BUSINESS_SHARED,
  branches: [
    {
      id: 'owner',
      label: 'Owner',
      summary: 'Full 8-step wizard · provisions new org',
      badge: 'default',
      steps: OWNER_SIGNUP_STEPS,
    },
    {
      id: 'team-new',
      label: 'Team invite (new account)',
      summary: 'Member onboarding_type · acceptInvitation',
      badge: 'invite',
      steps: TEAM_NEW_SIGNUP_STEPS,
    },
    {
      id: 'team-existing',
      label: 'Team invite (existing account)',
      summary: 'Sign in then join — no new signup row',
      badge: 'invite',
      steps: TEAM_EXISTING_SIGNUP_STEPS,
    },
    {
      id: 'google-owner',
      label: 'Google OAuth (owner)',
      summary: 'Pending metadata + OAuth session',
      badge: 'oauth',
      steps: GOOGLE_OWNER_STEPS,
    },
  ],
  tailSteps: [triggerHandleNewUser],
};

export function businessBranchStepCount(branch: FlowBranch): number {
  return branch.steps.length;
}
