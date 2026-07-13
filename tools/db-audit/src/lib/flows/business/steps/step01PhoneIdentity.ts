import type { FlowStep } from '@/lib/flowStep.types';
import { RPC_GET_EMAIL_BY_PHONE } from '@/lib/flows/shared/sqlSnippets';

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
  reads: ['profiles.email via get_email_by_phone RPC'],
  queries: [
    {
      label: 'Phone → email lookup',
      when: 'Debounced on phone change + continuePhone',
      sql: RPC_GET_EMAIL_BY_PHONE,
    },
  ],
  notes: ['Pre-fills email if account found; redirects existing users to sign-in'],
};
