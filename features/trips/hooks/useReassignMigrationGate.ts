import {
  checkReassignAggregateMigrationApplied,
  clearReassignMigrationCache,
} from '@/features/trips/services/reassignMigration.service';
import { useEffect, useRef, useState } from 'react';

type State = {
  /** null = not yet checked */
  applied: boolean | null;
  checking: boolean;
  error: string | null;
};

/**
 * Gate aggregate reassignment until status-preserve migration is on the linked DB.
 * At most one RPC per enable cycle; result is session-cached in the service layer.
 */
export function useReassignMigrationGate(enabled: boolean) {
  const [state, setState] = useState<State>({
    applied: null,
    checking: false,
    error: null,
  });
  const enabledRef = useRef(enabled);

  useEffect(() => {
    enabledRef.current = enabled;
    if (!enabled) {
      setState({ applied: null, checking: false, error: null });
      return;
    }

    let cancelled = false;
    setState((s) => ({ ...s, checking: true, error: null }));

    void checkReassignAggregateMigrationApplied().then(({ applied, error }) => {
      if (cancelled || !enabledRef.current) return;
      setState({
        applied,
        checking: false,
        error: error?.message ?? null,
      });
    });

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const refreshMigrationCheck = async (force = false) => {
    if (!enabledRef.current) return;
    if (force) clearReassignMigrationCache();
    setState((s) => ({ ...s, checking: true, error: null }));
    const { applied, error } = await checkReassignAggregateMigrationApplied();
    if (!enabledRef.current) return;
    setState({
      applied,
      checking: false,
      error: error?.message ?? null,
    });
  };

  return {
    migrationApplied: state.applied === true,
    migrationBlocked: state.applied === false,
    migrationChecking: state.checking,
    migrationError: state.error,
    refreshMigrationCheck,
  };
}
