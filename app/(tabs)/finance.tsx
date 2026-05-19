import { LazyRouteScreen } from '@/components/LazyRouteScreen';

/** Thin route — Suspense splash while Metro bundles FinanceScreen. */
export default function FinanceTab() {
  return (
    <LazyRouteScreen
      loader={() =>
        import('@/features/finance/components/FinanceScreen').then((m) => ({
          default: m.FinanceScreen,
        }))
      }
      message="Loading fiscal…"
    />
  );
}
