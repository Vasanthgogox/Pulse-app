/**
 * Organization members service — Supabase only (mobile).
 * Handles team member invite, list, role change, and removal.
 */
import { supabase } from "@/lib/supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type {
  OrgMember,
  OrgTeamRoster,
  PendingPhoneTeamInvite,
  TeamInvite,
  UserProfileForInvite,
} from "@/types/organization";
import {
  precheckTeamInviteContact,
  precheckToProfile,
} from "@/features/organization/services/teamInvitePrecheck.service";
import {
  buildTeamInvitePermissions,
  orgMemberRoleForPlatformRole,
  type PlatformTeamRole,
} from "@/features/organization/utils/teamInviteRoles.util";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizePhone(phone: string): string {
  return phone.replace(/\s+/g, "").trim();
}

// ─── List members + pending phone invites ─────────────────────────────────────

export async function getOrgTeamRoster(orgId: string): Promise<{
  error: Error | null;
  roster: OrgTeamRoster;
}> {
  const empty: OrgTeamRoster = { members: [], pendingPhoneInvites: [] };
  try {
    const [membersRes, pendingRes] = await Promise.all([
      getOrganizationMembers(orgId),
      getPendingPhoneTeamInvites(orgId),
    ]);
    if (membersRes.error) return { error: membersRes.error, roster: empty };
    if (pendingRes.error) return { error: pendingRes.error, roster: empty };
    return {
      error: null,
      roster: {
        members: membersRes.members,
        pendingPhoneInvites: pendingRes.invites,
      },
    };
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)), roster: empty };
  }
}

export async function getPendingPhoneTeamInvites(orgId: string): Promise<{
  error: Error | null;
  invites: PendingPhoneTeamInvite[];
}> {
  try {
    const { data, error } = await supabase().rpc("get_org_team_pending_invites", {
      p_org_id: orgId,
    });
    if (error) return { error: new Error(error.message), invites: [] };
    return { error: null, invites: (data ?? []) as PendingPhoneTeamInvite[] };
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)), invites: [] };
  }
}

