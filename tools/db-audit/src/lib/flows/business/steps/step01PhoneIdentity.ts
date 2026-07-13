import type { FlowStep } from '@/lib/flowStep.types';

/** Business sign-up · step 1 — phone entry and exists check. */
export const businessSignUpStep01PhoneIdentity: FlowStep = {
  id: 'bu-phone',
  order: 1,
  label: 'Phone',
  title: 'Identity',
  subtitle: 'Verify mobile to begin workspace provisioning',
  route: '/sign-up · /onboarding/business',
  screen: 'PhoneStep · BusinessSignUpScreen',
  service: 'checkExistingUserByPhone',
  phase: 'ui',
  fields: ['phone (10-digit India)'],
  reads: ['profiles (phone lookup — exists, email, masked_email)'],
  notes: ['Debounced phone-exists check; pre-fills email if account found'],
};
