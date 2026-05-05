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

/** Subscribe to network-related tables; each table invalidates only its own query key. */
export function useRealtimeNetworkInvalidation(organizationId: string | null) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!organizationId) return;

    const cleanups = [
      subscribeSharedPostgresChanges(
        `clients:org:${organizationId}`,
        [{ event: '*', schema: 'public', table: 'clients', filter: `organization_id=eq.${organizationId}` }],
        () => qc.invalidateQueries({ queryKey: queryKeys.clients.all(organizationId) })
      ),
      subscribeSharedPostgresChanges(
        `suppliers:org:${organizationId}`,
        [{ event: '*', schema: 'public', table: 'suppliers', filter: `organization_id=eq.${organizationId}` }],
        () => qc.invalidateQueries({ queryKey: queryKeys.suppliers.all(organizationId) })
      ),
      subscribeSharedPostgresChanges(
        `drivers:org:${organizationId}`,
        [{ event: '*', schema: 'public', table: 'drivers', filter: `organization_id=eq.${organizationId}` }],
        () => qc.invalidateQueries({ queryKey: queryKeys.drivers.all(organizationId) })
      ),
      subscribeSharedPostgresChanges(
        `connection_requests:org:${organizationId}`,
        [{
          event: '*',
          schema: 'public',
          table: 'connection_requests',
          filter: `or(from_organization_id.eq.${organizationId},to_organization_id.eq.${organizationId})`,
        }],
        () => {
          qc.invalidateQueries({ queryKey: queryKeys.connectionRequests.received(organizationId) });
          qc.invalidateQueries({ queryKey: queryKeys.connectionRequests.sent(organizationId) });
        }
      ),
      subscribeSharedPostgresChanges(
        `driver_invites:org:${organizationId}`,
        [{ event: '*', schema: 'public', table: 'driver_invites', filter: `from_organization_id=eq.${organizationId}` }],
        () => qc.invalidateQueries({ queryKey: queryKeys.driverInvites.sent(organizationId) })
      ),
    ];

    return () => cleanups.forEach((c) => c());
  }, [organizationId, qc]);
}
