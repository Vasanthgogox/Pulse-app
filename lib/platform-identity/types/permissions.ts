/**
 * Delegated administration — permissions independent of relationshipType.
 * Fleet admin can invite employees but cannot modify SSO or archive org.
 */
export type PlatformPermission =
  | 'members.invite'
  | 'members.remove'
  | 'members.view'
  | 'organization.settings'
  | 'organization.archive'
  | 'identity.policy.edit'
  | 'sso.configure'
  | 'billing.manage';

export type DelegatedAdminScope = {
  organizationId: string;
  permissions: PlatformPermission[];
};

export function hasPermission(
  scope: DelegatedAdminScope | null | undefined,
  permission: PlatformPermission,
): boolean {
  return Boolean(scope?.permissions.includes(permission));
}

/** Example: fleet admin — invite only, no org/SSO changes. */
export const FLEET_ADMIN_SCOPE: PlatformPermission[] = [
  'members.invite',
  'members.view',
  'members.remove',
];
