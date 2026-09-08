import { ROUTES } from '@/lib/routes';

/**
 * Root stack routes that render {@link RootOverlayTabBar} on desktop web.
 * Navigation overlay and route loading must not cover that chrome.
 */
export const ROOT_TOP_NAV_PATHS = [
  ROUTES.PULSE_LOADS,
  ROUTES.FIND_LOADS,
  '/pod-reconciliation',
  '/invoicing-execute',
  '/log-incoming-pods',
] as const;

export function pathnameHasRootTopNav(pathname: string): boolean {
  if (!pathname) return false;
  return ROOT_TOP_NAV_PATHS.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}
