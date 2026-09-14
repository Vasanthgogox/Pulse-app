import {
  createElement,
  useEffect,
  useState,
  type ComponentType,
} from 'react';
import { SceneLoadingSplash } from '@/components/chromeLoadingScreens';
import { markMobileTabHydrated } from '@/lib/mobileTabNav/persistence';

/**
 * Tab route without React.lazy/Suspense: load the chunk when the tab mounts (or
 * when {@link preload} is called explicitly). Does NOT start importing at module
 * evaluation — that previously fired 3× ~3.5k-module graphs in parallel whenever
 * Expo Router registered tab routes, starving Metro and delaying data fetches.
 */
export function createPreloadedTabRoute(
  loader: () => Promise<{ default: ComponentType<object> }>,
  tabName?: string,
) {
  let Resolved: ComponentType<object> | null = null;
  let promise: Promise<ComponentType<object>> | null = null;

  function loadChunk(): Promise<ComponentType<object>> {
    // Production: one import, reused. Dev: always read the current export so
    // Fast Refresh of the screen module is not pinned behind the first load
    // (that mismatch produced `Can't find variable: tripsMainView` on Trips).
    if (!__DEV__ && Resolved) return Promise.resolve(Resolved);
    if (!__DEV__ && promise) return promise;
    const run = loader()
      .then((mod) => {
        Resolved = mod.default;
        return mod.default;
      })
      .catch((err) => {
        if (!__DEV__) promise = null;
        throw err;
      });
    if (!__DEV__) promise = run;
    return run;
  }

  function preload(): void {
    void loadChunk();
  }

  function TabRoute(): React.ReactElement | null {
    const [Screen, setScreen] = useState<ComponentType<object> | null>(
      () => (__DEV__ ? null : Resolved),
    );
    useEffect(() => {
      let cancelled = false;
      void loadChunk().then((C) => {
        if (!cancelled) setScreen(() => C);
      });
      return () => {
        cancelled = true;
      };
    }, [Screen]);
    useEffect(() => {
      if (tabName) markMobileTabHydrated(tabName);
    }, []);

    if (!Screen) {
      return <SceneLoadingSplash variant="preparing" />;
    }
    return createElement(Screen);
  }

  return { TabRoute, preload };
}
