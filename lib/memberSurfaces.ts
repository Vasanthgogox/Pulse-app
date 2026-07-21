/**
 * Per-member RBAC surfaces — the drill-down grant catalog for Pulse.
 *
 * Resolution (non-owner/admin):
 *   org operating-model capabilities ∩ member.permissions.surfaces
 *
 * Each surface maps to Capability token(s). Fine actions that share a Capability
 * (e.g. create-indent vs create-trip) are gated by surface id at the call site
 * via `useMemberAccess().can(id)` / `memberHasSurface`.
 *
 * See docs/RBAC_OPERATING_MODEL.md.
 */
import type { Capability } from "@/lib/capabilities";
import type {
  FunctionalRole,
  MemberDomainFlags,
  PlatformTeamRole,
} from "@/features/organization/utils/teamInviteRoles.util";

export type MemberSurfaceId =
  // Finance
  | "finance.tab"
  | "finance.view"
  | "finance.manage"
  | "finance.subtab.cash"
  | "finance.subtab.customers"
  | "finance.subtab.suppliers"
  | "finance.subtab.garage"
  | "finance.subtab.drivers"
  | "finance.ledger.customers"
  | "finance.ledger.suppliers"
  | "finance.ledger.vehicle"
  | "finance.ledger.driver"
  | "finance.add_transaction"
  | "finance.invoicing"
  | "finance.pod_reconciliation"
  | "finance.business_pulse"
  // Sales / network
  | "sales.tab"
  | "sales.clients.view"
  | "sales.clients.create"
  | "sales.clients.edit"
  | "sales.marketplace.post"
  | "sales.marketplace.bid"
  | "sales.network.connect"
  | "sales.suppliers.view"
  | "sales.suppliers.create"
  // TripOps / dispatch
  | "tripops.tab"
  | "tripops.trips.view"
  | "tripops.trips.create_asset"
  | "tripops.trips.create_aggregate"
  | "tripops.trips.assign"
  | "tripops.trips.detail"
  | "tripops.indents.view"
  | "tripops.indents.create"
  | "tripops.indents.allocate"
  // Fleet (asset path)
  | "fleet.vehicles.view"
  | "fleet.vehicles.create"
  | "fleet.drivers.view"
  | "fleet.drivers.create"
  // Team
  | "team.manage"
  | "team.invite"
  | "team.audit";

export type MemberSurfaceMap = Partial<Record<MemberSurfaceId, boolean>>;

export type MemberSurfaceDef = {
  id: MemberSurfaceId;
  label: string;
  hint: string;
  /** UI grouping under the permission page. */
  domain: FunctionalRole | "fleet" | "team";
  /** Org must have ANY of these capabilities (operating-model gate). */
  anyOfCaps: readonly Capability[];
  /**
   * Parent surface that must also be on (e.g. finance.manage → finance.view).
   * Checked after org ∩ member map.
   */
  requires?: MemberSurfaceId;
};

