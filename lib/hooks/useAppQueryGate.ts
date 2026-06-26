import {
  APP_QUERY_GATE_QUIET_MS,
  getMsSinceBootstrapReady,
} from '@/lib/hooks/appQueryGateState';
import { useBootstrapReady } from '@/lib/hooks/useQueryBootDefer';
import { useEffect, useState } from 'react';

export {
  APP_QUERY_GATE_QUIET_MS,
  getMsSinceBootstrapReady,
  isWithinAppQueryBootQuietPeriod,
  markAppQueryGateBootstrapReady,
} from '@/lib/hooks/appQueryGateState';

type Options = {
  /** Skip quiet gate (user opened Loads hub, etc.). */
  urgent?: boolean;
};

/**
 * Returns true when non-urgent list queries may hit the network.
 * Prevents thundering herd with realtime channel setup + bootstrap RPCs.
 */
export function useAppQueryGate(orgId: string | null, options?: Options): boolean {
  const bootstrapReady = useBootstrapReady(orgId);
  const urgent = options?.urgent === true;
  const [quietElapsed, setQuietElapsed] = useState(false);

  useEffect(() => {
    if (!orgId || !bootstrapReady || urgent) {
      setQuietElapsed(false);
      return;
    }
    const remaining = Math.max(0, APP_QUERY_GATE_QUIET_MS - getMsSinceBootstrapReady());
    if (remaining === 0) {
      setQuietElapsed(true);
      return;
    }
    const t = setTimeout(() => setQuietElapsed(true), remaining);
    return () => clearTimeout(t);
  }, [orgId, bootstrapReady, urgent]);

  if (!orgId || !bootstrapReady) return false;
  if (urgent) return true;
  return quietElapsed;
}
