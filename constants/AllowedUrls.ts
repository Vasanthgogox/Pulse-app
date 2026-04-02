/**
 * Allowlist for external URLs opened by ExternalLink / WebBrowser.
 * Only these prefixes are opened; any other href is ignored (security: no user-controlled URLs).
 * Add new app-approved URLs here (e.g. privacy policy, terms, docs).
 */
const ALLOWED_URL_PREFIXES: readonly string[] = [
  'https://docs.expo.io/',
  'https://expo.dev/',
  'https://reactnative.dev/',
];

export function isUrlAllowed(href: string): boolean {
  const trimmed = href?.trim();
  if (!trimmed || !trimmed.startsWith('http')) return false;
  return ALLOWED_URL_PREFIXES.some((prefix) => trimmed.startsWith(prefix));
}
