import { useEffect, useState } from 'react';

import { useAuth } from '@/context/AuthProvider';
import { useOrganization } from '@/context/OrganizationProvider';
import { commerceModule } from '@/lib/suite/commerce-module';
import type { ProductReadiness } from '@pulse-suite/suiteProductModule';

/**
 * Evaluates Commerce readiness via `commerceModule` → `PlatformReadinessService`.
 * Barrier: authReady && organizationHydrated before any redirect decision.
 */
export function useCommerceReadiness() {
  const { user, loading: authLoading } = useAuth();
  const org = useOrganization();
  const [readiness, setReadiness] = useState<ProductReadiness | null>(null);
  const [evaluating, setEvaluating] = useState(true);

  const authReady = !authLoading;
  const userResolved = authReady;
  const platformReady = org.organizationHydrated;
  const barrierReady = authReady && userResolved && platformReady;
  const workspaceId = org.platformOrganization?.id ?? null;

  useEffect(() => {
    if (!barrierReady) {
      setEvaluating(true);
      return;
    }

    let cancelled = false;
    setEvaluating(true);

    void commerceModule
      .evaluateReadiness({
        userId: user?.id ?? null,
        sessionReady: Boolean(user),
        organizationHydrated: org.organizationHydrated,
        platformOrganization: org.platformOrganization,
        workspaceId,
      })
      .then((result) => {
        if (!cancelled) {
          setReadiness(result);
          setEvaluating(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [barrierReady, org.organizationHydrated, org.platformOrganization, user, workspaceId]);

  return {
    readiness,
    evaluating: !barrierReady || evaluating,
    barrierReady,
    module: commerceModule,
  };
}
