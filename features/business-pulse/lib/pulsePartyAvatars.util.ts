import type { PulseDataset } from "@/features/business-pulse/types";
import { formatIndianVehicleNumber } from "@/lib/format";
import type { PartyEntityType } from "@/lib/partyAvatarDisplay";

export type PulsePartyProfile = {
  name: string;
  avatarUrl?: string | null;
  avatarSeed?: string | null;
  entityType: PartyEntityType;
};

export type PulsePartyMaps = {
  clients: Map<string, PulsePartyProfile>;
  suppliers: Map<string, PulsePartyProfile>;
  drivers: Map<string, PulsePartyProfile>;
  vehicles: Map<string, PulsePartyProfile>;
};

export function buildPulsePartyMaps(dataset: PulseDataset): PulsePartyMaps {
  return {
    clients: new Map(
      dataset.clients.map((c) => [
        c.id,
        {
          name: c.name ?? "Client",
          avatarUrl: c.avatar_url ?? null,
          avatarSeed: c.avatar_seed ?? c.id,
          entityType: "client",
        },
      ]),
    ),
    suppliers: new Map(
      dataset.suppliers.map((s) => [
        s.id,
        {
          name: s.company_name ?? s.name ?? "Supplier",
          avatarUrl: s.avatar_url ?? null,
          avatarSeed: s.avatar_seed ?? s.id,
          entityType: "supplier",
        },
      ]),
    ),
    drivers: new Map(
      dataset.drivers.map((d) => [
        d.id,
        {
          name: d.name ?? "Driver",
          avatarUrl: d.avatar_url ?? null,
          avatarSeed: d.avatar_seed ?? d.id,
          entityType: "driver",
        },
      ]),
    ),
    vehicles: new Map(
      dataset.vehicles.map((v) => [
        v.id,
        {
          name: formatIndianVehicleNumber(v.vehicle_number) || v.vehicle_number?.trim() || "Vehicle",
          avatarUrl: null,
          avatarSeed: v.id,
          entityType: "vehicle",
        },
      ]),
    ),
  };
}

/** Lane / route rows — deterministic avatar from route label. */
export function pulsePartyForRoute(route: string): PulsePartyProfile {
  return {
    name: route,
    avatarUrl: null,
    avatarSeed: route,
    entityType: "client",
  };
}

export function pulsePartyForName(
  name: string,
  entityType: PartyEntityType = "client",
): PulsePartyProfile {
  return {
    name,
    avatarUrl: null,
    avatarSeed: name,
    entityType,
  };
}

export function resolvePulseParty(
  map: Map<string, PulsePartyProfile>,
  id: string,
  name: string,
  entityType: PartyEntityType,
): PulsePartyProfile {
  return (
    map.get(id) ?? {
      ...pulsePartyForName(name, entityType),
      avatarSeed: id,
    }
  );
}

export type DrilldownRowPartyIds = {
  clientId?: string | null;
  supplierId?: string | null;
  driverId?: string | null;
  vehicleId?: string | null;
};

const PARTY_COLUMN_ENTITY: Record<string, keyof DrilldownRowPartyIds> = {
  client: "clientId",
  supplier: "supplierId",
  driver: "driverId",
  vehicle: "vehicleId",
};

/** Resolve avatar profile for drilldown party columns. */
export function pulsePartyForDrilldownColumn(
  columnKey: string,
  displayName: string,
  partyIds: DrilldownRowPartyIds | undefined,
  maps: PulsePartyMaps,
): PulsePartyProfile | null {
  const idKey = PARTY_COLUMN_ENTITY[columnKey];
  if (!idKey) return null;
  const entityId = partyIds?.[idKey];
  if (entityId) {
    const mapKey =
      columnKey === "client"
        ? "clients"
        : columnKey === "supplier"
          ? "suppliers"
          : columnKey === "driver"
            ? "drivers"
            : "vehicles";
    const profile = maps[mapKey].get(String(entityId));
    if (profile) return profile;
  }
  if (!displayName || displayName === "—") return null;
  return pulsePartyForName(
    displayName,
    columnKey === "vehicle"
      ? "vehicle"
      : columnKey === "driver"
        ? "driver"
        : columnKey === "supplier"
          ? "supplier"
          : "client",
  );
}
