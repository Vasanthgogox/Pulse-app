/**
 * Supabase Realtime subscriptions for trips.
 * Per-trip subscription passes the Postgres payload so callers can merge silently.
 */
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
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

/** Subscribe to a single trip by id; listener receives each Realtime payload. */
export function useRealtimeTrip(
  tripId: string | null,
  onChange: (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void,
) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

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
      (payload) => {
        onChangeRef.current(payload);
      }
    );
  }, [tripId]);
}

/** Subscribe to trip_documents for a single trip; fires onChange on any insert/update/delete. */
export function useRealtimeTripDocuments(
  tripId: string | null,
  onChange: (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void,
) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!tripId) return;
    return subscribeSharedPostgresChanges(
      `trip-documents:${tripId}`,
      [
        {
          event: '*',
          schema: 'public',
          table: 'trip_documents',
          filter: `trip_id=eq.${tripId}`,
        },
      ],
      (payload) => {
        onChangeRef.current(payload);
      }
    );
  }, [tripId]);
}

/**
 * Subscribe to driver location INSERTs for a specific trip (and optional driver fallback).
 *
 * Phase 3c: callback receives the full Realtime payload so callers can merge the new
 * location row directly into state without triggering a DB round trip.
 *
 * Dual-filter note: when both tripId and driverId are set, Supabase may emit the same
 * INSERT event twice (once per matching filter). Callers must deduplicate by row id.
 */
export function useRealtimeDriverLocations(
  tripId: string | null,
  driverId: string | null,
  onEvent: (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void,
) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

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
    return subscribeSharedPostgresChanges(key, specs, (payload) => {
      onEventRef.current(payload);
    });
  }, [tripId, driverId]);
}
