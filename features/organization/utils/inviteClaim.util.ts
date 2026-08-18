import type { SupabaseClient } from "@/lib/supabase";

/**
 * Detect if the current user was just claimed via a pending team invite.
 * Called post-signup when `claim_pending_team_invites` trigger auto-claimed them.
 *
 * Usage: on first-app-load or in a toast-triggering hook, call this and show a
 * welcome-to-team banner if true.
 */
export async function wasUserJustClaimedByTeamInvite(
  supabase: SupabaseClient,
  userId: string,
): Promise<{
  claimed: boolean;
  teamName?: string;
}> {
  try {
    // Check for a recent organization_members row where the user was just added (joined_at is recent)
    // AND there's a matching organization_team_invites record with status='accepted' for this user+phone.
    // This is a heuristic: if joined_at is within the last few minutes and there's a pending→accepted transition,
    // the user was auto-claimed.
    const { data, error } = await supabase
      .from("organization_members")
      .select(
        `
        organization_id,
        joined_at,
        organizations!organization_members_organization_id_fkey(id, name)
      `,
      )
      .eq("user_id", userId)
      .order("joined_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return { claimed: false };

    const joinedAt = new Date(data.joined_at);
    const now = new Date();
    const minsAgo = (now.getTime() - joinedAt.getTime()) / 1000 / 60;

    // If joined within the last 10 minutes, treat it as a just-claimed invite
    // (actual signup normally shows joined_at ≈ now, so 10 min threshold is safe)
    if (minsAgo <= 10) {
      const invitedViaTeam = await supabase
        .from("organization_team_invites")
        .select("id")
        .eq("organization_id", data.organization_id)
        .eq("accepted_user_id", userId)
        .maybeSingle();

      if (invitedViaTeam.data) {
        const org = Array.isArray(data.organizations) ? data.organizations[0] : data.organizations;
        return {
          claimed: true,
          teamName: org?.name || "your team",
        };
      }
    }

    return { claimed: false };
  } catch (error) {
    console.error("Failed to check invite claim status:", error);
    return { claimed: false };
  }
}
