import { useQuery } from "@tanstack/react-query";

import { getLinkedClientOrgLocations } from "@/features/clients/services/linkedClientLocations.service";
import type { OrganizationWorkspaceLocation } from "@/features/organization/services/organizationLocations.service";
import { queryKeys } from "@/lib/queryKeys";

export function useLinkedClientOrgLocationsQuery(
  orgId: string | null | undefined,
  clientId: string | null | undefined,
  enabled = true,
) {
  return useQuery<OrganizationWorkspaceLocation[], Error>({
    queryKey: queryKeys.clients.linkedOrgLocations(orgId ?? "", clientId ?? ""),
    enabled: Boolean(enabled && orgId && clientId),
    queryFn: async () => {
      const { error, locations } = await getLinkedClientOrgLocations(
        orgId!,
        clientId!,
      );
      if (error) throw error;
      return locations;
    },
    staleTime: 60_000,
  });
}
