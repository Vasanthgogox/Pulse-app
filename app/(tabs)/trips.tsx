import { lazy, Suspense } from 'react';
import { SceneLoadingSplash } from '@/components/chromeLoadingScreens';

const TripsScreen = lazy(() => import('./_trips-screen'));

/** Thin route — module-level lazy so Suspense never re-fires on tab remount. */
export default function TripsTab() {
  return (
    <Suspense fallback={<SceneLoadingSplash variant="preparing" message="Loading trips…" />}>
      <TripsScreen />
    </Suspense>
  );
}
