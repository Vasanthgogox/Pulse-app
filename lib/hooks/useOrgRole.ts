import { useActiveWorkspace } from '@/contexts/ActiveWorkspaceContext';

export type OrgMemberRole = 'owner' | 'admin' | 'member';

export interface OrgRoleState {
  role: OrgMemberRole | null;
  isOwner: boolean;
  isAdmin: boolean;
  isMember: boolean;
  canEdit: boolean;
  canInvite: boolean;
  canViewKyc: boolean;
  canViewAudit: boolean;
  isLoading: boolean;
}

export function useOrgRole(): OrgRoleState {
  const { memberRole, isLoading } = useActiveWorkspace();

  if (isLoading || !memberRole) {
    return {
      role: null,
      isOwner: false,
      isAdmin: false,
      isMember: false,
      canEdit: false,
      canInvite: false,
      canViewKyc: false,
      canViewAudit: false,
      isLoading,
    };
  }

  const role = memberRole as OrgMemberRole;
  const isOwner = role === 'owner';
  const isAdmin = role === 'admin';

  return {
    role,
    isOwner,
    isAdmin,
    isMember: true,
    canEdit: isOwner || isAdmin,
    canInvite: isOwner || isAdmin,
    canViewKyc: isOwner || isAdmin,
    canViewAudit: isOwner,
    isLoading: false,
  };
}
