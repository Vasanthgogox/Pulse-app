import type { DriverRow } from "@/features/drivers/services/drivers.service";
import type { VehicleRow } from "@/features/vehicles/services/vehicles.service";
import type { AssignmentAvatarGridItem } from "@/features/trips/components/AssignmentEntityAvatarGrid";
import { formatIndianVehicleNumber } from "@/lib/format";

export type FleetDriverOption = DriverRow & { isBusy?: boolean };
export type FleetVehicleOption = VehicleRow & { isBusy?: boolean };

export function driverOptionsToAvatarGridItems(
  drivers: FleetDriverOption[],
): AssignmentAvatarGridItem[] {
  return drivers.map((d) => ({
    id: d.id,
    title: d.name?.trim() || "—",
    subtitle: d.isBusy ? undefined : d.phone?.trim() || d.email?.trim() || undefined,
    avatarUrl: d.avatar_url ?? null,
    avatarSeed: d.avatar_seed ?? null,
    entityType: "driver",
    disabled: d.isBusy === true,
    statusLabel: d.isBusy ? "On trip" : undefined,
  }));
}

export function vehicleOptionsToAvatarGridItems(
  vehicles: FleetVehicleOption[],
): AssignmentAvatarGridItem[] {
  return vehicles.map((v) => {
    const typeLine = [
      v.vehicle_body_type || v.vehicle_type,
      [v.vehicle_size, v.vehicle_axle].filter(Boolean).join(" "),
    ]
      .filter(Boolean)
      .join(" · ");
    return {
      id: v.id,
      title: formatIndianVehicleNumber(v.vehicle_number || "").trim() || "—",
      subtitle: v.isBusy ? undefined : typeLine || undefined,
      entityType: "driver",
      disabled: v.isBusy === true,
      statusLabel: v.isBusy ? "On trip" : undefined,
    };
  });
}
