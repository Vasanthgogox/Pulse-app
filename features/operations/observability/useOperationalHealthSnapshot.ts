import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { getOperationalHealthSnapshot } from "./operationalHealthEngine";

export function useOperationalHealthSnapshot(input: {
  organizationId: string | null;
  enabled?: boolean;
}) {
  const enabled = (input.enabled ?? true) && !!input.organizationId;
  return useQuery({
    queryKey: input.organizationId
      ? queryKeys.operations.healthSnapshot(input.organizationId)
      : ["q", "operations", "health", "noop"],
    queryFn: async () => {
      const res = await getOperationalHealthSnapshot({
        organizationId: input.organizationId!,
      });
      if (res.error || !res.snapshot) {
        throw res.error ?? new Error("Operational health unavailable");
      }
      return res.snapshot;
    },
    enabled,
    staleTime: 20_000,
  });
}
