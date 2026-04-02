/**
 * Supabase Realtime subscriptions for trips. Call onInvalidate when data changes (refetch once).
 */
import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

/** Subscribe to trips for an organization; call onInvalidate when any change. */
export function useRealtimeTrips(organizationId: string | null, onInvalidate: () => void) {
  const onInvalidateRef = useRef(onInvalidate);
  onInvalidateRef.current = onInvalidate;

  useEffect(() => {
    if (!organizationId) return;
    const channel = supabase()
      .channel(`trips:org:${organizationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'trips',
          filter: `organization_id=eq.${organizationId}`,
        },
        () => {
          onInvalidateRef.current();
        }
      )
      .subscribe();
    return () => {
      supabase().removeChannel(channel);
    };
  }, [organizationId]);
}

/** Subscribe to a single trip by id; call onInvalidate when it changes. */
export function useRealtimeTrip(tripId: string | null, onInvalidate: () => void) {
  const onInvalidateRef = useRef(onInvalidate);
  onInvalidateRef.current = onInvalidate;

  useEffect(() => {
    if (!tripId) return;
    const channel = supabase()
      .channel(`trip:${tripId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'trips',
          filter: `id=eq.${tripId}`,
        },
        () => {
          onInvalidateRef.current();
        }
      )
      .subscribe();
    return () => {
      supabase().removeChannel(channel);
    };
  }, [tripId]);
}
