/**
 * Organization context — current org for list/detail screens. Uses services/organizationService.
 */
import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import * as organizationService from '@/features/organization';
import type { CurrentOrganization } from '@/types/organization';

interface OrganizationContextType {
  currentOrganization: CurrentOrganization | null;
  setCurrentOrganization: (org: CurrentOrganization | null) => void;
  isLoading: boolean;
  error: Error | null;
  refreshOrganization: () => Promise<void>;
}

const OrganizationContext = createContext<OrganizationContextType | undefined>(undefined);

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
  const { user } = useAuth();
  const [currentOrganization, setCurrentOrganization] = useState<CurrentOrganization | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  /** Current effect session signal — refresh uses this ref so sign-out / user swap cancels in-flight work (no shared mountedRef race). */
  const sessionSignalRef = useRef<{ cancelled: boolean }>({ cancelled: false });
  const userRef = useRef(user);
  userRef.current = user;

  /** `signal.cancelled` is set in effect cleanup (user change, unmount). Refresh uses `sessionSignalRef` so it honours the same cancellation. */
  const loadOrganizationsForSession = useCallback(async (signal: { cancelled: boolean }) => {
    const stale = () => signal.cancelled;
    const staleForUser = (uid: string) => stale() || userRef.current?.uid !== uid;

    const sessionUser = userRef.current;
    if (!sessionUser) {
      if (stale()) return;
      setCurrentOrganization(null);
      setIsLoading(false);
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
        setCurrentOrganization(null);
      } else if (organizations.length > 0) {
        setCurrentOrganization(organizations[0]);
      } else {
        setCurrentOrganization(null);
      }
    } catch (e) {
      if (staleForUser(sessionUid)) return;
      setError(e instanceof Error ? e : new Error(String(e)));
      setCurrentOrganization(null);
    } finally {
      if (!staleForUser(sessionUid)) {
        setIsLoading(false);
      }
    }
  }, []);

  const refreshOrganization = useCallback(async () => {
    await loadOrganizationsForSession(sessionSignalRef.current);
  }, [loadOrganizationsForSession]);

  useEffect(() => {
    const signal = { cancelled: false };
    sessionSignalRef.current = signal;
    void loadOrganizationsForSession(signal);
    return () => {
      signal.cancelled = true;
    };
  }, [user, loadOrganizationsForSession]);

  return (
    <OrganizationContext.Provider
      value={{ currentOrganization, setCurrentOrganization, isLoading, error, refreshOrganization }}
    >
      {children}
    </OrganizationContext.Provider>
  );
}
