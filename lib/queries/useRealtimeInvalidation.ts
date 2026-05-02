/**
 * Realtime subscriptions that invalidate TanStack Query cache on DB change.
 * Replaces callback-based useRealtimeTrips/useRealtimeTransactions with query invalidation.
 * See docs/PAGINATION_AND_CACHE_ANALYSIS.md.
 */
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { queryKeys } from '@/lib/queryKeys';
import { uniqueRealtimeChannelTopic } from '@/lib/realtimeTopic';

/** Subscribe to trips for org; invalidate trips query on any change. */
export function useRealtimeTripsInvalidation(organizationId: string | null) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!organizationId) return;
    const channel = supabase()
      .channel(uniqueRealtimeChannelTopic(`trips:org:${organizationId}`))
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'trips',
          filter: `organization_id=eq.${organizationId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: queryKeys.trips.all(organizationId) });
          qc.invalidateQueries({ queryKey: queryKeys.trips.shipperNamesForSupplier(organizationId) });
        }
      )
      .subscribe();
    return () => {
      void supabase().removeChannel(channel).catch((err: unknown) => {
        console.warn('[realtime] removeChannel failed:', err);
      });
    };
  }, [organizationId, qc]);
}

/** Subscribe to transactions for org; invalidate transactions query on any change. */
export function useRealtimeTransactionsInvalidation(organizationId: string | null) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!organizationId) return;
    const channel = supabase()
      .channel(uniqueRealtimeChannelTopic(`transactions:${organizationId}`))
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'transactions',
          filter: `organization_id=eq.${organizationId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: queryKeys.transactions.all(organizationId) });
        }
      )
      .subscribe();
    return () => {
      void supabase().removeChannel(channel).catch((err: unknown) => {
        console.warn('[realtime] removeChannel failed:', err);
      });
    };
  }, [organizationId, qc]);
}

/** Subscribe to network-related tables; invalidate network queries on any change. */
export function useRealtimeNetworkInvalidation(organizationId: string | null) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!organizationId) return;

    const invalidateNetwork = () => {
      qc.invalidateQueries({ queryKey: queryKeys.clients.all(organizationId) });
      qc.invalidateQueries({ queryKey: queryKeys.suppliers.all(organizationId) });
      qc.invalidateQueries({ queryKey: queryKeys.drivers.all(organizationId) });
      qc.invalidateQueries({ queryKey: queryKeys.connectionRequests.received(organizationId) });
      qc.invalidateQueries({ queryKey: queryKeys.connectionRequests.sent(organizationId) });
      qc.invalidateQueries({ queryKey: queryKeys.driverInvites.sent(organizationId) });
    };

    const channel = supabase()
      .channel(uniqueRealtimeChannelTopic(`network:${organizationId}`))
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'clients',
          filter: `organization_id=eq.${organizationId}`,
        },
        invalidateNetwork
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'suppliers',
          filter: `organization_id=eq.${organizationId}`,
        },
        invalidateNetwork
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'drivers',
          filter: `organization_id=eq.${organizationId}`,
        },
        invalidateNetwork
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'connection_requests',
          filter: `or(from_organization_id.eq.${organizationId},to_organization_id.eq.${organizationId})`,
        },
        invalidateNetwork
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'driver_invites',
          filter: `from_organization_id=eq.${organizationId}`,
        },
        invalidateNetwork
      )
      .subscribe();

    return () => {
      void supabase().removeChannel(channel).catch((err: unknown) => {
        console.warn('[realtime] removeChannel failed:', err);
      });
    };
  }, [organizationId, qc]);
}
