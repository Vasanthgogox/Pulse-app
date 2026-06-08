import { getDriverById } from "@/features/drivers/services/drivers.service";
import type { TripAssignmentAuditRow } from "@/features/trips/services/trip-assignment-audit.service";
import { getVehicleById } from "@/features/vehicles/services/vehicles.service";
import { useEffect, useMemo, useState } from "react";
import type { AssignmentNameMaps } from "../utils/assignmentAuditChatMessages.util";

const EMPTY_MAPS: AssignmentNameMaps = { driverNames: {}, vehicleLabels: {} };

function auditRowsStableKey(rows: TripAssignmentAuditRow[]): string {
  if (rows.length === 0) return "";
  return rows
    .map(
      (row) =>
        [
          row.id,
          row.driver_id_prev,
          row.driver_id_new,
          row.vehicle_id_prev,
          row.vehicle_id_new,
        ].join(":"),
    )
    .join("|");
}

/** Resolve driver/vehicle labels for assignment audit rows (Pulse chat timeline). */
export function useAssignmentAuditNameMaps(
  orgId: string | null | undefined,
  auditRows: TripAssignmentAuditRow[],
  tripFallback?: {
    driver_display_name?: string | null;
    vehicle_display_number?: string | null;
  },
): AssignmentNameMaps {
  const [maps, setMaps] = useState<AssignmentNameMaps>(EMPTY_MAPS);
  const auditRowsKey = useMemo(() => auditRowsStableKey(auditRows), [auditRows]);

  useEffect(() => {
    if (!orgId || auditRowsKey === "") {
      setMaps((prev) =>
        Object.keys(prev.driverNames).length === 0 &&
        Object.keys(prev.vehicleLabels).length === 0
          ? prev
          : EMPTY_MAPS,
      );
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
    auditRowsKey,
    tripFallback?.driver_display_name,
    tripFallback?.vehicle_display_number,
  ]);

  return maps;
}
