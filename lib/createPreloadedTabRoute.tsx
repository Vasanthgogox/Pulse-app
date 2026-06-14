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
    if (Resolved) return Promise.resolve(Resolved);
    if (!promise) {
      promise = loader()
        .then((mod) => {
          Resolved = mod.default;
          return mod.default;
        })
        .catch((err) => {
          promise = null;
          throw err;
        });
    }
    return promise;
  }

  function preload(): void {
    void loadChunk();
  }

  function TabRoute(): React.ReactElement | null {
    const [Screen, setScreen] = useState<ComponentType<object> | null>(
      () => Resolved,
    );
    useEffect(() => {
      if (Screen) return;
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
