import { formatIndianVehicleNumber } from "@/lib/format";
import type { VehicleRow } from "@/features/vehicles/services/vehicles.service";

export function buildVehicleLabelMap(vehicles: VehicleRow[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const vehicle of vehicles) {
    const formatted = formatIndianVehicleNumber(vehicle.vehicle_number);
    const label = formatted || vehicle.vehicle_number?.trim() || "—";
    map.set(vehicle.id, label);
  }
  return map;
}

export function vehicleDisplayLabel(
  vehicleLabels: Map<string, string>,
  vehicleId: string | null | undefined,
): string {
  const id = String(vehicleId ?? "").trim();
  if (!id) return "—";
  return vehicleLabels.get(id) ?? "—";
}
