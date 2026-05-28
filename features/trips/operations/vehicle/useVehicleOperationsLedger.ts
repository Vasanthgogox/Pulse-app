import { useQuery } from "@tanstack/react-query";
import { STALE } from "@/lib/queryClient";
import { queryKeys } from "@/lib/queryKeys";
import { getVehicleOperationsLedger } from "./vehicleOperationsLedger.service";

export function useVehicleOperationsLedger(params: {
  organizationId: string | null | undefined;
  vehicleId: string | null | undefined;
  enabled?: boolean;
}) {
  const organizationId = String(params.organizationId ?? "").trim();
  const vehicleId = String(params.vehicleId ?? "").trim();
  const enabled = (params.enabled ?? true) && !!organizationId && !!vehicleId;
  return useQuery({
    queryKey: enabled
      ? queryKeys.trips.vehicleOperationsLedger(organizationId, vehicleId)
      : ["q", "trips", "operations", "vehicle", "noop"],
    queryFn: async () => {
      const res = await getVehicleOperationsLedger({
        organizationId,
        vehicleId,
      });
      if (res.error || !res.summary) throw res.error ?? new Error("Ledger unavailable");
      return res.summary;
    },
    enabled,
    staleTime: STALE.slow,
  });
}
