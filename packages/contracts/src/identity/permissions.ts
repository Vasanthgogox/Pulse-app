/** Permission strings — roles map to these; endpoints call authorize(permission). */

export const Permission = {
  ORG_READ:              'org:read',
  ORG_WRITE:             'org:write',
  ORGANIZATIONS_CREATE:  'organizations:create',
  WAREHOUSES_READ:       'warehouses:read',
  WAREHOUSES_WRITE:      'warehouses:write',
  USERS_INVITE:          'users:invite',
  USERS_MANAGE:          'users:manage',
  COMMERCE_ALL:          'commerce:*',
  PLANNING_ALL:          'planning:*',
  OPS_ALL:               'ops:*',
  EXECUTION_READ:        'execution:read',
} as const;

export type Permission = (typeof Permission)[keyof typeof Permission];

export const ROLE_PERMISSIONS: Record<import('./jwt-claims').PlatformRole, Permission[]> = {
  admin: [
    Permission.ORG_READ,
    Permission.ORG_WRITE,
    Permission.ORGANIZATIONS_CREATE,
    Permission.WAREHOUSES_READ,
    Permission.WAREHOUSES_WRITE,
    Permission.USERS_INVITE,
    Permission.USERS_MANAGE,
    Permission.COMMERCE_ALL,
    Permission.PLANNING_ALL,
    Permission.OPS_ALL,
  ],
  planner: [
    Permission.ORG_READ,
    Permission.WAREHOUSES_READ,
    Permission.WAREHOUSES_WRITE,
    Permission.COMMERCE_ALL,
    Permission.PLANNING_ALL,
  ],
  operator: [
    Permission.ORG_READ,
    Permission.WAREHOUSES_READ,
    Permission.OPS_ALL,
    Permission.EXECUTION_READ,
  ],
};

export function roleHasPermission(role: import('./jwt-claims').PlatformRole, required: Permission): boolean {
  const grants = ROLE_PERMISSIONS[role] ?? [];
  if (grants.includes(required)) return true;
  const [domain] = required.split(':');
  return grants.some(p => p === `${domain}:*`);
}
