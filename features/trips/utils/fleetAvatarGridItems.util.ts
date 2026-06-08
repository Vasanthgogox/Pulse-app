import type { DriverRow } from "@/features/drivers/services/drivers.service";
import type { VehicleRow } from "@/features/vehicles/services/vehicles.service";
import type { AssignmentAvatarGridItem } from "@/features/trips/components/AssignmentEntityAvatarGrid";
import { formatIndianVehicleNumber } from "@/lib/format";
import { resolveWizardContactPhone } from "@/features/clients/utils/clientContactDisplay.util";

export type FleetDriverOption = DriverRow & { isBusy?: boolean };
export type FleetVehicleOption = VehicleRow & { isBusy?: boolean };

/** Available fleet rows first; busy ("On trip") rows after, alphabetical within each group. */
function sortFleetOptionsAvailableFirst<T extends { isBusy?: boolean }>(
  items: T[],
  sortKey: (item: T) => string,
): T[] {
  return [...items].sort((a, b) => {
    const aBusy = a.isBusy === true ? 1 : 0;
    const bBusy = b.isBusy === true ? 1 : 0;
    if (aBusy !== bBusy) return aBusy - bBusy;
    return sortKey(a).localeCompare(sortKey(b), "en", { sensitivity: "base" });
  });
}

export function driverOptionsToAvatarGridItems(
  drivers: FleetDriverOption[],
): AssignmentAvatarGridItem[] {
  const sorted = sortFleetOptionsAvailableFirst(
    drivers,
    (d) => d.name?.trim() || "",
  );
  return sorted.map((d) => ({
    id: d.id,
    title: d.name?.trim() || "—",
    subtitle: d.isBusy
      ? undefined
      : resolveWizardContactPhone(d.phone) ?? undefined,
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
  const sorted = sortFleetOptionsAvailableFirst(
    vehicles,
    (v) => formatIndianVehicleNumber(v.vehicle_number || "").trim() || v.vehicle_number || "",
  );
  return sorted.map((v) => {
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
      entityType: "vehicle",
      disabled: v.isBusy === true,
      statusLabel: v.isBusy ? "On trip" : undefined,
    };
  });
}
