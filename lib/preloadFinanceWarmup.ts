/**
 * Warm Finance tab: lazy route chunk + critical TanStack queries (trips + ledger).
 * Call on tab press/hover or idle when the user is likely to open Fiscal.
 *
 * IMPORTANT: This module is statically imported from `app/_layout.tsx`.
 * It MUST NOT statically import any feature service / component or it will
 * drag that feature into the startup chunk. All feature imports inside this
 * file are lazy (`await import(...)`).
 */
import { preloadTabScreen } from '@/lib/preloadTabChunks';
import { queryKeys } from '@/lib/queryKeys';
export { scheduleIdleWork } from '@/lib/scheduleIdleWork';
import { supabase } from '@/lib/supabase';
import type { QueryClient } from '@tanstack/react-query';

export function preloadFinanceRouteChunk(): void {
  preloadTabScreen('finance');
}

/** Prefetch trips + ledger so phase-2 splash clears faster after the chunk loads.
 * Trips use the same query key as useTripsQuery so TanStack dedupes in-flight / cached fetches.
 */
export function prefetchFinanceQueries(
  queryClient: QueryClient,
  orgId: string,
): void {
  void queryClient.prefetchQuery({
    queryKey: queryKeys.trips.finite(orgId),
    queryFn: async () => {
      // Same path as useTripsQuery / getTripsForOrg (RPC, then owner-org table).
      try {
        const { data, error } = await supabase().rpc('get_trips_for_org', {
          p_org_id: orgId,
        });
        if (!error) {
          return (data ?? []) as unknown;
        }
      } catch {
        // Timeout / origin-down — fall through to table read.
      }
      const fallback = await supabase()
        .from('trips')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })
        .limit(200);
      if (fallback.error) throw new Error(fallback.error.message);
      return (fallback.data ?? []) as unknown;
    },
  });

  void queryClient.prefetchQuery({
    queryKey: queryKeys.transactions.finite(orgId),
    queryFn: async () => {
      const { getTransactionsByOrganization } = await import(
        '@/features/finance/services/finance.service'
      );
      const res = await getTransactionsByOrganization(orgId);
      if (res.error) throw res.error;
      return res.transactions;
    },
  });
}

export function preloadFinanceWarmup(
  queryClient: QueryClient,
  orgId: string,
): void {
  preloadFinanceRouteChunk();
  prefetchFinanceQueries(queryClient, orgId);
}
