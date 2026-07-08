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
