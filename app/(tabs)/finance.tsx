import { lazy, Suspense } from 'react';
import { SceneLoadingSplash } from '@/components/chromeLoadingScreens';

const FinanceScreen = lazy(() =>
  import('@/features/finance/components/FinanceScreen').then((m) => ({
    default: m.FinanceScreen,
  }))
);

/** Thin route — module-level lazy so Suspense never re-fires on tab remount. */
export default function FinanceTab() {
  return (
    <Suspense fallback={<SceneLoadingSplash variant="preparing" message="Loading fiscal…" />}>
      <FinanceScreen />
    </Suspense>
  );
}
