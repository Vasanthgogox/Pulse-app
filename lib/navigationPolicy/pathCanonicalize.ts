/**
 * Normalize browser / Expo href pathnames to a canonical key for policy matching.
 *
 * - Strips `(tabs)` / `(modals)` groups (web paths are group-free).
 * - Preserves `(driver)` so driver home stays distinct from boot `/` (RFC §4.7).
 */

import type { CanonicalPath } from '@/lib/navigationPolicy/types';

/** Strip only tabs/modals groups — not (driver). */
const STRIPPABLE_GROUP_RE = /\/\((tabs|modals)\)/g;

/**
 * Normalize pathname: strip tabs/modals groups, collapse slashes, drop trailing slash.
 */
export function stripExpoGroups(pathname: string): string {
  let path = pathname.trim();
  if (!path.startsWith('/')) path = `/${path}`;
  path = path.replace(STRIPPABLE_GROUP_RE, '');
  path = path.replace(/\/{2,}/g, '/');
  if (path.length > 1 && path.endsWith('/')) {
    path = path.slice(0, -1);
  }
  return path === '' ? '/' : path;
}

/**
 * Canonicalize a raw pathname (search/hash ignored for matching key).
 */
export function canonicalizePath(rawPathname: string): CanonicalPath {
  const withoutQuery = rawPathname.split('?')[0]?.split('#')[0] ?? rawPathname;
  const path = stripExpoGroups(withoutQuery);
  return { path, params: {} };
}

/**
 * Match a canonical path against a policy pattern.
 * Exact: `/sign-in`
 * Param: `/trip/:id` → params.id
 */
export function matchPattern(
  canonicalPath: string,
  pattern: string,
): Record<string, string> | null {
  const pathParts = canonicalPath.split('/').filter(Boolean);
  const patternParts = pattern.split('/').filter(Boolean);

  if (canonicalPath === '/' && pattern === '/') return {};

  if (pathParts.length !== patternParts.length) {
    return null;
  }

  const params: Record<string, string> = {};
  for (let i = 0; i < patternParts.length; i++) {
    const pp = patternParts[i]!;
    const cp = pathParts[i]!;
    if (pp.startsWith(':')) {
      params[pp.slice(1)] = decodeURIComponent(cp);
      continue;
    }
    if (pp !== cp) return null;
  }
  return params;
}

/** True if pattern has at least one `:param` segment. */
export function isParameterizedPattern(pattern: string): boolean {
  return pattern.split('/').some((p) => p.startsWith(':'));
}
