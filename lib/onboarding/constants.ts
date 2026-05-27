/** Onboarding personas — operational workspace entry points. */
export type OnboardingPersonaId =
  | 'business_owner'
  | 'driver'
  | 'join_team'
  | 'join_fleet';

export type OnboardingPersonaCard = {
  id: OnboardingPersonaId;
  title: string;
  subtitle: string;
  route: string;
  icon: 'building' | 'truck' | 'users' | 'link';
  eyebrow: string;
};

export const ONBOARDING_PERSONAS: OnboardingPersonaCard[] = [
  {
    id: 'business_owner',
    title: 'Operate a transport business',
    subtitle: 'Provision a workspace for dispatch, fleet, trips, and finance.',
    eyebrow: 'Workspace owner',
    route: '/onboarding/business',
    icon: 'building',
  },
  {
    id: 'driver',
    title: 'Join as fleet workforce',
    subtitle: 'Activate your driver identity, documents, and trip execution profile.',
    eyebrow: 'Workforce',
    route: '/onboarding/driver',
    icon: 'truck',
  },
  {
    id: 'join_team',
    title: 'Join an existing operator',
    subtitle: 'Accept your admin invite — no new company workspace is created.',
    eyebrow: 'Team member',
    route: '/onboarding/join-team',
    icon: 'users',
  },
  {
    id: 'join_fleet',
    title: 'Accept fleet assignment',
    subtitle: 'Link to a dispatcher invite and preserve your operational role.',
    eyebrow: 'Fleet link',
    route: '/driver-signup',
    icon: 'link',
  },
];
