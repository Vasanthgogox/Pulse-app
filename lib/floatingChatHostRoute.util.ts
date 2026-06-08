import { ROUTES } from '@/lib/routes';

/** Tab/stack routes where the floating chat preview FAB is shown (dispatcher only). */
export function isFloatingChatHostRoute(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  if (pathname.includes('chat')) return false;
  if (pathname.includes('(driver)')) return false;
  const p = pathname.replace(/\/$/, '');
  const ungrouped = p.replace('/(tabs)', '');
  return (
    p === ROUTES.TABS.FINANCE ||
    p === ROUTES.TABS.TRIPS ||
    p === ROUTES.TABS.NETWORK ||
    p === ROUTES.PULSE_LOADS ||
    ungrouped === '/finance' ||
    ungrouped === '/trips' ||
    ungrouped === '/network' ||
    ungrouped === ROUTES.PULSE_LOADS
  );
}
