/**
 * Realtime subscriptions that invalidate TanStack Query cache on DB change.
 * Replaces callback-based useRealtimeTrips/useRealtimeTransactions with query invalidation.
 * See docs/PAGINATION_AND_CACHE_ANALYSIS.md.
 */
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { subscribeSharedPostgresChanges } from '@/lib/realtimeRegistry';

/** Subscribe to trips for org; invalidate trips query on any change. */
export function useRealtimeTripsInvalidation(organizationId: string | null) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!organizationId) return;
    return subscribeSharedPostgresChanges(
      `trips:org:${organizationId}`,
      [
        {
          event: '*',
          schema: 'public',
          table: 'trips',
          filter: `organization_id=eq.${organizationId}`,
        },
      ],
      () => {
        qc.invalidateQueries({ queryKey: queryKeys.trips.all(organizationId) });
        qc.invalidateQueries({ queryKey: queryKeys.trips.shipperNamesForSupplier(organizationId) });
      }
    );
  }, [organizationId, qc]);
}

/** Subscribe to transactions for org; invalidate transactions query on any change. */
export function useRealtimeTransactionsInvalidation(organizationId: string | null) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!organizationId) return;
    return subscribeSharedPostgresChanges(
      `transactions:org:${organizationId}`,
      [
        {
          event: '*',
          schema: 'public',
          table: 'transactions',
          filter: `organization_id=eq.${organizationId}`,
        },
      ],
      () => {
        qc.invalidateQueries({ queryKey: queryKeys.transactions.all(organizationId) });
      }
    );
  }, [organizationId, qc]);
}

/**
 * Previously subscribed clients/suppliers/drivers/connection_requests/driver_invites to realtime.
 * These tables are slow-changing and all mutations already call invalidateQueries, so realtime
 * was redundant and added ~50% of WAL decoder overhead. Removed; staleTime=60s handles staleness.
 * The hook is kept as a no-op so call sites don't need to change.
 */
export function useRealtimeNetworkInvalidation(_organizationId: string | null) {}
