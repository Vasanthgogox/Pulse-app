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
      // Same RPC as useTripsQuery — shared cache key avoids a second get_trips_for_org.
      const { data, error } = await supabase().rpc('get_trips_for_org', {
        p_org_id: orgId,
      });
      if (error) throw new Error(error.message);
      // Loose typing here keeps `finance.service`'s `TripRow` (and its whole
      // dependency tree) out of the startup graph. Callers reading from the
      // query cache type-cast at the consumer site.
      return (data ?? []) as unknown;
    },
  });

  void queryClient.prefetchQuery({
    queryKey: queryKeys.transactions.finite(orgId),
    queryFn: async () => {
      // Lazy-load finance.service so this preloader stays out of the startup
      // chunk. Without `await import`, `_layout.tsx` would drag the entire
      // finance feature graph (~hundreds of KB) into the main bundle.
      const { syncTransactionsWithCache } = await import(
        '@/features/finance/services/finance.service'
      );
      const existing =
        (queryClient.getQueryData(queryKeys.transactions.finite(orgId)) as
          | Array<{ id: string }>
          | undefined) ?? [];
      const res = await syncTransactionsWithCache(orgId, existing as never);
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
