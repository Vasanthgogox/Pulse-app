/**
 * Persist and restore the last visited main tab route.
 *
 * On native, the app always cold-starts at `app/index.tsx` (the `/` route).
 * Without persistence, every cold start lands on the hardcoded default tab.
 * This module remembers which tab the user was on and restores it on next launch.
 *
 * Only the three bookmarkable tabs (Trips, Finance, Network) are tracked.
 * Restoring a modal or detail page on cold start would cause a broken back-stack,
 * so only top-level tab routes are persisted.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  BOOKMARKABLE_TABS,
  DEFAULT_DISPATCHER_ROUTE,
  type BookmarkableTab,
} from './routes';

const STORAGE_KEY = 'app:last_tab_route';

function isBookmarkableTab(route: string): route is BookmarkableTab {
  return (BOOKMARKABLE_TABS as readonly string[]).includes(route);
}

/**
 * Persist the current tab route so it can be restored on next cold start.
 * Silently ignores routes that are not bookmarkable tabs.
 */
export async function saveLastTabRoute(route: string): Promise<void> {
  if (!isBookmarkableTab(route)) return;
  await AsyncStorage.setItem(STORAGE_KEY, route).catch(() => {});
}

/**
 * Returns the last persisted tab route, or the default dispatcher route
 * if nothing has been saved yet (e.g. first launch).
 */
export async function getLastTabRoute(): Promise<BookmarkableTab> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored && isBookmarkableTab(stored)) return stored;
  } catch {
    // Storage unavailable (e.g. test environment) — use default
  }
  return DEFAULT_DISPATCHER_ROUTE;
}
