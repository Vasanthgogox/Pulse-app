import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchTripLiveTrackingSeed } from '@/lib/queries/fetchTripLiveTrackingSeed';
import { queryKeys } from '@/lib/queryKeys';
import {
  infrastructureRetryDelay,
  infrastructureShouldRetry,
} from '@/lib/queryRetry';

const SEED_STALE_MS = 30_000;

export function tripLiveTrackingSeedQueryKey(tripId: string, driverId: string | null) {
  return queryKeys.tracking.tripLiveSeed(tripId, driverId ?? '');
}

export function useTripLiveTrackingSeedQuery(
  tripId: string | null,
  driverId: string | null,
  enabled: boolean,
) {
  const normalizedTripId = tripId ?? '';
  const normalizedDriverId = driverId ?? '';

  return useQuery({
    queryKey: tripLiveTrackingSeedQueryKey(normalizedTripId, normalizedDriverId),
    queryFn: () => fetchTripLiveTrackingSeed(normalizedTripId, driverId),
    enabled: enabled && !!normalizedTripId,
    staleTime: SEED_STALE_MS,
    gcTime: 5 * 60_000,
    retry: infrastructureShouldRetry,
    retryDelay: infrastructureRetryDelay,
    refetchOnWindowFocus: false,
  });
}

export function useInvalidateTripLiveTrackingSeed() {
  const qc = useQueryClient();
  return (tripId: string, driverId: string | null) => {
    void qc.invalidateQueries({
      queryKey: tripLiveTrackingSeedQueryKey(tripId, driverId),
    });
  };
}
