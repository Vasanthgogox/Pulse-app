/**
 * Lazy tab route chunks only — no finance warmup or scheduler imports
 * (keeps preloadFinanceWarmup ↔ preloadRoutes acyclic).
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

export function preloadPulseLoadsChunk(): void {
  preloadOnce('pulse-loads', () => import('@/app/pulse-loads/index'));
}
