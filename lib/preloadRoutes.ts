/**
 * On-demand route warm-up only. Do NOT fire many dynamic imports at once —
 * each tab/stack screen is ~3k modules and parallel preloads OOM Metro in dev.
 */

const loaded = new Set<string>();

function preloadOnce(key: string, loader: () => Promise<unknown>): void {
  if (loaded.has(key)) return;
  loaded.add(key);
  void loader();
}

export type PreloadableTab = 'trips' | 'network' | 'finance';

const TAB_LOADERS: Record<PreloadableTab, () => Promise<unknown>> = {
  trips: () => import('@/app/(tabs)/_trips-screen'),
  network: () => import('@/app/(tabs)/_network-screen'),
  finance: () => import('@/features/finance/components/FinanceScreen'),
};

/** Preload one dock tab chunk (call on tab press / hover — never all tabs at once). */
export function preloadTabScreen(tab: PreloadableTab): void {
  preloadOnce(`tab-${tab}`, TAB_LOADERS[tab]);
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
