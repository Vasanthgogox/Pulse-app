import type { InvitationIdentity } from '../identityTypes';

import { emailIdentityProvider } from './emailIdentityProvider';
import { employeeIdentityProvider } from './employeeIdentityProvider';
import type { IdentityProvider } from './identityProvider.types';
import { phoneIdentityProvider } from './phoneIdentityProvider';
import { ssoIdentityProvider } from './ssoIdentityProvider';

const REGISTERED_PROVIDERS: IdentityProvider[] = [
  phoneIdentityProvider,
  emailIdentityProvider,
  employeeIdentityProvider,
  ssoIdentityProvider,
];

export function getAllIdentityProviders(): readonly IdentityProvider[] {
  return REGISTERED_PROVIDERS;
}

export function getProviderForIdentity(
  identity: InvitationIdentity,
): IdentityProvider | undefined {
  return REGISTERED_PROVIDERS.find((p) => p.supports(identity));
}

/** Register additional providers at runtime (e.g. custom SAML federation). */
export function registerIdentityProvider(provider: IdentityProvider): void {
  const idx = REGISTERED_PROVIDERS.findIndex((p) => p.type === provider.type);
  if (idx >= 0) {
    REGISTERED_PROVIDERS[idx] = provider;
  } else {
    REGISTERED_PROVIDERS.push(provider);
  }
}
