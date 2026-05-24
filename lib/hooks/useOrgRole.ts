import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { supabase } from '@/lib/supabase';
import { useEffect, useState } from 'react';

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

const LOADING_STATE: OrgRoleState = {
  role: null,
  isOwner: false,
  isAdmin: false,
  isMember: false,
  canEdit: false,
  canInvite: false,
  canViewKyc: false,
  canViewAudit: false,
  isLoading: true,
};

function buildState(role: OrgMemberRole): OrgRoleState {
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

export function useOrgRole(): OrgRoleState {
  const { user } = useAuth();
  const { currentOrganization } = useOrganization();
  const [state, setState] = useState<OrgRoleState>(LOADING_STATE);

  useEffect(() => {
    let mounted = true;
    const orgId = currentOrganization?.id;
    const userId = user?.uid;

    if (!orgId || !userId) {
      setState({ ...LOADING_STATE, isLoading: false });
      return;
    }

    setState(LOADING_STATE);

    supabase()
      .from('organization_members')
      .select('role')
      .eq('organization_id', orgId)
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!mounted) return;
        if (error || !data) {
          setState({ ...LOADING_STATE, isLoading: false });
          return;
        }
        const role = (data.role as OrgMemberRole) ?? 'member';
        setState(buildState(role));
      });

    return () => { mounted = false; };
  }, [user?.uid, currentOrganization?.id]);

  return state;
}
