/**
 * DbCapabilitiesContext
 *
 * Fetches extension availability ONCE on app start via the lightweight
 * get_db_capabilities() RPC and caches it for the lifetime of the session.
 *
 * This eliminates the expensive pg_available_extensions four-way JOIN that
 * appears in pg_stat_activity during high-load chat activity. The RPC uses
 * simple EXISTS(SELECT 1 FROM pg_extension ...) checks — no filesystem scan,
 * no I/O wait, no CPU spike.
 *
 * Usage:
 *   const { hasPgCron, hasVector } = useDbCapabilities();
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@/lib/supabase";

interface DbCapabilities {
  pg_cron: boolean;
  pg_trgm: boolean;
  uuid_ossp: boolean;
  pg_stat_statements: boolean;
  vector: boolean;
  postgis: boolean;
}

interface DbCapabilitiesContextType {
  capabilities: DbCapabilities | null;
  /** True while the initial RPC call is in flight. */
  isLoading: boolean;
}

const DEFAULT_CAPABILITIES: DbCapabilities = {
  pg_cron: false,
  pg_trgm: false,
  uuid_ossp: true,
  pg_stat_statements: false,
  vector: false,
  postgis: false,
};

const DbCapabilitiesContext = createContext<DbCapabilitiesContextType>({
  capabilities: null,
  isLoading: true,
});

export function useDbCapabilities(): DbCapabilities {
  const { capabilities } = useContext(DbCapabilitiesContext);
  return capabilities ?? DEFAULT_CAPABILITIES;
}

const DB_CAP_TIMEOUT_MS = 8_000;

export function DbCapabilitiesProvider({ children }: { children: ReactNode }) {
  const [capabilities, setCapabilities] = useState<DbCapabilities | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const timer = setTimeout(() => {
      if (mounted.current) setIsLoading(false);
    }, DB_CAP_TIMEOUT_MS);

    void Promise.resolve(supabase().rpc("get_db_capabilities"))
      .then(({ data, error }) => {
        clearTimeout(timer);
        if (!mounted.current) return;
        if (!error && data && typeof data === "object") {
          setCapabilities(data as DbCapabilities);
        }
        setIsLoading(false);
      })
      .catch(() => {
        clearTimeout(timer);
        if (mounted.current) setIsLoading(false);
      });

    return () => {
      mounted.current = false;
      clearTimeout(timer);
    };
  }, []);

  return (
    <DbCapabilitiesContext.Provider value={{ capabilities, isLoading }}>
      {children}
    </DbCapabilitiesContext.Provider>
  );
}
