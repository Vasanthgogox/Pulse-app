import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '@/context/AuthProvider';
import { useOrganization } from '@/context/OrganizationProvider';

function WorkspaceLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
      Loading workspace…
    </div>
  );
}

export function OnboardingGuard({ children }: { children: ReactNode }) {
  const { loading: authLoading, user } = useAuth();
  const { organizationHydrated, hasPlatformOrganization } = useOrganization();
  const { pathname } = useLocation();

  const authReady = !authLoading;
  const userResolved = authReady;
  const platformReady = organizationHydrated;

  if (!authReady || !userResolved || !platformReady) {
    return <WorkspaceLoading />;
  }

  // Platform org is Supabase truth — only redirect when hydration confirms none exists.
  // Commerce configuration (warehouses, products, consignees) is handled in-dashboard.
  if (user && !hasPlatformOrganization && pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
}
