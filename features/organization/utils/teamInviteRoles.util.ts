/**
 * Platform Identity team roles — aligned with platform.roles seed and @pulse/contracts.
 * Maps to legacy organization_members.role for mobile Supabase writes.
 */
import type { OrgMember, OrgMemberRole } from "@/types/organization";

/**
 * `planner` / `operator` are retired from new invites (superseded by the named
 * functional roles below) but stay in the union so pre-existing stored rows
 * still resolve to a real type instead of falling through to `null`.
 */
export type PlatformTeamRole =
  | "admin"
  | "planner"
  | "operator"
  | "finance"
  | "sales"
  | "tripops";

const ALL_PLATFORM_TEAM_ROLES: readonly PlatformTeamRole[] = [
  "admin",
  "planner",
  "operator",
  "finance",
  "sales",
  "tripops",
];

/** Narrows a raw string (e.g. from an RPC payload) to a known `PlatformTeamRole`. */
export function isPlatformTeamRole(value: string): value is PlatformTeamRole {
  return (ALL_PLATFORM_TEAM_ROLES as readonly string[]).includes(value);
}

/** Named functional roles an owner can assign to a non-admin member. */
export type FunctionalRole = "finance" | "sales" | "tripops";

export type TeamInvitePermissions = {
  platformRole: PlatformTeamRole;
  grants: string[];
};

const PERMISSION_LABELS: Record<string, string> = {
  "org:read": "View organisation",
  "org:write": "Edit organisation settings",
  "organizations:create": "Create organisations",
  "warehouses:read": "View warehouses",
  "warehouses:write": "Manage warehouses",
  "users:invite": "Invite team members",
  "users:manage": "Manage team members",
  "commerce:*": "Commerce — products, orders, CRM",
  "planning:*": "Planning — indents & load planning",
  "ops:*": "Operations — dispatch & trips",
  "execution:read": "View trips & execution",
  "finance:read": "View finance & ledgers",
  "finance:manage": "Manage finance & invoicing",
};

export const PLATFORM_ROLE_GRANTS: Record<PlatformTeamRole, string[]> = {
  admin: [
    "org:read",
    "org:write",
    "warehouses:read",
    "warehouses:write",
    "users:invite",
    "users:manage",
    "commerce:*",
    "planning:*",
    "ops:*",
    "finance:read",
    "finance:manage",
  ],
  planner: [
    "org:read",
    "warehouses:read",
    "warehouses:write",
    "commerce:*",
    "planning:*",
  ],
  operator: ["org:read", "warehouses:read", "ops:*", "execution:read"],
  finance: ["org:read", "finance:read", "finance:manage"],
  sales: ["org:read", "warehouses:read", "commerce:*"],
  tripops: ["org:read", "warehouses:read", "ops:*", "planning:*", "execution:read"],
};

export type TeamInviteRoleOption = {
  value: PlatformTeamRole;
  label: string;
  description: string;
  grants: string[];
};

export const TEAM_INVITE_ROLE_OPTIONS: TeamInviteRoleOption[] = [
  {
    value: "admin",
    label: "Administrator",
    description: "Full workspace access — team, settings, commerce, planning, and operations.",
    grants: PLATFORM_ROLE_GRANTS.admin,
  },
  {
    value: "finance",
    label: "Finance",
    description: "Finance and ledgers — cash, invoicing, and fiscal reporting.",
    grants: PLATFORM_ROLE_GRANTS.finance,
  },
  {
    value: "sales",
    label: "Sales",
    description: "Commerce and customers — marketplace, clients, and load posting.",
    grants: PLATFORM_ROLE_GRANTS.sales,
  },
  {
    value: "tripops",
    label: "TripOps",
    description: "Day-to-day execution — trips, dispatch, driver coordination, and trip visibility.",
    grants: PLATFORM_ROLE_GRANTS.tripops,
  },
];

export function permissionLabel(grant: string): string {
  return PERMISSION_LABELS[grant] ?? grant;
}

export function buildTeamInvitePermissions(
  platformRole: PlatformTeamRole,
): TeamInvitePermissions {
  return {
    platformRole,
    grants: PLATFORM_ROLE_GRANTS[platformRole],
  };
}

/** Legacy org_members.role value stored alongside permissions.platformRole. */
export function orgMemberRoleForPlatformRole(
  platformRole: PlatformTeamRole,
): OrgMemberRole {
  switch (platformRole) {
    case "admin":
      return "admin";
    case "planner":
      return "dispatcher";
    case "operator":
      return "member";
    case "finance":
      return "finance";
    case "sales":
      return "member";
    case "tripops":
      return "dispatcher";
  }
}

export function platformRoleLabel(role: PlatformTeamRole): string {
  return TEAM_INVITE_ROLE_OPTIONS.find((o) => o.value === role)?.label ?? role;
}

export function platformRoleFromMember(
  member: Pick<OrgMember, "role" | "permissions">,
): PlatformTeamRole | null {
  const raw = member.permissions as TeamInvitePermissions | null | undefined;
  if (raw?.platformRole) return raw.platformRole;
  switch (member.role) {
    case "admin":
      return "admin";
    case "dispatcher":
      return "planner";
    case "member":
      return "operator";
    default:
      return null;
  }
}

/**
 * Narrows a stored platform role to a functional role, for domain-access
 * intersection with the org operating model. `null` covers admin/owner
 * (bypass functional gating entirely) and unassigned/legacy planner/operator
 * rows (no functional domain access until the owner assigns one).
 */
export function functionalRoleFromPlatformRole(
  platformRole: PlatformTeamRole | null,
): FunctionalRole | null {
  if (
    platformRole === "finance" ||
    platformRole === "sales" ||
    platformRole === "tripops"
  ) {
    return platformRole;
  }
  return null;
}

export function memberDisplayRoleLabel(
  member: Pick<OrgMember, "role" | "permissions">,
): string {
  if (member.role === "owner") return "OWNER";
  const platform = platformRoleFromMember(member);
  if (platform) return platformRoleLabel(platform).toUpperCase();
  switch (member.role) {
    case "admin":
      return "ADMIN";
    case "dispatcher":
      return "DISPATCHER";
    case "finance":
      return "FINANCE";
    case "driver":
      return "DRIVER";
    default:
      return "MEMBER";
  }
}