export const MEMBER_SURFACE_CATALOG: readonly MemberSurfaceDef[] = [
  // ── Finance ──────────────────────────────────────────────────────────────
  {
    id: "finance.tab",
    label: "Finance tab",
    hint: "Open the Fiscal tab",
    domain: "finance",
    anyOfCaps: ["finance_view", "finance_manage"],
  },
  {
    id: "finance.view",
    label: "View finance",
    hint: "Ledgers, balances, reports (read)",
    domain: "finance",
    anyOfCaps: ["finance_view", "finance_manage"],
    requires: "finance.tab",
  },
  {
    id: "finance.manage",
    label: "Manage finance",
    hint: "Create/edit ledger entries and fiscal actions",
    domain: "finance",
    anyOfCaps: ["finance_manage"],
    requires: "finance.view",
  },
  {
    id: "finance.subtab.cash",
    label: "Cash sub-tab",
    hint: "Finance → Cash",
    domain: "finance",
    anyOfCaps: ["finance_view", "finance_manage"],
    requires: "finance.view",
  },
  {
    id: "finance.subtab.customers",
    label: "Customers sub-tab",
    hint: "Finance → Customers (needs clients)",
    domain: "finance",
    anyOfCaps: ["dispatch", "dispatch_for_own_fleet"],
    requires: "finance.view",
  },
  {
    id: "finance.subtab.suppliers",
    label: "Suppliers sub-tab",
    hint: "Finance → Suppliers (aggregate / hybrid)",
    domain: "finance",
    anyOfCaps: ["dispatch"],
    requires: "finance.view",
  },
  {
    id: "finance.subtab.garage",
    label: "Garage sub-tab",
    hint: "Finance → Garage (asset / hybrid)",
    domain: "finance",
    anyOfCaps: ["fleet_management", "dispatch_for_own_fleet"],
    requires: "finance.view",
  },
  {
    id: "finance.subtab.drivers",
    label: "Drivers sub-tab",
    hint: "Finance → Drivers (asset / hybrid)",
    domain: "finance",
    anyOfCaps: ["fleet_management", "dispatch_for_own_fleet"],
    requires: "finance.view",
  },
  {
    id: "finance.ledger.customers",
    label: "Ledger · customers",
    hint: "Cash-tab party filter: customers",
    domain: "finance",
    anyOfCaps: ["dispatch", "dispatch_for_own_fleet"],
    requires: "finance.subtab.cash",
  },
  {
    id: "finance.ledger.suppliers",
    label: "Ledger · suppliers",
    hint: "Cash-tab party filter: suppliers",
    domain: "finance",
    anyOfCaps: ["dispatch"],
    requires: "finance.subtab.cash",
  },
  {
    id: "finance.ledger.vehicle",
    label: "Ledger · vehicles",
    hint: "Cash-tab party filter: vehicles",
    domain: "finance",
    anyOfCaps: ["fleet_management", "dispatch_for_own_fleet"],
    requires: "finance.subtab.cash",
  },
  {
    id: "finance.ledger.driver",
    label: "Ledger · drivers",
    hint: "Cash-tab party filter: drivers",
    domain: "finance",
    anyOfCaps: ["fleet_management", "dispatch_for_own_fleet"],
    requires: "finance.subtab.cash",
  },
  {
    id: "finance.add_transaction",
    label: "Add transaction",
    hint: "Add ledger entry from party / trip screens",
    domain: "finance",
    anyOfCaps: ["finance_manage"],
    requires: "finance.manage",
  },
  {
    id: "finance.invoicing",
    label: "Invoicing",
    hint: "Execute invoices & PDF preview",
    domain: "finance",
    anyOfCaps: ["finance_view", "finance_manage"],
    requires: "finance.view",
  },
  {
    id: "finance.pod_reconciliation",
    label: "POD reconciliation",
    hint: "POD reconcile & log incoming PODs",
    domain: "finance",
    anyOfCaps: ["finance_view", "finance_manage", "dispatch", "dispatch_for_own_fleet"],
    requires: "finance.view",
  },
  {
    id: "finance.business_pulse",
    label: "Business Pulse",
    hint: "Business pulse dashboard",
    domain: "finance",
    anyOfCaps: ["finance_view", "finance_manage"],
    requires: "finance.view",
  },

  // ── Sales ────────────────────────────────────────────────────────────────
  {
    id: "sales.tab",
    label: "Network tab",
    hint: "Open Network / sales home",
    domain: "sales",
    anyOfCaps: ["marketplace_post", "marketplace_bid", "dispatch", "dispatch_for_own_fleet"],
  },
  {
    id: "sales.clients.view",
    label: "View clients",
    hint: "Clients list & party customers",
    domain: "sales",
    anyOfCaps: ["dispatch", "dispatch_for_own_fleet"],
    requires: "sales.tab",
  },
  {
    id: "sales.clients.create",
    label: "Add client",
    hint: "Create client records",
    domain: "sales",
    anyOfCaps: ["dispatch", "dispatch_for_own_fleet"],
    requires: "sales.clients.view",
  },
  {
    id: "sales.clients.edit",
    label: "Edit client",
    hint: "Edit client profiles",
    domain: "sales",
    anyOfCaps: ["dispatch", "dispatch_for_own_fleet"],
    requires: "sales.clients.view",
  },
  {
    id: "sales.marketplace.post",
    label: "Post loads / give-load",
    hint: "Marketplace post & create-post (aggregate / hybrid)",
    domain: "sales",
    anyOfCaps: ["marketplace_post", "dispatch"],
    requires: "sales.tab",
  },
  {
    id: "sales.marketplace.bid",
    label: "Marketplace bid",
    hint: "Bid on marketplace listings (asset / hybrid)",
    domain: "sales",
    anyOfCaps: ["marketplace_bid"],
    requires: "sales.tab",
  },
  {
    id: "sales.network.connect",
    label: "Network connect",
    hint: "Send connection requests",
    domain: "sales",
    anyOfCaps: ["marketplace_post", "marketplace_bid", "dispatch", "dispatch_for_own_fleet"],
    requires: "sales.tab",
  },
  {
    id: "sales.suppliers.view",
    label: "View suppliers",
    hint: "Supplier directory (aggregate / hybrid)",
    domain: "sales",
    anyOfCaps: ["dispatch"],
    requires: "sales.tab",
  },
  {
    id: "sales.suppliers.create",
    label: "Add supplier",
    hint: "Create supplier records",
    domain: "sales",
    anyOfCaps: ["dispatch"],
    requires: "sales.suppliers.view",
  },

  // ── TripOps ──────────────────────────────────────────────────────────────
  {
    id: "tripops.tab",
    label: "Trips tab",
    hint: "Open Trips home",
    domain: "tripops",
    anyOfCaps: ["dispatch", "dispatch_for_own_fleet"],
  },
  {
    id: "tripops.trips.view",
    label: "View trips",
    hint: "Trips list",
    domain: "tripops",
    anyOfCaps: ["dispatch", "dispatch_for_own_fleet"],
    requires: "tripops.tab",
  },
  {
    id: "tripops.trips.detail",
    label: "Trip detail",
    hint: "Open trip detail, ops, verification",
    domain: "tripops",
    anyOfCaps: ["dispatch", "dispatch_for_own_fleet", "finance_view", "finance_manage"],
    requires: "tripops.trips.view",
  },
  {
    id: "tripops.trips.create_asset",
    label: "Create trip · own fleet",
    hint: "Asset / hybrid supply mode",
    domain: "tripops",
    anyOfCaps: ["fleet_management", "dispatch_for_own_fleet"],
    requires: "tripops.trips.view",
  },
  {
    id: "tripops.trips.create_aggregate",
    label: "Create trip · partner",
    hint: "Aggregate / hybrid supply mode",
    domain: "tripops",
    anyOfCaps: ["dispatch"],
    requires: "tripops.trips.view",
  },
  {
    id: "tripops.trips.assign",
    label: "Assign driver / vehicle",
    hint: "Assignment on trip cards & detail",
    domain: "tripops",
    anyOfCaps: ["dispatch", "dispatch_for_own_fleet"],
    requires: "tripops.trips.detail",
  },
  {
    id: "tripops.indents.view",
    label: "View indents / pulse loads",
    hint: "Indent list & detail (give-load path)",
    domain: "tripops",
    anyOfCaps: ["dispatch", "dispatch_for_own_fleet"],
    requires: "tripops.tab",
  },
  {
    id: "tripops.indents.create",
    label: "Create indent",
    hint: "Give-load create (aggregate / hybrid only)",
    domain: "tripops",
    anyOfCaps: ["dispatch"],
    requires: "tripops.indents.view",
  },
  {
    id: "tripops.indents.allocate",
    label: "Allocate indent",
    hint: "Indent allocation & supplier assign",
    domain: "tripops",
    anyOfCaps: ["dispatch"],
    requires: "tripops.indents.view",
  },

  // ── Fleet ────────────────────────────────────────────────────────────────
  {
    id: "fleet.vehicles.view",
    label: "View vehicles",
    hint: "Resources / party vehicles (asset / hybrid)",
    domain: "fleet",
    anyOfCaps: ["fleet_management"],
  },
  {
    id: "fleet.vehicles.create",
    label: "Add vehicle",
    hint: "Create vehicle records",
    domain: "fleet",
    anyOfCaps: ["fleet_management"],
    requires: "fleet.vehicles.view",
  },
  {
    id: "fleet.drivers.view",
    label: "View drivers",
    hint: "Resources / party drivers (asset / hybrid)",
    domain: "fleet",
    anyOfCaps: ["fleet_management"],
  },
  {
    id: "fleet.drivers.create",
    label: "Add driver",
    hint: "Create driver records",
    domain: "fleet",
    anyOfCaps: ["fleet_management"],
    requires: "fleet.drivers.view",
  },

  // ── Team ─────────────────────────────────────────────────────────────────
  {
    id: "team.manage",
    label: "Manage team",
    hint: "Access control & member roles",
    domain: "team",
    anyOfCaps: ["team_manage"],
  },
  {
    id: "team.invite",
    label: "Invite members",
    hint: "Send team invites",
    domain: "team",
    anyOfCaps: ["team_manage"],
    requires: "team.manage",
  },
  {
    id: "team.audit",
    label: "Audit trail",
    hint: "Workspace audit log",
    domain: "team",
    anyOfCaps: ["team_manage"],
    requires: "team.manage",
  },
] as const;

