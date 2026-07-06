import { defaultPermissionsForRole } from './workspaceContextStore';
import { PLATFORM_ROLE_GRANTS } from '@/features/organization/utils/teamInviteRoles.util';

/**
 * Regression coverage for the PR-006 permission-model reconciliation: known PlatformTeamRole
 * values must resolve to their real invite-time grants, not a placeholder subset. This is
 * security-sensitive — a silent regression here would under- or over-grant permissions for
 * every freshly-accepted invitation.
 */
describe('defaultPermissionsForRole', () => {
  it('resolves admin to the real PLATFORM_ROLE_GRANTS.admin grant set', () => {
    expect(defaultPermissionsForRole('admin')).toEqual(PLATFORM_ROLE_GRANTS.admin);
  });

  it('resolves planner to the real PLATFORM_ROLE_GRANTS.planner grant set', () => {
    expect(defaultPermissionsForRole('planner')).toEqual(PLATFORM_ROLE_GRANTS.planner);
  });

  it('resolves operator to the real PLATFORM_ROLE_GRANTS.operator grant set', () => {
    expect(defaultPermissionsForRole('operator')).toEqual(PLATFORM_ROLE_GRANTS.operator);
  });

  it('keeps owner on its own grant list (owners are never invited, not a PlatformTeamRole)', () => {
    expect(defaultPermissionsForRole('owner')).toEqual([
      'members.invite',
      'members.view',
      'members.remove',
      'organization.settings',
    ]);
  });

  it('falls back to view-only for an unrecognized role', () => {
    expect(defaultPermissionsForRole('some_future_role')).toEqual(['members.view']);
  });

  it('returns no permissions when no role is present', () => {
    expect(defaultPermissionsForRole(null)).toEqual([]);
    expect(defaultPermissionsForRole(undefined)).toEqual([]);
  });
});
