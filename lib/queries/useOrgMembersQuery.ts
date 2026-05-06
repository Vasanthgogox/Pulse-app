/**
 * TanStack Query hooks for organization member management.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getOrganizationMembers,
  getMyTeamInvites,
} from '@/features/organization/services/members.service';
import { queryKeys } from '@/lib/queryKeys';
import { STALE } from '@/lib/queryClient';

export function useOrgMembersQuery(orgId: string | null) {
  return useQuery({
    queryKey: queryKeys.orgMembers.all(orgId ?? ''),
    queryFn: async () => {
      const res = await getOrganizationMembers(orgId!);
      if (res.error) throw res.error;
      return res.members;
    },
    enabled: !!orgId,
    staleTime: STALE.slow,
  });
}

export function useMyTeamInvitesQuery() {
  return useQuery({
    queryKey: queryKeys.teamInvites.mine(),
    queryFn: async () => {
      const res = await getMyTeamInvites();
      if (res.error) throw res.error;
      return res.invites;
    },
    staleTime: STALE.moderate,
  });
}

export function useInvalidateOrgMembers(orgId: string | null) {
  const qc = useQueryClient();
  return () => {
    if (!orgId) return;
    qc.invalidateQueries({ queryKey: queryKeys.orgMembers.all(orgId) });
  };
}

export function useInvalidateTeamInvites() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: queryKeys.teamInvites.mine() });
  };
}
