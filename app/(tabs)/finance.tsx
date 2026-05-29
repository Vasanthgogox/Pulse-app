import { createPreloadedTabRoute } from '@/lib/createPreloadedTabRoute';

const { TabRoute: FinanceTab, preload: preloadFinanceTabRoute } =
  createPreloadedTabRoute(
    () =>
      import('@/features/finance/components/FinanceScreen').then((mod) => ({
        default: mod.FinanceScreen,
      })),
    'finance',
  );

/** Warm Cash tab chunk (same module as {@link preloadTabScreen} `finance`). */
export { preloadFinanceTabRoute };
export default FinanceTab;
