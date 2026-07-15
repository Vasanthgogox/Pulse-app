/**
 * Phase 3 — Shadow Mode host.
 * Evaluates every navigation; NEVER redirects (enforce=false).
 * Legacy routing remains authoritative.
 */

import { useOptionalAuth } from '@/contexts/AuthContext';
import { NavigationPolicyProvider } from '@/lib/navigationPolicy/NavigationPolicyProvider';
import { authStatusToSessionPosture } from '@/lib/navigationPolicy/sessionPosture';
import {
  recordShadowDecision,
  settleShadowIfStable,
  settleShadowPath,
} from '@/lib/navigationPolicy/shadowMismatch';
import { subscribeNavigationDecisions } from '@/lib/navigationPolicy/telemetry';
import {
  isBusinessSignupBrandingActiveSync,
  isDriverSignupSuccessActiveSync,
} from '@/lib/onboarding/businessSignupBranding.util';
import { isOwnerBusinessProfileRequiredSync } from '@/lib/onboarding/incompleteOwnerOrg.util';
import { usePathname } from 'expo-router';
import { useEffect, useMemo, type ReactNode } from 'react';
import { Platform } from 'react-native';

const SETTLE_MS = 600;

export function NavigationPolicyShadowHost({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? '/';
  const auth = useOptionalAuth();
  const status = auth?.status ?? 'restoring';
  const profile = auth?.profile ?? null;

  const sessionPosture = authStatusToSessionPosture(status);
  const platform =
    Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web';

  const predicates = useMemo(
    () => ({
      signup_branding_active: isBusinessSignupBrandingActiveSync(),
      owner_org_incomplete: isOwnerBusinessProfileRequiredSync(),
      driver_signup_success: isDriverSignupSuccessActiveSync(),
    }),
    // Recompute when path/auth changes (sync flags may update between navs)
    [pathname, status, profile?.uid],
  );

  // Feed shadow collector from telemetry emissions
  useEffect(() => {
    return subscribeNavigationDecisions((event) => {
      recordShadowDecision({
        pathname: event.pathname,
        canonicalPath: event.canonicalPath,
        decision: event.decision,
        reason: event.reason,
      });
    });
  }, []);

  // Path change settles previous observation against legacy outcome
  useEffect(() => {
    settleShadowPath(pathname);
    const t = setTimeout(() => settleShadowIfStable(pathname), SETTLE_MS);
    return () => clearTimeout(t);
  }, [pathname]);

  return (
    <NavigationPolicyProvider
      pathname={pathname}
      sessionPosture={sessionPosture}
      profile={
        profile
          ? {
              role: profile.role,
              aggregated: profile.aggregated,
              asset: profile.asset,
            }
          : null
      }
      predicates={predicates}
      platform={platform}
      enforce={false}
    >
      {children}
    </NavigationPolicyProvider>
  );
}
