/**
 * Single registry for dock tab screen chunks — shared by route files and
 * preloadTabScreen so finger-down warm-up resolves the same promise as navigation.
 */
import type { ComponentType } from 'react';

export type PreloadableTab = 'trips' | 'network' | 'finance';

type TabChunkEntry = {
  loader: () => Promise<{ default: ComponentType<object> }>;
  promise: Promise<ComponentType<object>> | null;
  resolved: ComponentType<object> | null;
  tabName: string;
};

const TAB_CHUNKS: Record<PreloadableTab, TabChunkEntry> = {
  trips: {
    loader: () => import('@/features/trips/screens/TripsScreen'),
    promise: null,
    resolved: null,
    tabName: 'trips',
  },
  network: {
    loader: () => import('@/features/network/screens/NetworkScreen'),
    promise: null,
    resolved: null,
    tabName: 'network',
  },
  finance: {
    loader: () =>
      import('@/features/finance/components/FinanceScreen').then((mod) => ({
        default: mod.FinanceScreen,
      })),
    promise: null,
    resolved: null,
    tabName: 'finance',
  },
};

export function getTabChunkTabName(tab: PreloadableTab): string {
  return TAB_CHUNKS[tab].tabName;
}

/** Load (or return cached) a tab screen component. Clears promise on failure so retries work. */
export function loadTabChunk(tab: PreloadableTab): Promise<ComponentType<object>> {
  const entry = TAB_CHUNKS[tab];
  if (entry.resolved) return Promise.resolve(entry.resolved);
  if (entry.promise) return entry.promise;

  entry.promise = entry
    .loader()
    .then((mod) => {
      entry.resolved = mod.default;
      return mod.default;
    })
    .catch((err) => {
      entry.promise = null;
      throw err;
    });

  return entry.promise;
}

/** Synchronous read when chunk was preloaded before the route module mounted. */
export function getResolvedTabScreen(tab: PreloadableTab): ComponentType<object> | null {
  return TAB_CHUNKS[tab].resolved;
}

/** Fire-and-forget warm-up for tab press / idle preload. */
export function preloadTabScreen(tab: PreloadableTab): void {
  void loadTabChunk(tab).catch(() => {
    // Transient Metro chunk failures are retried on next navigation / press-in.
  });
}

/** Reset a tab chunk after Metro HMR module-ID drift (dev recovery). */
export function resetTabChunk(tab: PreloadableTab): void {
  const entry = TAB_CHUNKS[tab];
  entry.promise = null;
  entry.resolved = null;
}
