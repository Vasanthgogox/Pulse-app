import {
  createElement,
  useEffect,
  useState,
  type ComponentType,
} from 'react';
import { SceneLoadingSplash } from '@/components/chromeLoadingScreens';
import { markMobileTabHydrated } from '@/lib/mobileTabNav/persistence';

/**
 * Tab route without React.lazy/Suspense: preload the chunk early (idle / press-in),
 * then render once resolved — avoids a suspend boundary on tab switch.
 */
export function createPreloadedTabRoute(
  loader: () => Promise<{ default: ComponentType<object> }>,
  tabName?: string,
) {
  let Resolved: ComponentType<object> | null = null;
  const promise = loader().then((mod) => {
    Resolved = mod.default;
    return mod.default;
  });

  function preload(): void {
    void promise;
  }

  function TabRoute(): React.ReactElement | null {
    const [Screen, setScreen] = useState<ComponentType<object> | null>(
      () => Resolved,
    );
    useEffect(() => {
      if (Screen) return;
      let cancelled = false;
      void promise.then((C) => {
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

  return { TabRoute, preload, promise };
}
