import {
  getOrganizationWorkspaceProfile,
  type OrganizationWorkspaceProfile,
} from '@/features/organization/services/organizationWorkspaceProfile.service';
import { queryKeys } from '@/lib/queryKeys';
import { STALE } from '@/lib/queryClient';
import { useQuery, useQueryClient } from '@tanstack/react-query';

export function useOrganizationWorkspaceProfileQuery(orgId: string | null) {
  return useQuery<OrganizationWorkspaceProfile, Error>({
    queryKey: queryKeys.organizationWorkspaceProfile.detail(orgId ?? ''),
    enabled: Boolean(orgId),
    staleTime: STALE.moderate,
    queryFn: async () => {
      const { error, profile } = await getOrganizationWorkspaceProfile(orgId!);
      if (error) throw error;
      if (!profile) throw new Error('Workspace profile not found');
      return profile;
    },
  });
}

export function useInvalidateOrganizationWorkspaceProfile() {
  const qc = useQueryClient();
  return (orgId: string) => {
    void qc.invalidateQueries({
      queryKey: queryKeys.organizationWorkspaceProfile.detail(orgId),
    });
    void qc.invalidateQueries({ queryKey: ['network', 'office-map', orgId] });
  };
}
