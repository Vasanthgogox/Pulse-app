/**
 * Invitation resolver — post-OTP lookup and idempotent accept.
 * V1 backing store: public.organization_team_invites (phone).
 * V2 entry point: resolveInvitationsByIdentities() in onboardingInvitationResolver.ts
 * (identity-channel agnostic; phone RPCs delegated from there).
 */
import { supabase } from "@/lib/supabase";
import type { PlatformTeamRole } from "@/features/organization/utils/teamInviteRoles.util";
import { platformRoleLabel } from "@/features/organization/utils/teamInviteRoles.util";

export type ResolvedTeamInvitation = {
  inviteId: string;
  inviteeName: string;
  inviteeEmail: string | null;
  organizationId: string;
  organizationName: string;
  invitedByName: string;
  role: string;
  platformRole: PlatformTeamRole | null;
  platformRoleLabel: string;
  businessUnitName: string | null;
  departmentName: string | null;
  createdAt: string;
  expiresAt: string;
  isExpired: boolean;
  status: string;
};

export type InvitationResolverResult = {
  active: ResolvedTeamInvitation[];
  expired: ResolvedTeamInvitation[];
};

function mapRow(row: {
  invite_id: string;
  invitee_name: string;
  organization_id: string;
  organization_name: string;
  invited_by_name: string;
  role: string;
  platform_role: string;
  business_unit_name: string | null;
  department_name: string | null;
  invitee_email: string | null;
  created_at: string;
  expires_at: string;
  is_expired: boolean;
  status: string;
}): ResolvedTeamInvitation {
  const platformRole = (["admin", "planner", "operator"] as const).includes(
    row.platform_role as PlatformTeamRole,
  )
    ? (row.platform_role as PlatformTeamRole)
    : null;

  return {
    inviteId: row.invite_id,
    inviteeName: row.invitee_name,
    inviteeEmail: row.invitee_email,
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    invitedByName: row.invited_by_name,
    role: row.role,
    platformRole,
    platformRoleLabel: platformRole
      ? platformRoleLabel(platformRole)
      : row.role,
    businessUnitName: row.business_unit_name,
    departmentName: row.department_name,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    isExpired: row.is_expired,
    status: row.status,
  };
}

export async function resolveTeamInvitationsByPhone(
  phone: string,
): Promise<{ error: Error | null; result: InvitationResolverResult }> {
  const empty: InvitationResolverResult = { active: [], expired: [] };
  try {
    await supabase().rpc("expire_stale_team_invitations", { p_phone: phone });

    const { data, error } = await supabase().rpc(
      "resolve_pending_team_invitations_by_phone",
      { p_phone: phone },
    );
    if (error) return { error: new Error(error.message), result: empty };

    const rows = (data ?? []) as Parameters<typeof mapRow>[0][];
    const mapped = rows.map(mapRow);
    return {
      error: null,
      result: {
        active: mapped.filter((i) => !i.isExpired && i.status === "pending"),
        expired: mapped.filter((i) => i.isExpired || i.status === "expired"),
      },
    };
  } catch (e) {
    return {
      error: e instanceof Error ? e : new Error(String(e)),
      result: empty,
    };
  }
}

export async function acceptPendingTeamInvitation(inviteId: string): Promise<{
  error: Error | null;
  organizationId: string | null;
  membershipId: string | null;
  alreadyAccepted?: boolean;
}> {
  try {
    const { data, error } = await supabase().rpc("accept_pending_team_invitation", {
      p_invite_id: inviteId,
    });
    if (error) return { error: new Error(error.message), organizationId: null, membershipId: null };

    const payload = data as {
      organization_id?: string;
      membership_id?: string;
      already_accepted?: boolean;
      already_member?: boolean;
    } | null;

    return {
      error: null,
      organizationId: payload?.organization_id ?? null,
      membershipId: payload?.membership_id ?? null,
      alreadyAccepted: payload?.already_accepted || payload?.already_member,
    };
  } catch (e) {
    return {
      error: e instanceof Error ? e : new Error(String(e)),
      organizationId: null,
      membershipId: null,
    };
  }
}

export function formatInvitationAge(createdAt: string): string {
  const ms = Date.now() - new Date(createdAt).getTime();
  const days = Math.floor(ms / 86_400_000);
  if (days >= 1) return `${days} day${days === 1 ? "" : "s"} ago`;
  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 1) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const mins = Math.max(1, Math.floor(ms / 60_000));
  return `${mins} min${mins === 1 ? "" : "s"} ago`;
}
