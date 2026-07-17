/**
 * Capability-based access for unified user role.
 * Aligned with pulse-unified-base src/lib/capabilities.ts.
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
        // Own-fleet trips. Do not grant give-load; do not wipe indent create if `dispatch` already set it.
        p.trips = { view: true, create: true, assign: true };
        p.clients = true;
        if (!p.indents.view && !p.indents.create) {
          p.indents = { view: true, create: false, edit: false };
        }
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

/**
 * Any non-empty capability set — business workspace operators.
 * Drivers (and other empty-cap personas) resolve to false without role string checks.
 */
export function hasBusinessCapabilities(capabilities: Capability[]): boolean {
  return capabilities.length > 0;
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

/** Asset / own-fleet supply path (garage, asset trips). */
export function canUseAssetSupply(capabilities: Capability[]): boolean {
  return (
    capabilities.includes("fleet_management") ||
    capabilities.includes("dispatch_for_own_fleet")
  );
}

/** Aggregation supply path (suppliers / partner trips). */
export function canUseAggregateSupply(capabilities: Capability[]): boolean {
  return capabilities.includes("dispatch");
}

/**
 * Finance fiscal tabs visible for this org model.
 * Asset-only: no suppliers. Aggregate-only: no garage (vehicles).
 */
export function canAccessFinanceSubTab(
  capabilities: Capability[],
  tab: "cash" | "customers" | "suppliers" | "garage" | "drivers",
): boolean {
  if (tab === "cash") return true;
  const p = getEffectivePermissions(capabilities);
  switch (tab) {
    case "customers":
      return p.clients;
    case "suppliers":
      return p.suppliers;
    case "garage":
      return p.vehicles;
    case "drivers":
      return p.drivers;
    default:
      return false;
  }
}

/** Ledger cash-tab party filters. */
export function canAccessLedgerCategory(
  capabilities: Capability[],
  category: "all" | "customers" | "suppliers" | "vehicle" | "driver",
): boolean {
  if (category === "all") return true;
  const p = getEffectivePermissions(capabilities);
  switch (category) {
    case "customers":
      return p.clients;
    case "suppliers":
      return p.suppliers;
    case "vehicle":
      return p.vehicles;
    case "driver":
      return p.drivers;
    default:
      return false;
  }
}

/** Party directory / hub rows. */
export function canAccessPartyKind(
  capabilities: Capability[],
  kind: "customers" | "suppliers" | "drivers" | "vehicles",
): boolean {
  const p = getEffectivePermissions(capabilities);
  switch (kind) {
    case "customers":
      return p.clients;
    case "suppliers":
      return p.suppliers;
    case "drivers":
      return p.drivers;
    case "vehicles":
      return p.vehicles;
    default:
      return false;
  }
}

export interface ProfileForCapabilities {
  role: string;
  aggregated?: boolean;
  asset?: boolean;
}

export type OperatingModelForCapabilities =
  | "ASSET_BASED"
  | "NON_ASSET"
  | "HYBRID";

/** Map org operating_model → aggregated / asset flags. */
export function flagsFromOperatingModel(
  operatingModel: OperatingModelForCapabilities | string | null | undefined,
): { aggregated: boolean; asset: boolean } | null {
  if (operatingModel === "ASSET_BASED") return { aggregated: false, asset: true };
  if (operatingModel === "NON_ASSET") return { aggregated: true, asset: false };
  if (operatingModel === "HYBRID") return { aggregated: true, asset: true };
  return null;
}

export function getCapabilitiesFromProfile(
  profile: ProfileForCapabilities | null,
  operatingModel?: OperatingModelForCapabilities | string | null,
): Capability[] {
  if (!profile) return [];
  if (profile.role === "driver") return [];

  const fromOrg = flagsFromOperatingModel(operatingModel);
  const aggregated = fromOrg ? fromOrg.aggregated : profile.aggregated !== false;
  const asset = fromOrg ? fromOrg.asset : profile.asset !== false;

  const caps: Capability[] = [];
  if (aggregated) {
    caps.push("dispatch", "marketplace_post", "finance_view", "finance_manage");
  }
  if (asset) {
    caps.push(
      "fleet_management",
      "dispatch_for_own_fleet",
      "marketplace_bid",
      "finance_manage",
    );
  }
  return [...new Set(caps)];
}
