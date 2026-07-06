/**
 * Per-organization employment policy — not a global constant.
 * 99% of orgs: maxActiveEmploymentMemberships = 1, allowDualEmployment = false.
 * Future marketplace scenarios may allow 2 or unlimited without redesign.
 */

export interface OrganizationEmploymentPolicy {
  organizationId?: string;
  maxActiveEmploymentMemberships: number;
  allowDualEmployment: boolean;
}

export const DEFAULT_ORGANIZATION_EMPLOYMENT_POLICY: OrganizationEmploymentPolicy = {
  maxActiveEmploymentMemberships: 1,
  allowDualEmployment: false,
};

export async function loadOrganizationEmploymentPolicy(
  organizationId?: string,
): Promise<OrganizationEmploymentPolicy> {
  void organizationId;
  return { ...DEFAULT_ORGANIZATION_EMPLOYMENT_POLICY, organizationId };
}

/** Dual employment allowed when explicitly enabled or limit > 1. */
export function organizationAllowsDualEmployment(
  policy: OrganizationEmploymentPolicy,
): boolean {
  return policy.allowDualEmployment || policy.maxActiveEmploymentMemberships > 1;
}
