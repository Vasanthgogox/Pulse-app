import { getDriverById } from "@/features/drivers/services/drivers.service";
import type { TripAssignmentAuditRow } from "@/features/trips/services/trip-assignment-audit.service";
import { getVehicleById } from "@/features/vehicles/services/vehicles.service";
import { useEffect, useState } from "react";
import type { AssignmentNameMaps } from "../utils/assignmentAuditChatMessages.util";

/** Resolve driver/vehicle labels for assignment audit rows (Pulse chat timeline). */
export function useAssignmentAuditNameMaps(
  orgId: string | null | undefined,
  auditRows: TripAssignmentAuditRow[],
  tripFallback?: {
    driver_display_name?: string | null;
    vehicle_display_number?: string | null;
  },
): AssignmentNameMaps {
  const [maps, setMaps] = useState<AssignmentNameMaps>({
    driverNames: {},
    vehicleLabels: {},
  });

  useEffect(() => {
    if (!orgId || auditRows.length === 0) {
      setMaps({ driverNames: {}, vehicleLabels: {} });
      return;
    }
    const driverIds = new Set<string>();
    const vehicleIds = new Set<string>();
    for (const row of auditRows) {
      if (row.driver_id_prev) driverIds.add(row.driver_id_prev);
      if (row.driver_id_new) driverIds.add(row.driver_id_new);
      if (row.vehicle_id_prev) vehicleIds.add(row.vehicle_id_prev);
      if (row.vehicle_id_new) vehicleIds.add(row.vehicle_id_new);
    }
    let cancelled = false;
    void (async () => {
      const driverNames: Record<string, string> = {};
      const vehicleLabels: Record<string, string> = {};
      await Promise.all([
        ...Array.from(driverIds).map(async (id) => {
          const res = await getDriverById(orgId, id);
          driverNames[id] =
            res.driver?.name?.trim() ||
            res.driver?.phone?.trim() ||
            tripFallback?.driver_display_name?.trim() ||
            "Driver";
        }),
        ...Array.from(vehicleIds).map(async (id) => {
          const res = await getVehicleById(orgId, id);
          vehicleLabels[id] =
            [res.vehicle?.vehicle_number, res.vehicle?.vehicle_type]
              .filter(Boolean)
              .join(" · ") ||
            tripFallback?.vehicle_display_number?.trim() ||
            "Vehicle";
        }),
      ]);
      if (!cancelled) setMaps({ driverNames, vehicleLabels });
    })();
    return () => {
      cancelled = true;
    };
  }, [
    orgId,
    auditRows,
    tripFallback?.driver_display_name,
    tripFallback?.vehicle_display_number,
  ]);

  return maps;
}
