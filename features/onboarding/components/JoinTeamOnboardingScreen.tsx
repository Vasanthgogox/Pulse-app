import { Redirect } from 'expo-router';

import { ROUTES } from '@/lib/routes';

/**
 * @deprecated Use unified signup at `/onboarding/business?intent=team`.
 * Kept for imports; route file redirects automatically.
 */
export function JoinTeamOnboardingScreen() {
  return (
    <Redirect
      href={{
        pathname: ROUTES.ONBOARDING.BUSINESS,
        params: { intent: 'team' },
      }}
    />
  );
}
