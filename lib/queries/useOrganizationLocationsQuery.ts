import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getOrganizationLocations,
  type OrganizationWorkspaceLocation,
} from '@/features/organization/services/organizationLocations.service';
import { queryKeys } from '@/lib/queryKeys';
import { STALE } from '@/lib/queryClient';

export function useOrganizationLocationsQuery(orgId: string | null) {
  return useQuery<OrganizationWorkspaceLocation[], Error>({
    queryKey: queryKeys.organizationLocations.list(orgId ?? ''),
    enabled: Boolean(orgId),
    staleTime: STALE.moderate,
    queryFn: async () => {
      const { error, locations } = await getOrganizationLocations(orgId!);
      if (error) throw error;
      return locations;
    },
  });
}

export function useInvalidateOrganizationLocations() {
  const qc = useQueryClient();
  return (orgId: string) => {
    void qc.invalidateQueries({
      queryKey: queryKeys.organizationLocations.list(orgId),
    });
  };
}
