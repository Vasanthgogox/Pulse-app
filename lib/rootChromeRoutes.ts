import { ROUTES } from '@/lib/routes';
import { pathnameUsesExpoProductShell } from '@/lib/suite/suiteProducts';

/**
 * Root stack routes that render {@link RootOverlayTabBar} on desktop web.
 * Navigation overlay and route loading must not cover that chrome.
 * Expo product-shell routes (Invoice, POD, Finance Pro) must not be listed here.
 */
export const ROOT_TOP_NAV_PATHS = [
  ROUTES.PULSE_LOADS,
  ROUTES.FIND_LOADS,
] as const;

export function pathnameHasRootTopNav(pathname: string): boolean {
  if (!pathname) return false;
  if (pathnameUsesExpoProductShell(pathname)) return false;
  return ROOT_TOP_NAV_PATHS.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}
