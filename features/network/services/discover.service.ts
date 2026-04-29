/**
 * Discover service — search organizations outside your current network.
 */
import { supabase } from '@/lib/supabase';

export interface DiscoverOrg {
  id: string;
  name: string;
  avatar_seed: string | null;
  /** From organizations — RPC discover_organizations returns these for card location. */
  address_line?: string | null;
  city?: string | null;
  state?: string | null;
  mutual_count?: number | null;
  mutual_connections_count?: number | null;
  rating?: number | null;
  average_rating?: number | null;
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
  return { error: null, orgs: (data ?? []) as DiscoverOrg[] };
}
