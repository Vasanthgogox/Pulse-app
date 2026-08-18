import {
  getOrgProfileSnapshot,
  type NetworkProfileSnapshot,
} from "@/features/network/services/networkProfileSnapshot.service";
import { STALE } from "@/lib/queryClient";
import { queryKeys } from "@/lib/queryKeys";
import { useQuery } from "@tanstack/react-query";

export function useNetworkProfileSnapshotQuery(
  viewerOrgId: string | null | undefined,
  targetOrgId: string | null | undefined,
) {
  return useQuery<NetworkProfileSnapshot | null, Error>({
    queryKey: queryKeys.networkProfileSnapshot(
      viewerOrgId ?? "",
      targetOrgId ?? "",
    ),
    queryFn: async () => {
      const { error, snapshot } = await getOrgProfileSnapshot(
        viewerOrgId!,
        targetOrgId!,
      );
      if (error) throw error;
      return snapshot;
    },
    enabled: Boolean(viewerOrgId && targetOrgId),
    staleTime: STALE.frequent,
  });
}
