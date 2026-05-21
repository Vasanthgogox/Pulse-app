/**
 * Warm Finance tab: lazy route chunk + critical TanStack queries (trips + ledger).
 * Call on tab press/hover or idle when the user is likely to open Fiscal — one tab at a time.
 */
import { syncTransactionsWithCache } from '@/features/finance/services/finance.service';
import type { TripRow } from '@/features/trips/services/trips.service';
import { preloadTabScreen } from '@/lib/preloadTabChunks';
import { queryKeys } from '@/lib/queryKeys';
export { scheduleIdleWork } from '@/lib/scheduleIdleWork';
import { supabase } from '@/lib/supabase';
import type { QueryClient } from '@tanstack/react-query';

export function preloadFinanceRouteChunk(): void {
  preloadTabScreen('finance');
}

/** Prefetch trips + ledger so phase-2 splash clears faster after the chunk loads. */
export function prefetchFinanceQueries(
  queryClient: QueryClient,
  orgId: string,
): void {
  void queryClient.prefetchQuery({
    queryKey: queryKeys.trips.finite(orgId),
    queryFn: async () => {
      const { data, error } = await supabase().rpc('get_trips_for_org', {
        p_org_id: orgId,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as TripRow[];
    },
  });

  void queryClient.prefetchQuery({
    queryKey: queryKeys.transactions.finite(orgId),
    queryFn: async () => {
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
