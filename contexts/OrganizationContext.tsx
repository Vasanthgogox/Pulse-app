/**
 * Organization context — current org for list/detail screens. Uses services/organizationService.
 */
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  type Context,
  type ReactNode,
} from 'react';
import { useAuth } from '@/contexts/AuthContext';
// Direct path avoids dragging the org barrel (components + visibility helpers)
// into every consumer of the OrganizationContext.
import * as organizationService from '@/features/organization/services/organization.service';
import { markStartupPhase, isStartupComplete } from '@/lib/startupMetrics';
import type { CurrentOrganization } from '@/types/organization';
import { getQueryClient } from '@/lib/queryClient';
import { isInfrastructureErrorMessage } from '@/lib/supabaseHttp.util';

interface OrganizationContextType {
  currentOrganization: CurrentOrganization | null;
  setCurrentOrganization: (org: CurrentOrganization | null) => void;
  isLoading: boolean;
  error: Error | null;
  refreshOrganization: () => Promise<void>;
}

/** Metro can duplicate this module across async chunks — one Context instance globally. */
const PULSE_ORG_CONTEXT_KEY = '__pulse_organization_context__';

function getOrCreateOrganizationContext(): Context<OrganizationContextType | undefined> {
  const g = globalThis as typeof globalThis & {
    [PULSE_ORG_CONTEXT_KEY]?: Context<OrganizationContextType | undefined>;
  };
  if (!g[PULSE_ORG_CONTEXT_KEY]) {
    g[PULSE_ORG_CONTEXT_KEY] = createContext<OrganizationContextType | undefined>(undefined);
  }
  return g[PULSE_ORG_CONTEXT_KEY];
}

const OrganizationContext = getOrCreateOrganizationContext();

export function useOptionalOrganization() {
  return useContext(OrganizationContext);
}

export function useOrganization() {
  const ctx = useContext(OrganizationContext);
  if (ctx === undefined) {
    throw new Error('useOrganization must be used within an OrganizationProvider');
  }
  return ctx;
}

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const { user, profile, status } = useAuth();
  const userId = user?.uid ?? null;
  const [currentOrganization, setCurrentOrganizationState] = useState<CurrentOrganization | null>(null);
  const prevOrgIdRef = useRef<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  /** Current effect session signal — refresh uses this ref so sign-out / user swap cancels in-flight work (no shared mountedRef race). */
  const sessionSignalRef = useRef<{ cancelled: boolean }>({ cancelled: false });
  const userRef = useRef(user);
  userRef.current = user;

  /**
   * Tracks which userId had its org state populated by ActiveWorkspaceContext.
   * When set, OrganizationContext skips its own fetch for that user — avoiding
   * a duplicate startup request. Cleared on userId change so a different user
   * always gets a fresh fetch. refreshOrganization bypasses this guard entirely.
   */
  const workspacePopulatedForUserRef = useRef<string | null>(null);

  // Public setter — wraps state setter so ActiveWorkspaceContext can signal
  // that it has already populated org state for the current user.
  const setCurrentOrganization = useCallback((org: CurrentOrganization | null) => {
    const currentUid = userRef.current?.uid ?? null;
    if (currentUid) workspacePopulatedForUserRef.current = currentUid;
    setCurrentOrganizationState(org);
  }, []);

  /** `signal.cancelled` is set in effect cleanup (user change, unmount). Refresh uses `sessionSignalRef` so it honours the same cancellation. */
  const loadOrganizationsForSession = useCallback(async (signal: { cancelled: boolean }, forceRefresh = false) => {
    const stale = () => signal.cancelled;
    const staleForUser = (uid: string) => stale() || userRef.current?.uid !== uid;

    const sessionUser = userRef.current;
    if (!sessionUser) {
      if (stale()) return;
      setCurrentOrganizationState(null);
      setIsLoading(false);
      return;
    }

    if (profile?.role === 'driver') {
      if (stale()) return;
      setCurrentOrganizationState(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    // Skip fetch if ActiveWorkspaceContext already populated org state for this
    // exact user session. forceRefresh (used by refreshOrganization) bypasses this.
    if (!forceRefresh && workspacePopulatedForUserRef.current === sessionUser.uid) {
      if (!stale()) setIsLoading(false);
      return;
    }

    const sessionUid = sessionUser.uid;
    if (!stale()) {
      setIsLoading(true);
      setError(null);
    }
    try {
      const { error: err, organizations } = await organizationService.getOrganizationsForUser();
      if (staleForUser(sessionUid)) return;
      if (err) {
        setError(err);
        if (!isInfrastructureErrorMessage(err.message)) {
          setCurrentOrganizationState(null);
        }
      } else if (organizations.length > 0) {
        setCurrentOrganizationState(organizations[0]);
      } else {
        setCurrentOrganizationState(null);
      }
    } catch (e) {
      if (staleForUser(sessionUid)) return;
      setError(e instanceof Error ? e : new Error(String(e)));
      setCurrentOrganizationState(null);
    } finally {
      if (!staleForUser(sessionUid)) {
        // Only mark once during cold boot — not on every org refresh.
        if (!isStartupComplete()) markStartupPhase('org_resolved');
        setIsLoading(false);
      }
    }
  }, [profile?.role]);

  const refreshOrganization = useCallback(async () => {
    await loadOrganizationsForSession(sessionSignalRef.current, true); // forceRefresh — bypasses workspace guard
  }, [loadOrganizationsForSession]);

  useEffect(() => {
    // Clear workspace-populated flag on user change so a different user always
    // gets a fresh fetch — prevents the guard from skipping after account switch.
    workspacePopulatedForUserRef.current = null;
    if (status === 'restoring') return;
    const signal = { cancelled: false };
    sessionSignalRef.current = signal;
    void loadOrganizationsForSession(signal);
    return () => {
      signal.cancelled = true;
    };
  }, [userId, status, loadOrganizationsForSession]);

  useEffect(() => {
    if (!error || !isInfrastructureErrorMessage(error.message)) return;
    if (status === 'restoring' || !user || profile?.role === 'driver') return;
    const retryMs = 5_000;
    const t = setTimeout(() => {
      void refreshOrganization();
    }, retryMs);
    return () => clearTimeout(t);
  }, [error, status, userId, profile?.role, refreshOrganization]);

  // Invalidate non-realtime TanStack Query cache on org switch to prevent cross-org data bleed.
  // Realtime-covered queries self-update; the rest need a forced eviction.
  useEffect(() => {
    const newOrgId = currentOrganization?.id ?? null;
    if (prevOrgIdRef.current !== null && prevOrgIdRef.current !== newOrgId) {
      const qc = getQueryClient();
      // Remove all cached entity lists — they're org-scoped and must not leak across orgs.
      // Realtime subscriptions will re-populate fresh data after the switch.
      qc.removeQueries({ predicate: (q) => {
        const key = q.queryKey;
        return Array.isArray(key) && key[0] === 'q';
      }});
    }
    prevOrgIdRef.current = newOrgId;
  }, [currentOrganization?.id]);

  // Stable context value: consumers only re-render when the fields they actually
  // use change. Without useMemo the object is recreated on every render of
  // OrganizationProvider (e.g. each isLoading flip triggers 20+ consumers).
  const value = useMemo(
    () => ({ currentOrganization, setCurrentOrganization, isLoading, error, refreshOrganization }),
    [currentOrganization, isLoading, error, refreshOrganization],
  );

  return (
    <OrganizationContext.Provider value={value}>
      {children}
    </OrganizationContext.Provider>
  );
}
