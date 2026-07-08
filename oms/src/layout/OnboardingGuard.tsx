import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '@/context/AuthProvider';
import { useOrganization } from '@/context/OrganizationProvider';
import { useCommerceReadiness } from '@/hooks/useCommerceReadiness';

function WorkspaceLoading({ error }: { error?: string | null }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-2 px-6 text-center text-sm text-muted-foreground">
      {error ? (
        <>
          <p className="text-destructive font-medium">Workspace data failed to load</p>
          <p className="text-2xs max-w-md">{error}</p>
        </>
      ) : (
        <p>Loading workspace…</p>
      )}
    </div>
  );
}

/**
 * Platform access gate — waits for auth + hydration before redirecting.
 * Product setup (warehouses, catalog, …) is never checked here.
 */
export function OnboardingGuard({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { readiness, evaluating, module } = useCommerceReadiness();
  const org = useOrganization();
  const { pathname } = useLocation();

  if (evaluating) {
    return <WorkspaceLoading error={org.masterDataError} />;
  }

  if (user && readiness && !readiness.accessible && pathname !== module.onboardingRoute) {
    return <Navigate to={module.onboardingRoute} replace />;
  }

  return <>{children}</>;
}
