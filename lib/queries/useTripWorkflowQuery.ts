/**
 * Server-authoritative workflow state for a completed trip.
 *
 * Data source:  trip_workflow_events (Postgres, append-only)
 * Cache:        TanStack Query (staleTime 30s)
 * Realtime:     subscribeSharedPostgresChanges via realtimeRegistry (shared channel, no duplication)
 * Optimistic:   caller uses recordTripWorkflowEvent() which the hook re-derives on invalidation
 *
 * Offline:      TanStack Query persister (if configured) provides stale data.
 *               AsyncStorage is NOT the source of truth for workflow state.
 */
import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { subscribeSharedPostgresChanges } from '@/lib/realtimeRegistry';
import {
  getTripWorkflowEvents,
  deriveWorkflowState,
  type TripWorkflowState,
} from '@/features/trips/services/tripWorkflow.service';

export function useTripWorkflowQuery(tripId: string | null): {
  state: TripWorkflowState | undefined;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
} {
  const qc = useQueryClient();
  const key = queryKeys.trips.workflow(tripId ?? '');

  const query = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { events, error } = await getTripWorkflowEvents(tripId!);
      if (error) throw error;
      return events;
    },
    enabled: !!tripId,
    staleTime: 30_000,
    select: deriveWorkflowState,
  });

  // Shared channel — realtimeRegistry deduplicates if multiple cards for same trip
  useEffect(() => {
    if (!tripId) return;
    return subscribeSharedPostgresChanges(
      `trip_workflow:${tripId}`,
      [
        {
          event: 'INSERT',
          schema: 'public',
          table: 'trip_workflow_events',
          filter: `trip_id=eq.${tripId}`,
        },
      ],
      () => {
        qc.invalidateQueries({ queryKey: key });
      },
    );
  }, [tripId, qc]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    state: query.data,
    isLoading: query.isLoading,
    error: query.error instanceof Error ? query.error : null,
    refetch: query.refetch,
  };
}
