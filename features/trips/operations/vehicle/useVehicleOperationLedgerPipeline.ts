import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { STALE } from "@/lib/queryClient";
import { queryKeys } from "@/lib/queryKeys";
import type { VehicleLedgerApprovalState } from "../types";
import {
  getVehicleOperationLedgerEntries,
  updateVehicleOperationLedgerAmount,
  updateVehicleOperationLedgerApprovalState,
} from "./vehicleOperationsLedger.service";

export function useVehicleOperationLedgerEntries(params: {
  organizationId: string | null | undefined;
  vehicleId: string | null | undefined;
  approvalStates?: VehicleLedgerApprovalState[];
  enabled?: boolean;
}) {
  const organizationId = String(params.organizationId ?? "").trim();
  const vehicleId = String(params.vehicleId ?? "").trim();
  const stateKey = (params.approvalStates ?? []).join(",") || "all";
  const enabled = (params.enabled ?? true) && !!organizationId && !!vehicleId;
  return useQuery({
    queryKey: enabled
      ? queryKeys.trips.vehicleOperationsLedgerEntries(organizationId, vehicleId, stateKey)
      : ["q", "trips", "operations", "vehicle", "ledger-entries", "noop"],
    queryFn: async () => {
      const res = await getVehicleOperationLedgerEntries({
        organizationId,
        vehicleId,
        approvalStates: params.approvalStates,
      });
      if (res.error) throw res.error;
      return res.entries;
    },
    enabled,
    staleTime: STALE.slow,
  });
}

export function useSetVehicleOperationLedgerApproval() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: updateVehicleOperationLedgerApprovalState,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["q", "trips", "operations", "vehicle"] });
    },
  });
}

export function useUpdateVehicleOperationLedgerAmount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: updateVehicleOperationLedgerAmount,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["q", "trips", "operations", "vehicle"] });
    },
  });
}
