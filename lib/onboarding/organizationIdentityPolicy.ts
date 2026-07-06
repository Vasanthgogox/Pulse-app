/**
 * Per-organization identity policy (V2).
 * Policy belongs to the organization — the onboarding pipeline asks only for required identities.
 */
import type { InvitationIdentity } from './identityTypes';

export type OrganizationIdentityProvider =
  | 'phone'
  | 'email'
  | 'entra'
  | 'google'
  | 'okta'
  | 'employee_id';

export interface OrganizationIdentityPolicy {
  organizationId?: string;
  allowedProviders: OrganizationIdentityProvider[];
  requirePhone: boolean;
  requireCorporateEmail: boolean;
  requireSso: boolean;
  /** When set, email must use this domain (corporate email). */
  corporateEmailDomain?: string;
}

/** V1 default — phone + email allowed; no org-level enforcement yet. */
export const DEFAULT_ORGANIZATION_IDENTITY_POLICY: OrganizationIdentityPolicy = {
  allowedProviders: ['phone', 'email'],
  requirePhone: false,
  requireCorporateEmail: false,
  requireSso: false,
};

/**
 * Load org identity policy from Platform Identity (future).
 * V1: returns default until `platform.organization_identity_policies` exists.
 */
export async function loadOrganizationIdentityPolicy(
  organizationId?: string,
): Promise<OrganizationIdentityPolicy> {
  void organizationId;
  return { ...DEFAULT_ORGANIZATION_IDENTITY_POLICY, organizationId };
}

/**
 * Merge policies when user has multiple pending invitations (strictest wins).
 * V2: used when picker selects an org before verification steps.
 */
export function mergeIdentityPolicies(
  policies: OrganizationIdentityPolicy[],
): OrganizationIdentityPolicy {
  if (policies.length === 0) return DEFAULT_ORGANIZATION_IDENTITY_POLICY;

  const allowedSet = new Set<OrganizationIdentityProvider>();
  for (const p of policies) {
    for (const provider of p.allowedProviders) {
      allowedSet.add(provider);
    }
  }

  return {
    allowedProviders: [...allowedSet],
    requirePhone: policies.some((p) => p.requirePhone),
    requireCorporateEmail: policies.some((p) => p.requireCorporateEmail),
    requireSso: policies.some((p) => p.requireSso),
    corporateEmailDomain: policies.find((p) => p.corporateEmailDomain)?.corporateEmailDomain,
  };
}

/** Identities still required before onboarding can complete (V2 verification gating). */
export function missingRequiredIdentities(
  policy: OrganizationIdentityPolicy,
  verified: InvitationIdentity[],
): OrganizationIdentityProvider[] {
  const has = (provider: OrganizationIdentityProvider): boolean => {
    switch (provider) {
      case 'phone':
        return verified.some((i) => i.type === 'phone' && i.verified);
      case 'email':
        return verified.some((i) => i.type === 'email' && i.verified);
      case 'employee_id':
        return verified.some((i) => i.type === 'employee_id' && i.verified);
      case 'entra':
      case 'google':
      case 'okta':
        return verified.some(
          (i) =>
            i.type === 'external_identity' &&
            i.verified &&
            i.provider === provider,
        );
      default:
        return false;
    }
  };

  const missing: OrganizationIdentityProvider[] = [];
  if (policy.requirePhone && !has('phone')) missing.push('phone');
  if (policy.requireCorporateEmail && !has('email')) missing.push('email');
  if (policy.requireSso) {
    const ssoProviders = policy.allowedProviders.filter((p) =>
      ['entra', 'google', 'okta'].includes(p),
    );
    if (ssoProviders.length > 0 && !ssoProviders.some(has)) {
      missing.push(ssoProviders[0]!);
    }
  }
  return missing;
}
