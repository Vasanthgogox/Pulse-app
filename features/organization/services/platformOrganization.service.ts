/**
 * Platform Organization Adapter
 *
 * Single read-only entry point for platform identity (`platform.*` schema, owned by
 * oms/'s Identity Service — see docs/decisions.md ADR-001/ADR-002/ADR-003).
 *
 * Rules:
 * - No feature outside this module may query platform.* directly.
 * - No mutations are permitted here (no createOrganization(), updateMembership(),
 *   acceptInvitation(), or similar) until the Platform Gateway exists (oms/ Sprint 2).
 * - Callers depend only on this API so the implementation can migrate from Supabase
 *   to the Platform Gateway without changing feature code.
 */
import { supabase } from "@/lib/supabase";
import type {
  PlatformInvitation,
  PlatformMembership,
  PlatformOrganization,
  PlatformUser,
} from "../types/platformOrganization.types";

export async function getCurrentUser(): Promise<{
  error: Error | null;
  user: PlatformUser | null;
}> {
  try {
    const { data: authData, error: authError } = await supabase().auth.getUser();
    if (authError) return { error: authError, user: null };

    const authUserId = authData.user?.id;
    if (!authUserId) return { error: null, user: null };

    const { data, error } = await supabase()
      .schema("platform")
      .from("users")
      .select("*")
      .eq("auth_user_id", authUserId)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) return { error: new Error(error.message), user: null };
    return { error: null, user: (data ?? null) as PlatformUser | null };
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)), user: null };
  }
}

/** Organizations the current user is an active member of — scoped by RLS (`is_member_of`), not a client-side filter. */
export async function getOrganizationsForCurrentUser(): Promise<{
  error: Error | null;
  organizations: PlatformOrganization[];
}> {
  try {
    const { data, error } = await supabase()
      .schema("platform")
      .from("organizations")
      .select("*")
      .is("deleted_at", null);

    if (error) return { error: new Error(error.message), organizations: [] };
    return { error: null, organizations: (data ?? []) as PlatformOrganization[] };
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)), organizations: [] };
  }
}

/**
 * Membership rows visible under RLS (`memberships_select_scope`): the current user's own
 * memberships, plus — for an org admin — other members' rows within organizations they
 * administer. Not strictly "only mine" in the admin case; that's the existing RLS policy's
 * definition, not a client-side choice made here.
 */
export async function getCurrentUserMemberships(): Promise<{
  error: Error | null;
  memberships: PlatformMembership[];
}> {
  try {
    const { data, error } = await supabase()
      .schema("platform")
      .from("memberships")
      .select("*");

    if (error) return { error: new Error(error.message), memberships: [] };
    return { error: null, memberships: (data ?? []) as PlatformMembership[] };
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)), memberships: [] };
  }
}

/**
 * Invitations visible under RLS (`invitations_select_admin`): today, that means only
 * invitations within organizations the current user administers — not invitations
 * addressed to the current user as an invitee (no such policy exists yet on
 * platform.invitations). Expect this to return empty for a typical invitee today.
 */
export async function getInvitationsForCurrentUser(): Promise<{
  error: Error | null;
  invitations: PlatformInvitation[];
}> {
  try {
    const { data, error } = await supabase()
      .schema("platform")
      .from("invitations")
      .select("*");

    if (error) return { error: new Error(error.message), invitations: [] };
    return { error: null, invitations: (data ?? []) as PlatformInvitation[] };
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)), invitations: [] };
  }
}
