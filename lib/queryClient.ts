/**
 * TanStack Query client with app-wide defaults + AsyncStorage persistence.
 * Realtime invalidates live data; persistence gives instant cold-open UX.
 *
 * Stale tiers:
 *   realtime  — Realtime subscription invalidates; staleTime high so no extra background refetch
 *   frequent  — changes via mutations + manual invalidation (drivers, vehicles)
 *   moderate  — rarely mutated (suppliers, clients, org members)
 *   slow      — almost never changes (org profile, capabilities)
 */
import { QueryClient } from '@tanstack/react-query';

/** Shared stale-time constants — import in query hooks to apply per-query tiers. */
export const STALE = {
  /** Data covered by Realtime: don't background-refetch on focus; Realtime handles freshness. */
  realtime: 5 * 60_000,       // 5 min — Realtime invalidates; this is just the fallback
  /** Mutations always invalidate; 2 min background safety net. */
  frequent: 2 * 60_000,
  /** Rarely mutated entities. */
  moderate: 10 * 60_000,      // 10 min
  /** Near-static: org profile, feature flags. */
  slow: 30 * 60_000,          // 30 min
} as const;

/** gcTime must exceed persister maxAge, otherwise persistence is a no-op. */
const GC_TIME_MS = 24 * 60 * 60 * 1000; // 24 h — keeps data alive for next cold open

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: STALE.moderate,
        gcTime: GC_TIME_MS,
        retry: 1,
        retryDelay: 1000,
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
