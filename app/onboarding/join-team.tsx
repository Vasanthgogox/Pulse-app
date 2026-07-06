import { Redirect } from 'expo-router';

import { ROUTES } from '@/lib/routes';

/**
 * Legacy team-invite entry — forwards into the unified business signup flow
 * (Phone → OTP → invitation resolver → accept).
 */
export default function JoinTeamOnboardingRoute() {
  return (
    <Redirect
        href={{
          pathname: ROUTES.ONBOARDING.BUSINESS,
          params: { intent: 'team', ref: 'join-team' },
        }}
    />
  );
}
