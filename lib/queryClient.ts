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
import { QueryClient, QueryCache, MutationCache } from '@tanstack/react-query';
import type { QueryCacheNotifyEvent } from '@tanstack/react-query';
import { isWithinAppQueryBootQuietPeriod } from '@/lib/hooks/appQueryGateState';
import { logger } from '@/lib/logger';
import {
  recordInvalidateQueries,
  recordInvalidationStorm,
  recordRefetchQueries,
  recordSetQueryData,
} from '@/lib/platform/scalability/queryCacheMetrics';

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

/** Threshold in ms above which a query is flagged as slow in dev. */
const SLOW_QUERY_WARN_MS = 3_000;

/** Multi-hop RPCs that routinely exceed 3s — suppress dev noise on boot. */
const KNOWN_SLOW_QUERY_KEY_FRAGMENTS = ['"market"'] as const;

/** Burst window for invalidation storm detection. */
const INVALIDATION_STORM_WINDOW_MS = 1_000;
const INVALIDATION_STORM_THRESHOLD = 20;

/** Always-on cache counters for Platform Health (P0). */
function attachPlatformCacheMetrics(client: QueryClient): void {
  let stormWindowStart = 0;
  let stormCount = 0;
  let stormLogged = false;

  const origInvalidate = client.invalidateQueries.bind(client);
  (client as unknown as { invalidateQueries: typeof origInvalidate }).invalidateQueries = function (...args) {
    recordInvalidateQueries();
    const now = Date.now();
    if (now - stormWindowStart > INVALIDATION_STORM_WINDOW_MS) {
      stormWindowStart = now;
      stormCount = 0;
      stormLogged = false;
    }
    stormCount += 1;
    if (stormCount >= INVALIDATION_STORM_THRESHOLD && !stormLogged) {
      stormLogged = true;
      recordInvalidationStorm();
      if (__DEV__) {
        console.warn(
          `[query] invalidation storm: ${stormCount}+ invalidations in 1s — check realtime subscriptions`,
          args[0],
        );
      }
    }
    return origInvalidate(...args);
  };

  const origSetQueryData = client.setQueryData.bind(client);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (client as any).setQueryData = (...args: Parameters<typeof origSetQueryData>) => {
    recordSetQueryData();
    return origSetQueryData(...args);
  };

  const origRefetch = client.refetchQueries.bind(client);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (client as any).refetchQueries = (...args: Parameters<typeof origRefetch>) => {
    recordRefetchQueries();
    return origRefetch(...args);
  };
}

/** Attach a dev-only observer that logs slow fetches and failed queries. */
function attachDevObserver(client: QueryClient): void {
  if (!__DEV__) return;
  const startTimes = new Map<string, number>();
  client.getQueryCache().subscribe((event: QueryCacheNotifyEvent) => {
    if (event.type !== 'updated') return;
    const key = JSON.stringify(event.query.queryKey);
    const { fetchStatus, status, error } = event.query.state;
    if (fetchStatus === 'fetching' && !startTimes.has(key)) {
      startTimes.set(key, Date.now());
    } else if (fetchStatus === 'idle') {
      const start = startTimes.get(key);
      if (start !== undefined) {
        const elapsed = Date.now() - start;
        startTimes.delete(key);
        if (elapsed > SLOW_QUERY_WARN_MS) {
          const isKnownSlow =
            KNOWN_SLOW_QUERY_KEY_FRAGMENTS.some((frag) => key.includes(frag)) &&
            (isWithinAppQueryBootQuietPeriod() || elapsed < 8_000);
          if (!isKnownSlow) {
            console.warn(`[query] slow fetch ${elapsed}ms`, key.slice(0, 120));
          }
        }
      }
      if (status === 'error') {
        console.warn('[query] fetch error', key.slice(0, 120), error);
      }
    }
  });
}

/**
 * Aborted fetches are not failures — TanStack cancels in-flight requests when a
 * screen unmounts mid-navigation, and Safari surfaces that as `AbortError: Fetch
 * is aborted`. Reporting them created pure Sentry noise (GX-PULSE-1E / 1F).
 */
function isAbortError(error: unknown): boolean {
  if (typeof DOMException !== 'undefined' && error instanceof DOMException) {
    if (error.name === 'AbortError') return true;
  }
  const name = (error as { name?: unknown } | null)?.name;
  if (name === 'AbortError' || name === 'CanceledError') return true;
  const message =
    error instanceof Error ? error.message : String(error ?? '');
  return /\bAbortError\b|Fetch is aborted|The operation was aborted|signal is aborted/i.test(
    message,
  );
}

export function makeQueryClient() {
  const client = new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        if (isAbortError(error)) return;
        logger.error('[query] fetch failed', {
          error: error instanceof Error ? error : new Error(String(error)),
          queryKey: JSON.stringify(query.queryKey),
        });
      },
    }),
    mutationCache: new MutationCache({
      onError: (error) => {
        if (isAbortError(error)) return;
        logger.error('[mutation] failed', {
          error: error instanceof Error ? error : new Error(String(error)),
        });
      },
    }),
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
  attachPlatformCacheMetrics(client);
  attachDevObserver(client);
  return client;
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