const SURFACE_BY_ID: Record<MemberSurfaceId, MemberSurfaceDef> = MEMBER_SURFACE_CATALOG.reduce(
  (acc, def) => {
    acc[def.id] = def;
    return acc;
  },
  {} as Record<MemberSurfaceId, MemberSurfaceDef>,
);

export function memberSurfaceDef(id: MemberSurfaceId): MemberSurfaceDef {
  return SURFACE_BY_ID[id];
}

export function surfacesForDomain(
  domain: MemberSurfaceDef["domain"],
): MemberSurfaceDef[] {
  return MEMBER_SURFACE_CATALOG.filter((s) => s.domain === domain);
}

/** Cash-tab ledger party filter → surface id (`all` uses cash sub-tab). */
export function ledgerCategorySurface(
  category: "all" | "customers" | "suppliers" | "vehicle" | "driver",
): MemberSurfaceId {
  switch (category) {
    case "customers":
      return "finance.ledger.customers";
    case "suppliers":
      return "finance.ledger.suppliers";
    case "vehicle":
      return "finance.ledger.vehicle";
    case "driver":
      return "finance.ledger.driver";
    case "all":
    default:
      return "finance.subtab.cash";
  }
}

/** Org allows this surface (capability / operating-model gate only). */
export function orgAllowsSurface(
  orgCaps: Capability[],
  id: MemberSurfaceId,
): boolean {
  const def = SURFACE_BY_ID[id];
  if (!def) return false;
  return def.anyOfCaps.some((c) => orgCaps.includes(c));
}

