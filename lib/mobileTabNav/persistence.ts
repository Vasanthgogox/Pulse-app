/**
 * Mobile tab persistence — screens stay mounted after first paint; chunks may still lazy-load.
 * Used with Tabs `lazy: false` (native) + `freezeOnBlur` + `detachInactiveScreens: false`.
 */
const hydratedTabs = new Set<string>();

export function markMobileTabHydrated(tabName: string): void {
  hydratedTabs.add(tabName);
}

export function isMobileTabHydrated(tabName: string): boolean {
  return hydratedTabs.has(tabName);
}

export function getHydratedMobileTabs(): ReadonlySet<string> {
  return hydratedTabs;
}
