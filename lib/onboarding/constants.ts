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
    title: 'Transport business',
    subtitle: 'Create your workspace — fleet, dispatch, and finance in one place.',
    eyebrow: 'Workspace owner',
    route: '/onboarding/business',
    icon: 'building',
  },
  {
    id: 'driver',
    title: 'Driver',
    subtitle: 'Join a fleet, complete verification, and run trips on Pulse.',
    eyebrow: 'Workforce',
    route: '/onboarding/driver',
    icon: 'truck',
  },
  {
    id: 'join_team',
    title: 'Join your company',
    subtitle: 'You were invited by your admin — activate without creating a new workspace.',
    eyebrow: 'Team member',
    route: '/onboarding/join-team',
    icon: 'users',
  },
  {
    id: 'join_fleet',
    title: 'Fleet invite',
    subtitle: 'Accept a dispatcher invite and link to your operator.',
    eyebrow: 'Fleet link',
    route: '/driver-signup',
    icon: 'link',
  },
];