/**
 * Default surface map for a platform role preset.
 * Only surfaces the org allows should be persisted as true by the UI.
 */
export function defaultSurfacesForRole(
  role: PlatformTeamRole,
  orgCaps: Capability[],
): MemberSurfaceMap {
  const allOn = (ids: MemberSurfaceId[]) => {
    const map: MemberSurfaceMap = {};
    for (const id of ids) {
      if (orgAllowsSurface(orgCaps, id)) map[id] = true;
    }
    return map;
  };

  switch (role) {
    case "admin":
      return allOn(MEMBER_SURFACE_CATALOG.map((s) => s.id));
    case "finance":
      return allOn(
        MEMBER_SURFACE_CATALOG.filter((s) => s.domain === "finance").map((s) => s.id),
      );
    case "sales":
      return allOn(
        MEMBER_SURFACE_CATALOG.filter(
          (s) => s.domain === "sales" || s.id === "sales.clients.view",
        ).map((s) => s.id),
      );
    case "tripops":
      return allOn(
        MEMBER_SURFACE_CATALOG.filter(
          (s) => s.domain === "tripops" || s.domain === "fleet",
        ).map((s) => s.id),
      );
    case "planner":
      return allOn([
        "sales.tab",
        "sales.clients.view",
        "sales.clients.create",
        "tripops.tab",
        "tripops.indents.view",
        "tripops.indents.create",
        "tripops.indents.allocate",
      ]);
    case "operator":
      return allOn([
        "tripops.tab",
        "tripops.trips.view",
        "tripops.trips.detail",
        "tripops.trips.assign",
        "fleet.drivers.view",
        "fleet.vehicles.view",
      ]);
    default:
      return {};
  }
}

