import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useOrganization } from '@/context/OrganizationProvider';

export function OnboardingGuard({ children }: { children: ReactNode }) {
  const { onboardingDone } = useOrganization();
  const { pathname } = useLocation();

  if (!onboardingDone && pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
}
