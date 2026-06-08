/**
 * Capability-based access for unified user role.
 * Aligned with Q-unified-base src/lib/capabilities.ts.
 */

export type Capability =
  | "fleet_management"
  | "dispatch"
  | "dispatch_for_own_fleet"
  | "marketplace_post"
  | "marketplace_bid"
  | "finance_view"
  | "finance_manage"
  | "team_manage";

export const CAPABILITIES: Record<Capability, string> = {
  fleet_management: "Manage vehicles, drivers, maintenance",
  dispatch: "Create indents, trips, assign drivers/vehicles",
  dispatch_for_own_fleet: "Dispatch using own org fleet only",
  marketplace_post: "Post demand to marketplace",
  marketplace_bid: "Bid on marketplace listings",
  finance_view: "View finance",
  finance_manage: "Manage finance",
  team_manage: "Invite and manage team",
};

export interface EffectivePermissions {
  indents: { view: boolean; create: boolean; edit: boolean };
  trips: { view: boolean; create: boolean; assign: boolean };
  vehicles: boolean;
  drivers: boolean;
  clients: boolean;
  suppliers: boolean;
  marketplacePost: boolean;
  marketplaceBid: boolean;
  financeView: boolean;
  financeManage: boolean;
  teamManage: boolean;
}

const defaultPermissions: EffectivePermissions = {
  indents: { view: false, create: false, edit: false },
  trips: { view: false, create: false, assign: false },
  vehicles: false,
  drivers: false,
  clients: false,
  suppliers: false,
  marketplacePost: false,
  marketplaceBid: false,
  financeView: false,
  financeManage: false,
  teamManage: false,
};

export function getEffectivePermissions(
  capabilities: Capability[],
): EffectivePermissions {
  const p: EffectivePermissions = {
    ...defaultPermissions,
    indents: { ...defaultPermissions.indents },
    trips: { ...defaultPermissions.trips },
  };
  for (const cap of capabilities) {
    switch (cap) {
      case "fleet_management":
        p.vehicles = true;
        p.drivers = true;
        break;
      case "dispatch":
        p.indents = { view: true, create: true, edit: true };
        p.trips = { view: true, create: true, assign: true };
        p.clients = true;
        p.suppliers = true;
        break;
      case "dispatch_for_own_fleet":
        p.indents = { view: true, create: true, edit: true };
        p.trips = { view: true, create: true, assign: true };
        break;
      case "marketplace_post":
        p.marketplacePost = true;
        break;
      case "marketplace_bid":
        p.marketplaceBid = true;
        break;
      case "finance_view":
        p.financeView = true;
        break;
      case "finance_manage":
        p.financeManage = true;
        p.financeView = true;
        break;
      case "team_manage":
        p.teamManage = true;
        break;
    }
  }
  return p;
}

export function canAccessIndents(capabilities: Capability[]): boolean {
  const p = getEffectivePermissions(capabilities);
  return p.indents.view || p.indents.create;
}

export function canAccessTrips(capabilities: Capability[]): boolean {
  const p = getEffectivePermissions(capabilities);
  return p.trips.view || p.trips.create;
}

export function canAssignTrip(capabilities: Capability[]): boolean {
  return getEffectivePermissions(capabilities).trips.assign;
}

export function canAccessVehicles(capabilities: Capability[]): boolean {
  return getEffectivePermissions(capabilities).vehicles;
}

export function canAccessDrivers(capabilities: Capability[]): boolean {
  return getEffectivePermissions(capabilities).drivers;
}

export function canAccessClients(capabilities: Capability[]): boolean {
  return getEffectivePermissions(capabilities).clients;
}

export function canAccessSuppliers(capabilities: Capability[]): boolean {
  return getEffectivePermissions(capabilities).suppliers;
}

export function canAccessFinance(capabilities: Capability[]): boolean {
  const p = getEffectivePermissions(capabilities);
  return p.financeView || p.financeManage;
}

export interface ProfileForCapabilities {
  role: string;
  aggregated?: boolean;
  asset?: boolean;
}

export function getCapabilitiesFromProfile(
  profile: ProfileForCapabilities | null,
): Capability[] {
  if (!profile) return [];
  if (profile.role === "driver") return [];
  const caps: Capability[] = [];
  if (profile.aggregated !== false) {
    caps.push("dispatch", "marketplace_post", "finance_view", "finance_manage");
  }
  if (profile.asset !== false) {
    caps.push("fleet_management", "dispatch_for_own_fleet", "marketplace_bid", "finance_manage");
  }
  return [...new Set(caps)];
}
