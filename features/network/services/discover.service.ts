/**
 * Discover service — search organizations outside your current network.
 */
import { supabase } from '@/lib/supabase';

type PartnerDisplayBatch = Record<
  string,
  {
    avatarUrl?: string | null;
    avatarSeed?: string | null;
  }
>;

/** Fallback when discover_organizations RPC predates avatar_url column. */
async function enrichDiscoverOrgsWithPartnerDisplay(
  orgs: DiscoverOrg[],
): Promise<DiscoverOrg[]> {
  const needsEnrich = orgs.some(
    (o) => !(o.avatar_url ?? "").trim() && !(o.avatar_seed ?? "").trim(),
  );
  if (!needsEnrich || orgs.length === 0) return orgs;

  const { data, error } = await supabase().rpc(
    "get_connection_partner_display_batch",
    { p_linked_organization_ids: orgs.map((o) => o.id) },
  );
  if (error || !data || typeof data !== "object") return orgs;

  const map = data as PartnerDisplayBatch;
  return orgs.map((org) => {
    const row = map[org.id];
    if (!row) return org;
    return {
      ...org,
      avatar_url: org.avatar_url ?? row.avatarUrl ?? null,
      avatar_seed: org.avatar_seed ?? row.avatarSeed ?? null,
    };
  });
}

export interface DiscoverOrg {
  id: string;
  name: string;
  avatar_seed: string | null;
  /** Org logo or owner profile photo — same resolution as chat / connection cards. */
  avatar_url?: string | null;
  /** Optional profile role from RPC, used to hide drivers in Discover. */
  profile_role?: string | null;
  /** From organizations — RPC discover_organizations returns these for card location. */
  address_line?: string | null;
  city?: string | null;
  state?: string | null;
  location?: string | null;
  business_location?: string | null;
  headquarters?: string | null;
  mutual_count?: number | null;
  mutual_connections_count?: number | null;
  rating?: number | null;
  average_rating?: number | null;
  trip_count?: number | null;
  lane_overlap_count?: number | null;
  recommendation_score?: number | null;
  is_in_user_trip_city?: boolean | null;
  connection_status: 'none' | 'pending' | 'approved' | 'rejected' | string;
}

export async function discoverOrganizations(
  orgId: string,
  search = '',
  limit = 20,
  offset = 0,
): Promise<{ error: Error | null; orgs: DiscoverOrg[] }> {
  const { data, error } = await supabase().rpc('discover_organizations', {
    p_org_id: orgId,
    p_search: search,
    p_limit: limit,
    p_offset: offset,
  });

  if (error) return { error: new Error(error.message), orgs: [] };
  const orgs = await enrichDiscoverOrgsWithPartnerDisplay(
    (data ?? []) as DiscoverOrg[],
  );
  return { error: null, orgs };
}
