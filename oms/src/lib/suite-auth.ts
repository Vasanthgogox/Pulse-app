/** Platform auth entry — Commerce shares Pulse Identity on the same origin. */

export function buildPlatformSignInUrl(returnTo: string): string {
  const params = new URLSearchParams({
    product: 'commerce',
    returnTo,
  });
  return `/sign-in?${params.toString()}`;
}

export function buildPlatformSignUpUrl(returnTo: string): string {
  const params = new URLSearchParams({
    product: 'commerce',
    returnTo,
  });
  return `/sign-up?${params.toString()}`;
}

/** Navigate to Pulse Core on the shared origin. */
export function buildPulseCoreUrl(path = '/'): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return normalized;
}
