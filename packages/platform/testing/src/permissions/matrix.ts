import { Permission, roleHasPermission, type PlatformRole } from '@pulse/contracts';

export type IdentityEndpoint =
  | 'POST /organizations'
  | 'POST /business-units'
  | 'POST /warehouses'
  | 'POST /users/invite'
  | 'GET /auth/me';

export const IDENTITY_PERMISSION_MATRIX: Record<
  IdentityEndpoint,
  Record<PlatformRole, boolean>
> = {
  'POST /organizations': {
    admin:    roleHasPermission('admin', Permission.ORGANIZATIONS_CREATE),
    planner:  roleHasPermission('planner', Permission.ORGANIZATIONS_CREATE),
    operator: roleHasPermission('operator', Permission.ORGANIZATIONS_CREATE),
  },
  'POST /business-units': {
    admin:    roleHasPermission('admin', Permission.ORG_WRITE),
    planner:  roleHasPermission('planner', Permission.ORG_WRITE),
    operator: roleHasPermission('operator', Permission.ORG_WRITE),
  },
  'POST /warehouses': {
    admin:    roleHasPermission('admin', Permission.WAREHOUSES_WRITE),
    planner:  roleHasPermission('planner', Permission.WAREHOUSES_WRITE),
    operator: roleHasPermission('operator', Permission.WAREHOUSES_WRITE),
  },
  'POST /users/invite': {
    admin:    roleHasPermission('admin', Permission.USERS_INVITE),
    planner:  roleHasPermission('planner', Permission.USERS_INVITE),
    operator: roleHasPermission('operator', Permission.USERS_INVITE),
  },
  'GET /auth/me': {
    admin:    true,
    planner:  true,
    operator: true,
  },
};

export function endpointAllowsRole(endpoint: IdentityEndpoint, role: PlatformRole): boolean {
  return IDENTITY_PERMISSION_MATRIX[endpoint][role];
}