/** Derive coarse domain flags from an enabled surface map. */
export function domainsFromSurfaces(surfaces: MemberSurfaceMap): MemberDomainFlags {
  return {
    finance: !!surfaces["finance.tab"],
    sales: !!surfaces["sales.tab"],
    tripops: !!surfaces["tripops.tab"],
  };
}

/**
 * Effective surface grant: org allows ∩ member map (default false if unset) ∩ parent chain.
 */
export function memberHasSurface(
  orgCaps: Capability[],
  surfaces: MemberSurfaceMap | null | undefined,
  id: MemberSurfaceId,
  bypass = false,
): boolean {
  if (bypass) return orgAllowsSurface(orgCaps, id);
  if (!orgAllowsSurface(orgCaps, id)) return false;
  if (!surfaces || surfaces[id] !== true) return false;
  const def = SURFACE_BY_ID[id];
  if (def.requires) {
    return memberHasSurface(orgCaps, surfaces, def.requires, false);
  }
  return true;
}

/**
 * Capabilities implied by the member's enabled surfaces, intersected with org caps.
 * Used so existing useCapabilities() helpers & nav grants soft-filter for members.
 */
export function capabilitiesFromMemberSurfaces(
  orgCaps: Capability[],
  surfaces: MemberSurfaceMap | null | undefined,
  bypass = false,
): Capability[] {
  if (bypass) return orgCaps;
  if (!surfaces) return [];
  const set = new Set<Capability>();
  for (const def of MEMBER_SURFACE_CATALOG) {
    if (!memberHasSurface(orgCaps, surfaces, def.id, false)) continue;
    for (const c of def.anyOfCaps) {
      if (orgCaps.includes(c)) set.add(c);
    }
  }
  // Preserve finance_view if finance_manage granted via a manage surface.
  if (set.has("finance_manage")) set.add("finance_view");
  return orgCaps.filter((c) => set.has(c));
}

/** Toggle a surface and cascade children off when parent turns off. */
export function applySurfaceToggle(
  current: MemberSurfaceMap,
  id: MemberSurfaceId,
  next: boolean,
  orgCaps: Capability[],
): MemberSurfaceMap {
  const out: MemberSurfaceMap = { ...current, [id]: next };
  if (!next) {
    for (const def of MEMBER_SURFACE_CATALOG) {
      if (def.requires === id || dependsOn(def.id, id)) {
        out[def.id] = false;
      }
    }
  } else {
    // Ensure parent chain on
    let cursor: MemberSurfaceId | undefined = SURFACE_BY_ID[id]?.requires;
    while (cursor) {
      if (orgAllowsSurface(orgCaps, cursor)) out[cursor] = true;
      cursor = SURFACE_BY_ID[cursor]?.requires;
    }
  }
  return out;
}

function dependsOn(child: MemberSurfaceId, parent: MemberSurfaceId): boolean {
  let cursor: MemberSurfaceId | undefined = SURFACE_BY_ID[child]?.requires;
  while (cursor) {
    if (cursor === parent) return true;
    cursor = SURFACE_BY_ID[cursor]?.requires;
  }
  return false;
}

/** Sync domain master switches → surface bulk on/off for that domain. */
export function applyDomainToggle(
  current: MemberSurfaceMap,
  domain: FunctionalRole,
  next: boolean,
  orgCaps: Capability[],
): MemberSurfaceMap {
  const out: MemberSurfaceMap = { ...current };
  const domains: MemberSurfaceDef["domain"][] =
    domain === "tripops" ? ["tripops", "fleet"] : [domain];
  const ids = MEMBER_SURFACE_CATALOG.filter((s) =>
    domains.includes(s.domain),
  ).map((s) => s.id);
  if (!next) {
    for (const id of ids) out[id] = false;
    return out;
  }
  const defaults = defaultSurfacesForRole(domain, orgCaps);
  for (const id of ids) {
    if (defaults[id]) {
      out[id] = true;
      continue;
    }
    // Sensible defaults when enabling a domain: tab + view surfaces
    if (
      orgAllowsSurface(orgCaps, id) &&
      (id.endsWith(".tab") ||
        id.endsWith(".view") ||
        id === "finance.view" ||
        id === "finance.subtab.cash")
    ) {
      out[id] = true;
    }
  }
  return out;
}
