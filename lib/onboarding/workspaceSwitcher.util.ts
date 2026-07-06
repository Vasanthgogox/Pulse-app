import type { PlatformMembership } from './platformMembership';
import { activeMemberships } from './platformMembership';

/**
 * Workspace switcher — choose active organization among existing memberships.
 * Independent of invitation picker and employment policy engine.
 */
export type WorkspaceSwitcherPolicy = {
  allowOrganizationSwitcher: boolean;
};

export const DEFAULT_WORKSPACE_SWITCHER_POLICY: WorkspaceSwitcherPolicy = {
  allowOrganizationSwitcher: false,
};

export function shouldShowWorkspaceSwitcher(
  policy: WorkspaceSwitcherPolicy,
  memberships: PlatformMembership[],
): boolean {
  const active = activeMemberships(memberships);
  if (active.length <= 1) return false;
  return policy.allowOrganizationSwitcher;
}

/** @deprecated Use shouldShowWorkspaceSwitcher */
export const shouldShowOrganizationSwitcher = shouldShowWorkspaceSwitcher;
