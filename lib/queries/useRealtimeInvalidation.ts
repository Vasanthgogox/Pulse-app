/**
 * Realtime subscriptions that invalidate TanStack Query cache on DB change.
 * Replaces callback-based useRealtimeTrips/useRealtimeTransactions with query invalidation.
 * See docs/PAGINATION_AND_CACHE_ANALYSIS.md.
 */
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { queryKeys } from '@/lib/queryKeys';

function uniqueTopic(base: string) {
  return `${base}:${Math.random().toString(36).slice(2, 10)}`;
}

/** Subscribe to trips for org; invalidate trips query on any change. */
export function useRealtimeTripsInvalidation(organizationId: string | null) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!organizationId) return;
    const channel = supabase()
      .channel(uniqueTopic(`trips:org:${organizationId}`))
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
      supabase().removeChannel(channel);
    };
  }, [organizationId, qc]);
}

/** Subscribe to transactions for org; invalidate transactions query on any change. */
export function useRealtimeTransactionsInvalidation(organizationId: string | null) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!organizationId) return;
    const channel = supabase()
      .channel(uniqueTopic(`transactions:${organizationId}`))
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
      supabase().removeChannel(channel);
    };
  }, [organizationId, qc]);
}
