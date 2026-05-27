import { getProfileImageBatch } from "@/features/finance/services/finance.service";
import { queryKeys } from "@/lib/queryKeys";
import { STALE } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";

/**
 * Fetches resolved avatar URLs for driver IDs via the batch RPC.
 * Results are shared across all callers with the same driver ID set —
 * only one network request fires regardless of how many components call this.
 */
export function useDriverProfileImagesQuery(
  driverIds: string[],
): Record<string, string> {
  const sortedIds = [...driverIds].filter(Boolean).sort();

  const { data = {} } = useQuery({
    queryKey: queryKeys.driverProfileImages(sortedIds),
    queryFn: () => getProfileImageBatch(sortedIds),
    enabled: sortedIds.length > 0,
    staleTime: STALE.moderate,
  });

  return data;
}
