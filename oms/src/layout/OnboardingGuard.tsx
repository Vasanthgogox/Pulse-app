import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '@/context/AuthProvider';
import { useCommerceReadiness } from '@/hooks/useCommerceReadiness';

function WorkspaceLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
      Loading workspace…
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
  const { pathname } = useLocation();

  if (evaluating) {
    return <WorkspaceLoading />;
  }

  if (user && readiness && !readiness.accessible && pathname !== module.onboardingRoute) {
    return <Navigate to={module.onboardingRoute} replace />;
  }

  return <>{children}</>;
}
