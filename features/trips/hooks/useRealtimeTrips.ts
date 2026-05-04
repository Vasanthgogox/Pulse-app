/**
 * Supabase Realtime subscriptions for trips. Call onInvalidate when data changes (refetch once).
 */
import { useEffect, useRef } from 'react';
import { subscribeSharedPostgresChanges } from '@/lib/realtimeRegistry';

/** Subscribe to trips for an organization; call onInvalidate when any change. */
export function useRealtimeTrips(organizationId: string | null, onInvalidate: () => void) {
  const onInvalidateRef = useRef(onInvalidate);
  onInvalidateRef.current = onInvalidate;

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
        onInvalidateRef.current();
      }
    );
  }, [organizationId]);
}

/** Subscribe to a single trip by id; call onInvalidate when it changes. */
export function useRealtimeTrip(tripId: string | null, onInvalidate: () => void) {
  const onInvalidateRef = useRef(onInvalidate);
  onInvalidateRef.current = onInvalidate;

  useEffect(() => {
    if (!tripId) return;
    return subscribeSharedPostgresChanges(
      `trip:${tripId}`,
      [
        {
          event: '*',
          schema: 'public',
          table: 'trips',
          filter: `id=eq.${tripId}`,
        },
      ],
      () => {
        onInvalidateRef.current();
      }
    );
  }, [tripId]);
}
