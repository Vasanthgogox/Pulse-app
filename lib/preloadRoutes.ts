/**
 * On-demand route warm-up only. Do NOT fire many dynamic imports at once —
 * each tab/stack screen is ~3k modules and parallel preloads OOM Metro in dev.
 */
import {
  preloadFinanceWarmup,
  scheduleIdleWork,
} from '@/lib/preloadFinanceWarmup';
import type { QueryClient } from '@tanstack/react-query';

const loaded = new Set<string>();

function preloadOnce(key: string, loader: () => Promise<unknown>): void {
  if (loaded.has(key)) return;
  loaded.add(key);
  void loader();
}

export type PreloadableTab = 'trips' | 'network' | 'finance';

/** Map bookmarkable tab routes to lazy chunk preload keys. */
export function preloadTabForRoute(route: string): void {
  if (route === '/(tabs)/finance') preloadTabScreen('finance');
  else if (route === '/(tabs)/trips') preloadTabScreen('trips');
  else if (route === '/(tabs)/network') preloadTabScreen('network');
}

const TAB_LOADERS: Record<PreloadableTab, () => Promise<unknown>> = {
  trips: () => import('@/app/(tabs)/_trips-screen'),
  network: () => import('@/app/(tabs)/_network-screen'),
  finance: () => import('@/features/finance/components/FinanceScreen'),
};

/** Preload one dock tab chunk (call on tab press / hover — never all tabs at once). */
export function preloadTabScreen(tab: PreloadableTab): void {
  preloadOnce(`tab-${tab}`, TAB_LOADERS[tab]);
}

/**
 * After auth boot, warm the fiscal chunk (and last visited tab) during idle time.
 * Never preloads all tabs — avoids Metro OOM in dev.
 */
export function scheduleDispatcherTabPreloads(
  lastTabRoute?: string,
  opts?: { queryClient?: QueryClient; orgId?: string | null },
): void {
  const run = () => {
    const orgId = opts?.orgId ?? null;
    if (opts?.queryClient && orgId) {
      preloadFinanceWarmup(opts.queryClient, orgId);
    } else {
      preloadTabScreen('finance');
    }
    if (lastTabRoute) preloadTabForRoute(lastTabRoute);
  };
  scheduleIdleWork(run);
}

export function preloadPulseLoadsRoute(): void {
  preloadOnce('pulse-loads', () => import('@/app/pulse-loads/index'));
}

/** @deprecated Bulk preload caused Metro heap OOM; use {@link preloadTabScreen} or navigate. */
export function preloadTabsScreens(): void {
  // Intentionally empty — kept so older call sites do not break.
}

/** @deprecated Bulk preload caused Metro heap OOM. */
export function preloadDispatcherStackRoutes(): void {
  // Intentionally empty.
}

/** @deprecated Bulk preload caused Metro heap OOM. */
export function preloadDispatcherNavigationGraph(): void {
  // Intentionally empty.
}
