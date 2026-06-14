/**
 * Driver app home: linked driver rows for the authenticated user (GET drivers?user_id=).
 * Distinct from org-scoped {@link useDriversQuery} in useDriversQuery.ts (dispatcher fleet list).
 */
import type { DriverRow } from '@/features/drivers/services/drivers.service';
import { getLinkedDriversForCurrentUser } from '@/features/drivers/services/drivers.service';
import { useAuth } from '@/contexts/AuthContext';
import { useAppStateIsActive } from '@/lib/hooks/useAppStateIsActive';
import { queryKeys } from '@/lib/queryKeys';
import {
  infrastructureRetryDelay,
  infrastructureShouldRetry,
} from '@/lib/queryRetry';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

const STALE_MS = 30_000;
const POLL_MS = 120_000;
const EMPTY_DRIVERS: DriverRow[] = [];

export function driverHomeLinkedDriversQueryKey(userId: string) {
  return queryKeys.driverApp.linkedDrivers(userId);
}

export function useDriverHomeDriversQuery(userId: string | null) {
  const appActive = useAppStateIsActive();
  const { status } = useAuth();
  const uid = userId ?? '';

  const query = useQuery({
    queryKey: driverHomeLinkedDriversQueryKey(uid),
    queryFn: async () => {
      const { error, drivers } = await getLinkedDriversForCurrentUser(uid);
      if (error) throw error;
      return drivers ?? [];
    },
    enabled: !!uid && status !== 'restoring',
    staleTime: STALE_MS,
    gcTime: 10 * 60_000,
    retry: infrastructureShouldRetry,
    retryDelay: infrastructureRetryDelay,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    refetchInterval: appActive ? POLL_MS : false,
    placeholderData: keepPreviousData,
  });

  const activeLinkedDrivers = useMemo(
    () => (query.data ?? []).filter((d) => !d.left_at),
    [query.data],
  );

  const driverIdsKey = useMemo(
    () =>
      activeLinkedDrivers
        .map((d) => d.id)
        .sort()
        .join(','),
    [activeLinkedDrivers],
  );

  const refreshLinkedDrivers = useCallback(async () => {
    await query.refetch();
  }, [query.refetch]);

  return {
    isPending: query.isPending,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    isFetched: query.isFetched,
    isSuccess: query.isSuccess,
    fetchStatus: query.fetchStatus,
    dataUpdatedAt: query.dataUpdatedAt,
    error: query.error,
    refetch: query.refetch,
    drivers: query.data ?? EMPTY_DRIVERS,
    activeLinkedDrivers,
    primaryDriver: activeLinkedDrivers[0] ?? null,
    driverIdsKey,
    refreshLinkedDrivers,
  };
}

export function useInvalidateDriverHomeDrivers() {
  const qc = useQueryClient();
  return (userId: string) => {
    void qc.invalidateQueries({ queryKey: driverHomeLinkedDriversQueryKey(userId) });
  };
}