export function subscribeToOrgTeamRoster(
  orgId: string,
  onChange: () => void,
): () => void {
  const channel: RealtimeChannel = supabase()
    .channel(`org-team:${orgId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "organization_members",
        filter: `organization_id=eq.${orgId}`,
      },
      () => onChange(),
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "organization_team_invites",
        filter: `organization_id=eq.${orgId}`,
      },
      () => onChange(),
    )
    .subscribe();

  return () => {
    supabase().removeChannel(channel);
  };
}

// ─── List members ──────────────────────────────────────────────────────────────

export async function getOrganizationMembers(orgId: string): Promise<{
  error: Error | null;
  members: OrgMember[];
}> {
  try {
    const { data, error } = await supabase().rpc(
      "get_org_members_with_profiles",
      { p_org_id: orgId },
    );
    if (!error && data) {
      return { error: null, members: data as OrgMember[] };
    }
    if (error) {
      // Fallback: direct join if RPC not yet deployed
      const { data: fallback, error: fallbackErr } = await supabase()
        .from("organization_members")
        .select("id, organization_id, user_id, role, status, permissions, joined_at")
        .eq("organization_id", orgId)
        .neq("status", "inactive")
        .order("joined_at", { ascending: true });
      if (fallbackErr) return { error: new Error(fallbackErr.message), members: [] };
      return { error: null, members: (fallback ?? []) as OrgMember[] };
    }
    return { error: null, members: [] };
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)), members: [] };
  }
}

// ─── Phone lookup ──────────────────────────────────────────────────────────────

export async function lookupUserByPhone(phone: string): Promise<{
  error: Error | null;
  profile: UserProfileForInvite | null;
}> {
  const normalized = normalizePhone(phone);
  if (!normalized) return { error: new Error("Phone is required"), profile: null };

  try {
    const { data, error } = await supabase().rpc("get_user_profile_by_phone", {
      p_phone: normalized,
    });
    if (error) {
      // Fallback: direct query
      const { data: fb, error: fbErr } = await supabase()
        .from("profiles")
        .select("id, full_name, phone, email, avatar_url, role")
        .ilike("phone", normalized)
        .limit(1)
        .maybeSingle();
      if (fbErr) return { error: new Error(fbErr.message), profile: null };
      if (!fb) return { error: null, profile: null };
      return {
        error: null,
        profile: {
          user_id: fb.id,
          full_name: fb.full_name,
          phone: fb.phone,
          email: fb.email,
          avatar_url: fb.avatar_url,
          role: fb.role,
        },
      };
    }
    const rows = Array.isArray(data) ? data : data ? [data] : [];
    if (!rows.length) return { error: null, profile: null };
    const row = rows[0] as {
      user_id: string;
      full_name: string | null;
      phone: string | null;
      email: string | null;
      avatar_url: string | null;
      role: string | null;
    };
    return {
      error: null,
      profile: {
        user_id: row.user_id,
        full_name: row.full_name,
        phone: row.phone,
        email: row.email,
        avatar_url: row.avatar_url,
        role: row.role,
      },
    };
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)), profile: null };
  }
}

// ─── Invite member (existing Pulse user) ─────────────────────────────────────

export async function inviteTeamMember(
  orgId: string,
  userId: string,
  platformRole: PlatformTeamRole,
): Promise<{
  error: Error | null;
  member: OrgMember | null;
  alreadyMember?: boolean;
  alreadyInvited?: boolean;
}> {
  const role = orgMemberRoleForPlatformRole(platformRole);
  const permissions = buildTeamInvitePermissions(platformRole);
  try {
    // Check for existing membership
    const { data: existing } = await supabase()
      .from("organization_members")
      .select("id, status, role")
      .eq("organization_id", orgId)
      .eq("user_id", userId)
      .maybeSingle();

    if (existing) {
      if (existing.status === "active") {
        return { error: null, member: null, alreadyMember: true };
      }
      if (existing.status === "invited") {
        return { error: null, member: null, alreadyInvited: true };
      }
      // Inactive → re-activate
      const { data: updated, error: updateErr } = await supabase()
        .from("organization_members")
        .update({
          status: "invited",
          role,
          permissions,
          joined_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .select()
        .maybeSingle();
      if (updateErr) return { error: new Error(updateErr.message), member: null };
      return { error: null, member: updated as OrgMember };
    }

    const { data, error } = await supabase()
      .from("organization_members")
      .insert({
        organization_id: orgId,
        user_id: userId,
        role,
        status: "invited",
        permissions,
        joined_at: new Date().toISOString(),
      })
      .select()
      .maybeSingle();

    if (error) return { error: new Error(error.message), member: null };
    return { error: null, member: data as OrgMember };
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)), member: null };
  }
}

// ─── Invite employee without Pulse account (phone pending) ───────────────────

export async function createPendingTeamInvite(
  orgId: string,
  params: {
    phone: string;
    name: string;
    email?: string | null;
    platformRole: PlatformTeamRole;
  },
): Promise<{
  error: Error | null;
  invite: PendingPhoneTeamInvite | null;
  alreadyPending?: boolean;
}> {
  const role = orgMemberRoleForPlatformRole(params.platformRole);
  const permissions = buildTeamInvitePermissions(params.platformRole);
  try {
    const { data, error } = await supabase().rpc("create_team_invite_pending", {
      p_org_id: orgId,
      p_phone: normalizePhone(params.phone),
      p_name: params.name.trim(),
      p_email: params.email?.trim() || null,
      p_role: role,
      p_permissions: permissions,
    });
    if (error) {
      if (error.message.includes("already has a Pulse account")) {
        return { error: new Error(error.message), invite: null };
      }
      return { error: new Error(error.message), invite: null };
    }
    return { error: null, invite: data as PendingPhoneTeamInvite };
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)), invite: null };
  }
}

export async function cancelPendingTeamInvite(
  inviteId: string,
): Promise<{ error: Error | null }> {
  try {
    const { error } = await supabase().rpc("cancel_team_invite_pending", {
      p_invite_id: inviteId,
    });
    if (error) return { error: new Error(error.message) };
    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)) };
  }
}

/**
 * Unified invite: existing Pulse user → membership row;
 * new employee → pending phone invite (claimed on signup).
 */
export async function inviteTeamMemberByContact(
  orgId: string,
  params: {
    phone: string;
    name: string;
    email?: string | null;
    platformRole: PlatformTeamRole;
    existingUserId?: string | null;
  },
): Promise<{
  error: Error | null;
  kind: "member" | "pending" | null;
  member: OrgMember | null;
  pendingInvite: PendingPhoneTeamInvite | null;
  alreadyMember?: boolean;
  alreadyInvited?: boolean;
  precheckAction?: string;
}> {
  if (!params.existingUserId) {
    const pre = await precheckTeamInviteContact(orgId, params.phone, params.email);
    if (pre.error) return { error: pre.error, kind: null, member: null, pendingInvite: null };
    const check = pre.result;
    if (check) {
      if (check.recommendedAction === "already_member") {
        return {
          error: null,
          kind: null,
          member: null,
          pendingInvite: null,
          alreadyMember: true,
          precheckAction: check.recommendedAction,
        };
      }
      if (check.recommendedAction === "already_invited") {
        return {
          error: null,
          kind: null,
          member: null,
          pendingInvite: null,
          alreadyInvited: true,
          precheckAction: check.recommendedAction,
        };
      }
      if (
        check.recommendedAction === "invite_existing_user" ||
        check.recommendedAction === "email_registered"
      ) {
        const profile = precheckToProfile(check);
        if (profile?.user_id) {
          const res = await inviteTeamMember(orgId, profile.user_id, params.platformRole);
          return {
            error: res.error,
            kind: res.member ? "member" : null,
            member: res.member,
            pendingInvite: null,
            alreadyMember: res.alreadyMember,
            alreadyInvited: res.alreadyInvited,
            precheckAction: check.recommendedAction,
          };
        }
        if (check.recommendedAction === "email_registered") {
          return {
            error: new Error(
              check.message ??
                "This email already has a Pulse account. They must sign in to accept — not sign up again.",
            ),
            kind: null,
            member: null,
            pendingInvite: null,
            precheckAction: check.recommendedAction,
          };
        }
      }
    }
  }

  if (params.existingUserId) {
    const res = await inviteTeamMember(orgId, params.existingUserId, params.platformRole);
    return {
      error: res.error,
      kind: res.member ? "member" : null,
      member: res.member,
      pendingInvite: null,
      alreadyMember: res.alreadyMember,
      alreadyInvited: res.alreadyInvited,
    };
  }
  const res = await createPendingTeamInvite(orgId, params);
  return {
    error: res.error,
    kind: res.invite ? "pending" : null,
    member: null,
    pendingInvite: res.invite,
  };
}

// ─── Update role ──────────────────────────────────────────────────────────────

export async function updateMemberRole(
  memberId: string,
  platformRole: PlatformTeamRole,
): Promise<{ error: Error | null }> {
  const role = orgMemberRoleForPlatformRole(platformRole);
  const permissions = buildTeamInvitePermissions(platformRole);
  try {
    const { error } = await supabase()
      .from("organization_members")
      .update({ role, permissions })
      .eq("id", memberId);
    if (error) return { error: new Error(error.message) };
    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)) };
  }
}

// ─── Remove member ─────────────────────────────────────────────────────────────

export async function removeMember(memberId: string): Promise<{ error: Error | null }> {
  try {
    const { error } = await supabase()
      .from("organization_members")
      .update({ status: "inactive" })
      .eq("id", memberId);
    if (error) return { error: new Error(error.message) };
    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)) };
  }
}

// ─── Cancel invite (by admin) ──────────────────────────────────────────────────

export async function cancelTeamInvite(
  memberOrInviteId: string,
  kind: "member" | "phone_pending" = "member",
): Promise<{ error: Error | null }> {
  if (kind === "phone_pending") {
    return cancelPendingTeamInvite(memberOrInviteId);
  }
  return removeMember(memberOrInviteId);
}

// ─── Invitee: accept ────────────────────────────────────────────────────────────

export async function acceptTeamInvite(orgId: string): Promise<{ error: Error | null }> {
  try {
    const { error } = await supabase().rpc("accept_team_invite", { p_org_id: orgId });
    if (error) {
      // Fallback: direct update
      const { data: { user } } = await supabase().auth.getUser();
      if (!user) return { error: new Error("Not signed in") };
      const { error: updErr } = await supabase()
        .from("organization_members")
        .update({ status: "active" })
        .eq("organization_id", orgId)
        .eq("user_id", user.id)
        .eq("status", "invited");
      if (updErr) return { error: new Error(updErr.message) };
    }
    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)) };
  }
}

// ─── Invitee: reject ────────────────────────────────────────────────────────────

export async function rejectTeamInvite(orgId: string): Promise<{ error: Error | null }> {
  try {
    const { error } = await supabase().rpc("reject_team_invite", { p_org_id: orgId });
    if (error) {
      const { data: { user } } = await supabase().auth.getUser();
      if (!user) return { error: new Error("Not signed in") };
      const { error: updErr } = await supabase()
        .from("organization_members")
        .update({ status: "inactive" })
        .eq("organization_id", orgId)
        .eq("user_id", user.id)
        .eq("status", "invited");
      if (updErr) return { error: new Error(updErr.message) };
    }
    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)) };
  }
}

// ─── Get pending invites for current user ─────────────────────────────────────

export async function getMyTeamInvites(): Promise<{
  error: Error | null;
  invites: TeamInvite[];
}> {
  try {
    const { data, error } = await supabase().rpc("get_my_team_invites");
    if (!error && data) {
      return { error: null, invites: data as TeamInvite[] };
    }
    if (error) {
      // Fallback
      const { data: { user } } = await supabase().auth.getUser();
      if (!user) return { error: null, invites: [] };
      const { data: fb, error: fbErr } = await supabase()
        .from("organization_members")
        .select("id, organization_id, role, joined_at")
        .eq("user_id", user.id)
        .eq("status", "invited");
      if (fbErr) return { error: new Error(fbErr.message), invites: [] };
      return { error: null, invites: (fb ?? []).map((r) => ({ ...r, org_name: "" })) as TeamInvite[] };
    }
    return { error: null, invites: [] };
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)), invites: [] };
  }
}
