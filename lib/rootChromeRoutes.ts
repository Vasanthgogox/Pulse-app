import { ROUTES } from '@/lib/routes';
import { pathnameUsesExpoProductShell } from '@/lib/suite/suiteProducts';

export type OverlayDockTabId =
  | 'finance'
  | 'trips'
  | 'network'
  | 'loadCenter'
  | 'compliance'
  | 'resources';

/**
 * Root stack routes that render {@link RootOverlayTabBar} on desktop web.
 * Navigation overlay and route loading must not cover that chrome.
 * Expo product-shell routes (Invoice, POD, Finance Pro) must not be listed here.
 *
 * Load Center and Compliance live outside `(tabs)`, so both must keep the same
 * primary dock — otherwise tapping Load unmounts the tabs layout and drops
 * the Compliance item.
 */
export const ROOT_TOP_NAV_PATHS = [
  ROUTES.PULSE_LOADS,
  ROUTES.FIND_LOADS,
  ROUTES.COMPLIANCE,
] as const;

export function pathnameHasRootTopNav(pathname: string): boolean {
  if (!pathname) return false;
  if (pathnameUsesExpoProductShell(pathname)) return false;
  return ROOT_TOP_NAV_PATHS.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

export function overlayActiveTab(pathname: string): OverlayDockTabId {
  if (
    pathname === ROUTES.PULSE_LOADS ||
    pathname === ROUTES.FIND_LOADS ||
    pathname.startsWith(`${ROUTES.FIND_LOADS}/`)
  ) {
    return 'loadCenter';
  }
  if (pathname === ROUTES.COMPLIANCE || pathname.startsWith(`${ROUTES.COMPLIANCE}/`)) {
    return 'compliance';
  }
  if (pathname.includes('/finance')) return 'finance';
  if (pathname.includes('/trips')) return 'trips';
  if (pathname.includes('/network') || pathname.includes('/hub')) return 'network';
  return 'loadCenter';
}

export function overlayPathForTab(tab: OverlayDockTabId): string {
  if (tab === 'finance') return ROUTES.TABS.FINANCE;
  if (tab === 'trips') return ROUTES.TABS.TRIPS;
  if (tab === 'network') return ROUTES.TABS.NETWORK;
  if (tab === 'loadCenter') return ROUTES.PULSE_LOADS;
  if (tab === 'compliance') return ROUTES.COMPLIANCE;
  return ROUTES.TABS.RESOURCES;
}
