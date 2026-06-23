/**
 * Persist and restore the last visited dispatcher route (tabs + network hub).
 *
 * On native, the app cold-starts at `app/index.tsx` (`/`). This module remembers
 * the last bookmarkable screen and restores it on next launch.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  BOOKMARKABLE_TABS,
  DEFAULT_DISPATCHER_ROUTE,
  ROUTES,
  type BookmarkableTab,
} from './routes';

const STORAGE_KEY = 'app:last_tab_route';

function isBookmarkableTab(route: string): route is BookmarkableTab {
  return (BOOKMARKABLE_TABS as readonly string[]).includes(route);
}

function isNetworkHubRoute(route: string): boolean {
  return (
    route === ROUTES.networkOrgHub('details') ||
    route.startsWith('/(tabs)/network/hub') ||
    route.startsWith('/network/hub')
  );
}

/** Map current pathname to a storable dispatcher route (tabs or network hub). */
export function resolveRestorableDispatcherRoute(pathname: string): string | null {
  const path = pathname?.trim() || '';
  if (!path || path === '/') return null;

  if (path.includes('/network/hub')) {
    const tabMatch = path.match(/[?&]tab=([^&]+)/);
    const tab = tabMatch?.[1];
    const allowed = new Set([
      'details',
      'team',
      'profile',
      'sales',
      'goals',
      'asset',
      'connections',
      'grow',
      'chat',
    ]);
    if (tab && allowed.has(tab)) {
      return ROUTES.networkOrgHub(tab as Parameters<typeof ROUTES.networkOrgHub>[0]);
    }
    return ROUTES.networkOrgHub('details');
  }

  if (path === '/trips' || path.endsWith('/trips') || path.includes('/(tabs)/trips')) {
    return ROUTES.TABS.TRIPS;
  }
  if (path === '/finance' || path.endsWith('/finance') || path.includes('/(tabs)/finance')) {
    return ROUTES.TABS.FINANCE;
  }
  if (path === '/network' || path.endsWith('/network') || path.includes('/(tabs)/network')) {
    return ROUTES.TABS.NETWORK;
  }

  return null;
}

function isRestorableRoute(route: string): boolean {
  return isBookmarkableTab(route) || isNetworkHubRoute(route);
}

/**
 * Persist the current dispatcher route so it can be restored on cold start.
 */
export async function saveLastTabRoute(route: string): Promise<void> {
  if (!isRestorableRoute(route)) return;
  await AsyncStorage.setItem(STORAGE_KEY, route).catch(() => {});
}

/**
 * Returns the last persisted dispatcher route, or the default trips tab.
 */
export async function getLastTabRoute(): Promise<string> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored && isRestorableRoute(stored)) return stored;
  } catch {
    // Storage unavailable — use default
  }
  return DEFAULT_DISPATCHER_ROUTE;
}

/** True when route is the org network hub (any hub tab). */
export function isStoredNetworkHubRoute(route: string): boolean {
  return isNetworkHubRoute(route);
}
