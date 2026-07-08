import { useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';

import { useAuth } from '@/context/AuthProvider';
import { buildPlatformSignInUrl } from '@/lib/suite-auth';

/** Redirect unauthenticated users to shared Pulse sign-in (Zoho-style suite auth). */
export function AuthGuard({ children }: { children: ReactNode }) {
  const { loading, user, authRequired } = useAuth();
  const { pathname } = useLocation();

  if (!authRequired) {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
        Checking session…
      </div>
    );
  }

  if (!user) {
    const returnTo = `/oms${pathname === '/' ? '/dashboard' : pathname}`;
    const signInUrl = buildPlatformSignInUrl(returnTo);
    window.location.assign(signInUrl);
    return null;
  }

  return <>{children}</>;
}
