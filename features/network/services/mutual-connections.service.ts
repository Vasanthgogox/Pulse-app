/**
 * Mutual connections between viewer org and a target discover/connection org.
 *
 * Uses `get_mutual_connections` RPC (SECURITY DEFINER) so third-party
 * connection_requests for the target org are visible — direct table queries
 * are RLS-filtered to rows involving only the viewer org.
 */
import { supabase } from "@/lib/supabase";

export type MutualConnectionRow = {
  id: string;
  name: string;
  avatar_seed: string | null;
  /** Org logo → owner profile avatar; null → initials/seed in UI. */
  avatar_url: string | null;
};

type MutualConnectionRpcRow = {
  id: string;
  name: string;
  avatar_seed: string | null;
  avatar_url: string | null;
};

export async function getMutualConnections(
  viewerOrgId: string,
  targetOrgId: string,
): Promise<{ error: Error | null; mutuals: MutualConnectionRow[] }> {
  if (!viewerOrgId || !targetOrgId || viewerOrgId === targetOrgId) {
    return { error: null, mutuals: [] };
  }

  const { data, error } = await supabase().rpc("get_mutual_connections", {
    p_viewer_org_id: viewerOrgId,
    p_target_org_id: targetOrgId,
  });

  if (error) {
    return { error: new Error(error.message), mutuals: [] };
  }

  const rows = (data ?? []) as MutualConnectionRpcRow[];
  return {
    error: null,
    mutuals: rows.map((row) => ({
      id: row.id,
      name: row.name,
      avatar_seed: row.avatar_seed ?? null,
      avatar_url: (row.avatar_url ?? "").trim() || null,
    })),
  };
}
