import { REASSIGN_AGGREGATE_STATUS_MIGRATION } from '@/features/trips/constants/reassignMigration';
import { supabase } from '@/lib/supabase';

const CACHE_TTL_MS = 30 * 60 * 1000;

let sessionCache: { applied: boolean; checkedAt: number } | null = null;
let inFlight: Promise<{ applied: boolean; error: Error | null }> | null = null;

/**
 * Runtime pre-ship check: aggregate reassign requires status-preserve migration on remote.
 * Dedupes concurrent callers (trip detail + reassign sheet) into one RPC per session window.
 */
export async function checkReassignAggregateMigrationApplied(): Promise<{
  applied: boolean;
  error: Error | null;
}> {
  if (sessionCache && Date.now() - sessionCache.checkedAt < CACHE_TTL_MS) {
    return { applied: sessionCache.applied, error: null };
  }

  if (inFlight) return inFlight;

  inFlight = (async () => {
    const { data, error } = await supabase().rpc('is_app_migration_applied', {
      p_version: REASSIGN_AGGREGATE_STATUS_MIGRATION,
    });

    if (error) {
      return { applied: false, error: new Error(error.message) };
    }

    const applied = data === true;
    sessionCache = { applied, checkedAt: Date.now() };
    return { applied, error: null };
  })();

  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}

/** Clear cache after deploy verification or forced refresh from ReassignSheet open. */
export function clearReassignMigrationCache(): void {
  sessionCache = null;
  inFlight = null;
}
