import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { getOperationalObservabilitySnapshot } from "./operationsObservability.service";

export function useOperationalObservability(input: {
  tripId: string | null;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: input.tripId
      ? queryKeys.operations.observabilityByTrip(input.tripId)
      : ["q", "operations", "observability", "noop"],
    queryFn: async () => {
      const res = await getOperationalObservabilitySnapshot({ tripId: input.tripId! });
      if (res.error || !res.snapshot) throw res.error ?? new Error("Observability unavailable");
      return res.snapshot;
    },
    enabled: (input.enabled ?? true) && !!input.tripId,
    staleTime: 20_000,
  });
}
