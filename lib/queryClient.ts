/**
 * TanStack Query client with app-wide defaults.
 * staleTime: 60s so refocus doesn't refetch; Realtime invalidates when DB changes.
 */
import { QueryClient } from '@tanstack/react-query';

const STALE_TIME_MS = 60 * 1000; // 60s
const GC_TIME_MS = 5 * 60 * 1000; // 5 min (formerly cacheTime)
const RETRY = 1;
const RETRY_DELAY_MS = 1000;

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: STALE_TIME_MS,
        gcTime: GC_TIME_MS,
        retry: RETRY,
        retryDelay: RETRY_DELAY_MS,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

export function getQueryClient() {
  if (typeof window === 'undefined') {
    return makeQueryClient();
  }
  if (!browserQueryClient) {
    browserQueryClient = makeQueryClient();
  }
  return browserQueryClient;
}
