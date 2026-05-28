import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { compressOperationsPhoto } from "../uploads/photoUploads";
import type { SaveVehicleMaintenanceInput } from "../types";
import {
  createVehicleMaintenanceEntry,
  getVehicleMaintenanceEntries,
  uploadMaintenanceInvoicePhoto,
} from "./maintenance.service";

export function useVehicleMaintenanceEntries(input: {
  organizationId: string | null;
  vehicleId: string | null;
  enabled?: boolean;
}) {
  const enabled = (input.enabled ?? true) && !!input.organizationId && !!input.vehicleId;
  return useQuery({
    queryKey: [
      "q",
      "trips",
      "operations",
      "maintenance",
      input.organizationId ?? "noop",
      input.vehicleId ?? "noop",
    ],
    queryFn: async () => {
      const res = await getVehicleMaintenanceEntries({
        organizationId: input.organizationId!,
        vehicleId: input.vehicleId!,
      });
      if (res.error) throw res.error;
      return res.entries;
    },
    enabled,
    staleTime: 45_000,
  });
}

export function useSaveVehicleMaintenanceEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SaveVehicleMaintenanceInput) => {
      let invoiceStoragePath: string | null = null;
      if (input.invoiceLocalUri && input.enteredBy && input.tripId) {
        try {
          const arrayBuffer = await compressOperationsPhoto(input.invoiceLocalUri);
          const upload = await uploadMaintenanceInvoicePhoto({
            tripId: input.tripId,
            userId: input.enteredBy,
            arrayBuffer,
            fileName: `maintenance-${Date.now()}.jpg`,
          });
          if (!upload.error) invoiceStoragePath = upload.storagePath;
        } catch {
          invoiceStoragePath = null;
        }
      }
      const res = await createVehicleMaintenanceEntry({ ...input, invoiceStoragePath });
      if (res.error) throw res.error;
      return res.entry;
    },
    onSuccess: (_entry, vars) => {
      qc.invalidateQueries({
        queryKey: [
          "q",
          "trips",
          "operations",
          "maintenance",
          vars.organizationId,
          vars.vehicleId,
        ],
      });
      if (vars.tripId) {
        qc.invalidateQueries({
          queryKey: ["q", "trips", "operations", vars.tripId, "summary"],
        });
      }
    },
  });
}
