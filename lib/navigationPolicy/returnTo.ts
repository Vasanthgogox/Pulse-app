/**
 * RFC §5.4 — safe returnTo for anonymous → sign-in redirects.
 * Relative same-origin paths only; no hash tokens.
 */

import { canonicalizePath } from '@/lib/navigationPolicy/pathCanonicalize';
import { SIGN_IN_PATH } from '@/lib/navigationPolicy/types';
import { normalizeSuiteReturnTo } from '@/lib/suite/suitePaths';

export function isPublicAuthOrMarketingPath(canonicalPath: string): boolean {
  if (canonicalPath === '/' || canonicalPath === '/terminal-website') return true;
  if (canonicalPath === '/welcome') return true;
  if (canonicalPath === '/sign-in' || canonicalPath.startsWith('/sign-in/')) return true;
  if (canonicalPath === '/sign-up' || canonicalPath.startsWith('/sign-up/')) return true;
  if (canonicalPath === '/forgot-password') return true;
  if (canonicalPath === '/driver-sign-in') return true;
  if (canonicalPath === '/driver-signup' || canonicalPath.startsWith('/driver-signup/')) {
    return true;
  }
  if (canonicalPath.startsWith('/auth/')) return true;
  if (canonicalPath === '/onboarding' || canonicalPath.startsWith('/onboarding/')) {
    return true;
  }
  return false;
}

/** Allow-list relative path. Drops query/hash. */
export function sanitizeReturnTo(rawPathname: string): string | null {
  const pathOnly = (rawPathname.split('?')[0] ?? '').split('#')[0] ?? '';
  const trimmed = pathOnly.trim();
  // Reject schemes / open redirects before path normalize (canonicalize may mask them).
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return null;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) return null;
  const canonical = canonicalizePath(trimmed).path;
  const safe = normalizeSuiteReturnTo(canonical);
  if (!safe || safe === '/') return null;
  if (isPublicAuthOrMarketingPath(safe)) return null;
  return safe;
}

/** Sign-in href for anonymous deny. Includes returnTo when safe. */
export function buildSignInHrefWithReturnTo(rawPathname: string): string {
  const safe = sanitizeReturnTo(rawPathname);
  if (!safe) return SIGN_IN_PATH;
  return `${SIGN_IN_PATH}?returnTo=${encodeURIComponent(safe)}`;
}
