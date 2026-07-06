/**
 * Platform Identity team roles — aligned with platform.roles seed and @pulse/contracts.
 * Maps to legacy organization_members.role for mobile Supabase writes.
 */
import type { OrgMember, OrgMemberRole } from "@/types/organization";

export type PlatformTeamRole = "admin" | "planner" | "operator";

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
  ],
  planner: [
    "org:read",
    "warehouses:read",
    "warehouses:write",
    "commerce:*",
    "planning:*",
  ],
  operator: ["org:read", "warehouses:read", "ops:*", "execution:read"],
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
    value: "planner",
    label: "Planner",
    description: "Commerce and planning — customers, indents, load planning, and warehouses.",
    grants: PLATFORM_ROLE_GRANTS.planner,
  },
  {
    value: "operator",
    label: "Operator",
    description: "Day-to-day execution — trips, dispatch, driver coordination, and trip visibility.",
    grants: PLATFORM_ROLE_GRANTS.operator,
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
