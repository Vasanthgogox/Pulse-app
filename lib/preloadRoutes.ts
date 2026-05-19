/**
 * Warm dispatcher stack routes after boot / tab mount so navigation
 * does not show a blank scene while Metro bundles.
 */

const loaded = new Set<string>();

function preloadOnce(key: string, loader: () => Promise<unknown>): void {
  if (loaded.has(key)) return;
  loaded.add(key);
  void loader();
}

export function preloadPulseLoadsRoute(): void {
  preloadOnce('pulse-loads', () => import('@/app/pulse-loads/index'));
}

export function preloadTabsScreens(): void {
  preloadOnce('trips-tab', () => import('@/app/(tabs)/_trips-screen'));
  preloadOnce('network-tab', () => import('@/app/(tabs)/_network-screen'));
  preloadOnce('finance-tab', () =>
    import('@/features/finance/components/FinanceScreen'),
  );
  preloadOnce('profile-tab', () => import('@/app/(tabs)/profile'));
}

export function preloadDispatcherStackRoutes(): void {
  preloadPulseLoadsRoute();
  preloadTabsScreens();

  preloadOnce('create-indent', () => import('@/app/create-indent/index'));
  preloadOnce('add-trip', () => import('@/app/add-trip/index'));
  preloadOnce('load-board', () => import('@/app/load-board/index'));
  preloadOnce('log-incoming-pods', () => import('@/app/log-incoming-pods/index'));
  preloadOnce('pod-reconciliation', () => import('@/app/pod-reconciliation/index'));
  preloadOnce('invoicing-execute', () => import('@/app/invoicing-execute/index'));
  preloadOnce('from-clients', () => import('@/app/from-clients/index'));
  preloadOnce('trip-detail', () => import('@/app/trip/[id]'));
  preloadOnce('chat', () => import('@/app/chat'));
  preloadOnce('indent-detail', () => import('@/app/indent/[id]'));
  preloadOnce('client-detail', () => import('@/app/client/[id]'));
  preloadOnce('supplier-detail', () => import('@/app/supplier/[id]'));
  preloadOnce('driver-detail', () => import('@/app/driver/[id]'));
  preloadOnce('vehicle-detail', () => import('@/app/vehicle/[id]'));
  preloadOnce('create-post', () => import('@/app/(modals)/create-post'));
  preloadOnce('ledger-sync', () => import('@/app/(modals)/ledger-sync'));
  preloadOnce('notifications', () => import('@/app/notifications/index'));
  preloadOnce('network-user', () => import('@/app/network-user/index'));
  preloadOnce('branding-settings', () => import('@/app/branding-settings/index'));
  preloadOnce('milestone', () => import('@/app/milestone/index'));
  preloadOnce('finance-entry', () => import('@/app/finance-entry/[id]'));
  preloadOnce('trip-ledger', () => import('@/app/trip-ledger/[id]'));
  preloadOnce('public-profile', () => import('@/app/public-profile/[type]/[id]'));
  preloadOnce('invoicing-pdf', () => import('@/app/invoicing/pdf-preview'));
}

/** Preload everything reachable from the dispatcher shell (call after tabs mount). */
export function preloadDispatcherNavigationGraph(): void {
  preloadDispatcherStackRoutes();
}
