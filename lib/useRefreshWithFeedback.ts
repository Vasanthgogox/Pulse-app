/**
 * Pull-to-refresh: cap how long the refresh spinner shows so swipe doesn't feel slow.
 * Refetch continues in background; list updates when data arrives.
 * Without this, RefreshControl stays spinning for the full network time (2–5+ seconds).
 */
import { useCallback, useState } from 'react';

const MAX_REFRESH_INDICATOR_MS = 800;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Returns { refreshing, onRefresh } so that:
 * - onRefresh calls your refetch (or multiple refetches) and sets refreshing true.
 * - refreshing becomes false after at most MAX_REFRESH_INDICATOR_MS, or when refetch settles (whichever first).
 * Use for pull-to-refresh so the spinner doesn't spin for the full request time.
 */
export function useRefreshWithFeedback(
  refetch: () => void | Promise<unknown>
): { refreshing: boolean; onRefresh: () => void } {
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    const refetchPromise = Promise.resolve(refetch());
    const timeoutPromise = delay(MAX_REFRESH_INDICATOR_MS);
    Promise.race([refetchPromise, timeoutPromise]).finally(() => {
      setRefreshing(false);
    });
  }, [refetch]);

  return { refreshing, onRefresh };
}

