/**
 * Hook for checking admin permissions in components.
 * Returns the permission state and an easy check function.
 */

import { useAdminAuth } from '@/context/AdminAuthProvider';
import type { AdminPermission } from '@/lib/permissions';
import { hasPermission as checkPermission } from '@/lib/permissions';

export interface PermissionState {
  permissions: string[];
  isLoading: boolean;
  hasPermission(permission: AdminPermission | AdminPermission[], mode?: 'any' | 'all'): boolean;
  can(permission: AdminPermission | AdminPermission[]): boolean;
}

/**
 * usePermission — check if the current admin user has specific permissions.
 *
 * @example
 * const perm = usePermission();
 * if (perm.can('verification.approve')) {
 *   // render approval button
 * }
 */
export function usePermission(): PermissionState {
  const { permissions, status } = useAdminAuth();
  const isLoading = status === 'loading';

  return {
    permissions,
    isLoading,
    hasPermission(permission, mode = 'any') {
      return checkPermission(permissions, permission, mode);
    },
    can(permission) {
      return checkPermission(permissions, permission, 'any');
    },
  };
}
