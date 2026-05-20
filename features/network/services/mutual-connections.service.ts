/**
 * Mutual connections between viewer org and a target discover/connection org.
 */
import { supabase } from "@/lib/supabase";

export type MutualConnectionRow = {
  id: string;
  name: string;
  avatar_seed: string | null;
};

function peerOrgIdsFromRows(
  viewerOrgId: string,
  rows: { from_organization_id: string; to_organization_id: string }[],
): string[] {
  const peers = new Set<string>();
  for (const row of rows) {
    if (row.from_organization_id === viewerOrgId) {
      peers.add(row.to_organization_id);
    } else if (row.to_organization_id === viewerOrgId) {
      peers.add(row.from_organization_id);
    }
  }
  return [...peers];
}

export async function getMutualConnections(
  viewerOrgId: string,
  targetOrgId: string,
): Promise<{ error: Error | null; mutuals: MutualConnectionRow[] }> {
  if (!viewerOrgId || !targetOrgId || viewerOrgId === targetOrgId) {
    return { error: null, mutuals: [] };
  }

  const { data: viewerRows, error: viewerError } = await supabase()
    .from("connection_requests")
    .select("from_organization_id, to_organization_id")
    .eq("status", "approved")
    .or(
      `from_organization_id.eq.${viewerOrgId},to_organization_id.eq.${viewerOrgId}`,
    );

  if (viewerError) {
    return { error: new Error(viewerError.message), mutuals: [] };
  }

  const peerIds = peerOrgIdsFromRows(viewerOrgId, viewerRows ?? []);
  if (peerIds.length === 0) {
    return { error: null, mutuals: [] };
  }

  const { data: targetRows, error: targetError } = await supabase()
    .from("connection_requests")
    .select("from_organization_id, to_organization_id")
    .eq("status", "approved")
    .or(
      `from_organization_id.eq.${targetOrgId},to_organization_id.eq.${targetOrgId}`,
    );

  if (targetError) {
    return { error: new Error(targetError.message), mutuals: [] };
  }

  const peerSet = new Set(peerIds);
  const mutualIds = new Set<string>();
  for (const row of targetRows ?? []) {
    const other =
      row.from_organization_id === targetOrgId
        ? row.to_organization_id
        : row.from_organization_id;
    if (peerSet.has(other)) {
      mutualIds.add(other);
    }
  }

  if (mutualIds.size === 0) {
    return { error: null, mutuals: [] };
  }

  const { data: orgs, error: orgError } = await supabase()
    .from("organizations")
    .select("id, name, avatar_seed")
    .in("id", [...mutualIds])
    .is("deleted_at", null)
    .order("name", { ascending: true });

  if (orgError) {
    return { error: new Error(orgError.message), mutuals: [] };
  }

  return {
    error: null,
    mutuals: (orgs ?? []).map((org) => ({
      id: org.id,
      name: org.name,
      avatar_seed: org.avatar_seed ?? null,
    })),
  };
}
