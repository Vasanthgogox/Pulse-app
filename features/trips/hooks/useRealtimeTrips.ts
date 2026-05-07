/**
 * Supabase Realtime subscriptions for trips. Call onInvalidate when data changes (refetch once).
 */
import { subscribeSharedPostgresChanges } from '@/lib/realtimeRegistry';
import { useEffect, useRef } from 'react';

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

/** Subscribe to driver location inserts for a specific trip (and optional driver fallback). */
export function useRealtimeDriverLocations(
  tripId: string | null,
  driverId: string | null,
  onInvalidate: () => void,
) {
  const onInvalidateRef = useRef(onInvalidate);
  onInvalidateRef.current = onInvalidate;

  useEffect(() => {
    if (!tripId && !driverId) return;
    const specs: Array<{
      event: '*' | 'INSERT' | 'UPDATE' | 'DELETE';
      schema: string;
      table: string;
      filter?: string;
    }> = [];
    if (tripId) {
      specs.push({
        event: 'INSERT',
        schema: 'public',
        table: 'driver_locations',
        filter: `trip_id=eq.${tripId}`,
      });
    }
    if (driverId) {
      specs.push({
        event: 'INSERT',
        schema: 'public',
        table: 'driver_locations',
        filter: `driver_id=eq.${driverId}`,
      });
    }

    const key = `driver_locations:${tripId ?? 'none'}:${driverId ?? 'none'}`;
    return subscribeSharedPostgresChanges(key, specs, () => {
      onInvalidateRef.current();
    });
  }, [tripId, driverId]);
}
