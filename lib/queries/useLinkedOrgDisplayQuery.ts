import { useOrganization } from "@/contexts/OrganizationContext";
import { queryKeys } from "@/lib/queryKeys";
import { STALE } from "@/lib/queryClient";
import {
  ensureLinkedOrgDisplayProfiles,
  type LinkedOrgDisplayProfile,
} from "@/lib/queries/linkedOrgDisplayCache";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";

export type { LinkedOrgDisplayProfile };

/**
 * Linked-org display (avatar, KYC, name) via the viewer-org canonical cache.
 * Same IDs in one workspace share one RPC; overlapping sets only fetch missing IDs.
 */
export function useLinkedOrgDisplayMap(
  ids: readonly string[],
): Record<string, LinkedOrgDisplayProfile> {
  const qc = useQueryClient();
  const { currentOrganization } = useOrganization();
  const viewerOrgId = currentOrganization?.id ?? "";
  const idKey = [...ids]
    .map((id) => id.trim())
    .filter(Boolean)
    .sort()
    .join("|");
  const sortedIds = useMemo(
    () => (idKey ? idKey.split("|") : []),
    [idKey],
  );

  const { data = {} } = useQuery({
    queryKey: queryKeys.linkedOrgDisplay(viewerOrgId, sortedIds),
    queryFn: () => ensureLinkedOrgDisplayProfiles(sortedIds, qc, viewerOrgId),
    enabled: Boolean(viewerOrgId) && sortedIds.length > 0,
    staleTime: STALE.moderate,
    retry: false,
  });

  return data;
}
