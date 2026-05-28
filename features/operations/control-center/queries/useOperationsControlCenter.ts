import { useInfiniteQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { getOperationsControlCenterPage } from "./controlCenter.service";

export function useOperationsControlCenter(input: {
  organizationId: string | null;
  enabled?: boolean;
  limit?: number;
}) {
  const enabled = (input.enabled ?? true) && !!input.organizationId;
  return useInfiniteQuery({
    queryKey: input.organizationId
      ? queryKeys.operations.controlCenter(input.organizationId)
      : ["q", "operations", "control-center", "noop"],
    queryFn: async ({ pageParam }) => {
      const res = await getOperationsControlCenterPage({
        organizationId: input.organizationId!,
        offset: Number(pageParam ?? 0),
        limit: input.limit ?? 40,
      });
      if (res.error || !res.page) {
        throw res.error ?? new Error("Control center unavailable");
      }
      return res.page;
    },
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.nextOffset : undefined,
    initialPageParam: 0,
    enabled,
    staleTime: 20_000,
  });
}
