import type { FlowStep } from '@/lib/flowStep.types';
import { OWNER_SIGNUP_STEPS } from '@/lib/flows/business/steps/ownerSignupSteps';

export const GOOGLE_WIZARD_STEP: FlowStep = {
  id: 'bu-google-wizard',
  order: 3,
  label: 'Wizard',
  title: 'Same as owner',
  subtitle: 'Org → profile → city steps before OAuth',
  route: '/sign-up',
  screen: 'OrgStep · CompanyDetailsStep · CompanyLocationStep',
  phase: 'ui',
  queries: [
    {
      label: 'Steps 3–5 (same as owner)',
      when: 'UI only until Google OAuth step',
      sql: `-- See owner steps bu-owner-org, bu-owner-profile, bu-owner-city
-- Writes deferred to AsyncStorage + applyPendingOAuthMetadata`,
    },
  ],
  notes: [
    'Same fields as owner steps 3–5',
    'checkOrganizationNameTaken on org step',
    'Pending metadata in AsyncStorage before Google session',
  ],
};

export const GOOGLE_BRANDING_STEP: FlowStep = {
  id: 'bu-google-branding',
  order: 5,
  label: 'Branding',
  title: 'Logo + photo',
  subtitle: 'Same post-auth steps as email owner',
  route: '/sign-up',
  screen: 'OrgLogoStep · ProfilePhotoStep · SuccessStep',
  phase: 'post-auth',
  queries: [
    {
      label: 'Same as owner steps 7–8',
      when: 'enterPostAuthBranding after OAuth',
      sql: `-- bu-owner-logo: update_organization_logo / organizations.logo_url
-- bu-owner-photo: profiles + auth metadata avatar
-- bu-enter-activation: SuccessStep → ROUTES.TABS.TRIPS`,
    },
  ],
  notes: ['Reuses owner logo/photo/success steps after OAuth'],
};

/** Reference map for inspector cross-links */
export const GOOGLE_BRANDING_REFERENCES = OWNER_SIGNUP_STEPS.filter((s) =>
  ['bu-owner-logo', 'bu-owner-photo'].includes(s.id),
);
