import { supabase } from '@/lib/supabase';

import type { OnboardingMembershipSummary } from './onboardingDomainContext';
import type { PlatformMembership } from './platformMembership';
import { platformMembershipFromLegacyRow } from './platformMembership';
import type { InvitationIdentity } from './identityTypes';
import { proposedRelationshipTypeFromTeamInvite } from './membershipTypes';

function toSummary(m: PlatformMembership): OnboardingMembershipSummary {
  return {
    organizationId: m.organizationId,
    organizationName: m.organizationName,
    relationshipType: m.relationshipType,
    lifecycleStatus: m.lifecycleStatus,
    role: m.role,
  };
}

/**
 * Resolve existing memberships for verified identities (V2).
 * Post-auth: loads organization_members for the signed-in person.
 */
export async function resolveMembershipsByIdentities(
  _verifiedIdentities: InvitationIdentity[],
): Promise<{ error: Error | null; memberships: OnboardingMembershipSummary[] }> {
  void _verifiedIdentities;

  try {
    const { data: { session } } = await supabase().auth.getSession();
    if (!session?.user) {
      return { error: null, memberships: [] };
    }

    const { data, error } = await supabase()
      .from('organization_members')
      .select('organization_id, role, status, organizations(name)')
      .eq('user_id', session.user.id)
      .in('status', ['active', 'accepted', 'invited', 'pending']);

    if (error) {
      return { error: new Error(error.message), memberships: [] };
    }

    const memberships = (data ?? []).map((row) => {
      const org = row.organizations as { name: string | null } | { name: string | null }[] | null;
      const orgName = Array.isArray(org) ? org[0]?.name : org?.name;
      return toSummary(
        platformMembershipFromLegacyRow({
          organizationId: row.organization_id,
          organizationName: orgName ?? undefined,
          relationshipType: proposedRelationshipTypeFromTeamInvite(),
          role: row.role ?? undefined,
          status: row.status,
        }),
      );
    });

    return { error: null, memberships };
  } catch (e) {
    return {
      error: e instanceof Error ? e : new Error(String(e)),
      memberships: [],
    };
  }
}

export async function loadActiveMembershipsForPerson(): Promise<{
  error: Error | null;
  memberships: PlatformMembership[];
}> {
  const { error, memberships } = await resolveMembershipsByIdentities([]);
  return {
    error,
    memberships: memberships.map((m) =>
      platformMembershipFromLegacyRow({
        organizationId: m.organizationId,
        organizationName: m.organizationName,
        relationshipType: m.relationshipType ?? proposedRelationshipTypeFromTeamInvite(),
        role: m.role,
        status: m.lifecycleStatus ?? 'ACTIVE',
      }),
    ),
  };
}
