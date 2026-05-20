import { getMutualConnections } from "@/features/network/services/mutual-connections.service";
import { queryKeys } from "@/lib/queryKeys";
import { useQuery } from "@tanstack/react-query";

export function useMutualConnectionsQuery(
  viewerOrgId: string | null | undefined,
  targetOrgId: string | null | undefined,
  enabled = true,
) {
  return useQuery({
    queryKey: queryKeys.mutualConnections(viewerOrgId ?? "", targetOrgId ?? ""),
    queryFn: async () => {
      const { error, mutuals } = await getMutualConnections(
        viewerOrgId!,
        targetOrgId!,
      );
      if (error) throw error;
      return mutuals;
    },
    enabled: Boolean(enabled && viewerOrgId && targetOrgId),
    staleTime: 60_000,
  });
}
