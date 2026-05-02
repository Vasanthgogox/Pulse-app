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
  const mountedRef = useRef(true);

  const refreshOrganization = useCallback(async () => {
    if (!user) {
      setCurrentOrganization(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const { error: err, organizations } = await organizationService.getOrganizationsForUser();
      if (!mountedRef.current) return;
      if (err) {
        setError(err);
        setCurrentOrganization(null);
      } else if (organizations.length > 0) {
        setCurrentOrganization(organizations[0]);
      } else {
        setCurrentOrganization(null);
      }
    } catch (e) {
      if (!mountedRef.current) return;
      setError(e instanceof Error ? e : new Error(String(e)));
      setCurrentOrganization(null);
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    mountedRef.current = true;
    refreshOrganization();
    return () => { mountedRef.current = false; };
  }, [refreshOrganization]);

  return (
    <OrganizationContext.Provider
      value={{ currentOrganization, setCurrentOrganization, isLoading, error, refreshOrganization }}
    >
      {children}
    </OrganizationContext.Provider>
  );
}
