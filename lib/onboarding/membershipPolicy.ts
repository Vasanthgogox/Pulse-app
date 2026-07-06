/**
 * Aggregated platform membership policy loaders (org employment + workspace switcher).
 */
import type { OrganizationEmploymentPolicy } from './organizationEmploymentPolicy';
import {
  DEFAULT_ORGANIZATION_EMPLOYMENT_POLICY,
  loadOrganizationEmploymentPolicy,
} from './organizationEmploymentPolicy';
import type { WorkspaceSwitcherPolicy } from './workspaceSwitcher.util';
import { DEFAULT_WORKSPACE_SWITCHER_POLICY } from './workspaceSwitcher.util';

export type PlatformMembershipPolicy = {
  employment: OrganizationEmploymentPolicy;
  workspaceSwitcher: WorkspaceSwitcherPolicy;
};

export const DEFAULT_PLATFORM_MEMBERSHIP_POLICY: PlatformMembershipPolicy = {
  employment: DEFAULT_ORGANIZATION_EMPLOYMENT_POLICY,
  workspaceSwitcher: DEFAULT_WORKSPACE_SWITCHER_POLICY,
};

/** @deprecated Use PlatformMembershipPolicy */
export type MembershipPolicy = PlatformMembershipPolicy;

/** @deprecated Use DEFAULT_PLATFORM_MEMBERSHIP_POLICY */
export const DEFAULT_MEMBERSHIP_POLICY = DEFAULT_PLATFORM_MEMBERSHIP_POLICY;

export async function loadMembershipPolicy(
  scope?: { userId?: string; organizationId?: string },
): Promise<PlatformMembershipPolicy> {
  const employment = await loadOrganizationEmploymentPolicy(scope?.organizationId);
  return {
    employment,
    workspaceSwitcher: DEFAULT_WORKSPACE_SWITCHER_POLICY,
  };
}

export { requiresInvitationPicker } from './invitationPicker.util';
export {
  shouldShowWorkspaceSwitcher,
  shouldShowOrganizationSwitcher,
} from './workspaceSwitcher.util';
