/** Path helpers for suite product routing (Core, Commerce, Pilot, …). */

const DEFAULT_SUITE_RETURN_TO = '/';

/**
 * Normalize suite return paths — allow-list application-relative paths only.
 * Anything else (protocol-relative `//host`, backslash-prefixed `\host` which some
 * browsers also treat as `//host`, or absolute `http(s)://`/`javascript:`/`data:` URLs)
 * falls back to the default route. Blacklisting URL forms is easy to bypass; allow-listing
 * "starts with a single `/`" isn't.
 */
export function normalizeSuiteReturnTo(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('/')) return DEFAULT_SUITE_RETURN_TO;
  if (trimmed.startsWith('//')) return DEFAULT_SUITE_RETURN_TO;
  if (trimmed.includes('\\')) return DEFAULT_SUITE_RETURN_TO;
  return trimmed;
}

/** Paths served outside Expo Router (separate SPAs on the same origin). */
export function isSuiteExternalAppPath(path: string): boolean {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return normalized === '/oms' || normalized.startsWith('/oms/');
}

/** Open a suite product app on web (Expo Router cannot host /oms SPA routes). */
export function openSuiteProductApp(path: string): void {
  if (typeof window === 'undefined') return;
  const normalized = path.startsWith('/') ? path : `/${path}`;
  window.location.assign(normalized);
}
