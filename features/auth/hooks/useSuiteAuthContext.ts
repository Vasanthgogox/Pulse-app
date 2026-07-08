import { useLocalSearchParams } from 'expo-router';
import { useLayoutEffect, useMemo } from 'react';

import { resolveSuiteAuthContext, writeSuiteNavigationIntent } from '@/lib/suite/suiteAuth';

/** Parsed `product` + `returnTo` for suite sign-in / sign-up screens. */
export function useSuiteAuthContext() {
  const params = useLocalSearchParams<{
    product?: string | string[];
    returnTo?: string | string[];
  }>();

  const context = useMemo(() => resolveSuiteAuthContext(params), [params.product, params.returnTo]);

  // useLayoutEffect — persist before OAuth leaves the page (useEffect can lose the race).
  useLayoutEffect(() => {
    writeSuiteNavigationIntent({
      productId: context.productId,
      returnTo: context.returnTo,
    });
  }, [context.productId, context.returnTo]);

  return context;
}
