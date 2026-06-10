export type PartyKind = "customers" | "suppliers" | "drivers" | "vehicles";

export const PARTY_DIRECTORY_TAB_ORDER: PartyKind[] = [
  "customers",
  "suppliers",
  "drivers",
  "vehicles",
];

export const PARTY_TAB_LABELS: Record<PartyKind, string> = {
  customers: "Customer",
  suppliers: "Supplier",
  drivers: "Driver",
  vehicles: "Vehicle",
};

export const PARTY_KIND_ENTITY_LABEL: Record<PartyKind, string> = {
  customers: "SHIPPER",
  suppliers: "SUPPLIER",
  drivers: "DRIVER",
  vehicles: "VEHICLE",
};

export const PARTY_KIND_META: Record<
  PartyKind,
  { title: string; subtitle: string; empty: string }
> = {
  customers: {
    title: "Customers",
    subtitle: "Shippers and billing clients in your workspace",
    empty: "No customers yet. Add clients from Network or Create Trip.",
  },
  suppliers: {
    title: "Suppliers",
    subtitle: "Carriers and transport partners",
    empty: "No suppliers yet. Connect partners from Network.",
  },
  drivers: {
    title: "Drivers",
    subtitle: "Fleet drivers and roster members",
    empty: "No drivers yet. Invite drivers from Resources.",
  },
  vehicles: {
    title: "Vehicles",
    subtitle: "Owned fleet and partner assets",
    empty: "No vehicles yet. Add vehicles from Resources.",
  },
};

export function parsePartyKind(raw: string | undefined): PartyKind | null {
  if (
    raw === "customers" ||
    raw === "suppliers" ||
    raw === "drivers" ||
    raw === "vehicles"
  ) {
    return raw;
  }
  return null;
}
