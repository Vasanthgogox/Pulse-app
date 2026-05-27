/**
 * Module-level guard so `app/index.tsx` redirects once per user session,
 * even when React Navigation keeps multiple Index mounts alive (web HMR, stack).
 */
let bootRedirectUid: string | null = null;

export function hasIndexBootRedirected(uid: string): boolean {
  return bootRedirectUid === uid;
}

/** Returns true when this caller should perform the redirect. */
export function claimIndexBootRedirect(uid: string): boolean {
  if (bootRedirectUid === uid) return false;
  bootRedirectUid = uid;
  return true;
}

export function resetIndexBootRedirect(): void {
  bootRedirectUid = null;
}

/** True when the app is already past the index boot gate. */
export function isPastIndexBootPath(pathname: string): boolean {
  if (!pathname || pathname === '/') return false;
  return (
    pathname.startsWith('/(tabs)') ||
    pathname.startsWith('/(driver)') ||
    pathname.startsWith('/(modals)') ||
    pathname === '/finance' ||
    pathname === '/trips' ||
    pathname === '/network' ||
    pathname === '/resources' ||
    pathname.startsWith('/sign-in') ||
    pathname.startsWith('/sign-up') ||
    pathname.startsWith('/onboarding') ||
    pathname.startsWith('/welcome') ||
    pathname.startsWith('/terminal-website') ||
    pathname.startsWith('/auth/')
  );
}
