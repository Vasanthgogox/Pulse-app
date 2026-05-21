import { lazy, Suspense } from 'react';
import { SceneLoadingSplash } from '@/components/chromeLoadingScreens';

const NetworkScreen = lazy(() => import('./_network-screen'));

/** Thin route — module-level lazy so Suspense never re-fires on tab remount. */
export default function NetworkTab() {
  return (
    <Suspense fallback={<SceneLoadingSplash variant="preparing" message="Loading network…" />}>
      <NetworkScreen />
    </Suspense>
  );
}
