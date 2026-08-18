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

function unwrapRpcRows(data: unknown): unknown[] {
  if (data == null) return [];
  if (Array.isArray(data)) return data;
  if (typeof data !== "object") return [];
  const record = data as Record<string, unknown>;
  if (Array.isArray(record.data)) return record.data;
  const values = Object.values(record);
  if (
    values.length > 0 &&
    values.every(
      (value) =>
        value != null &&
        typeof value === "object" &&
        "id" in (value as object),
    )
  ) {
    return values;
  }
  if ("id" in record) return [record];
  return [];
}

function rowId(entry: unknown): string {
  if (entry == null || typeof entry !== "object") return "";
  const raw = (entry as { id?: unknown }).id;
  if (raw == null) return "";
  return String(raw).trim();
}

function asMutualRows(data: unknown): MutualConnectionRpcRow[] {
  const byId = new Map<string, MutualConnectionRpcRow>();
  for (const entry of unwrapRpcRows(data)) {
    const id = rowId(entry);
    if (!id || byId.has(id)) continue;
    const row = entry as Partial<MutualConnectionRpcRow>;
    byId.set(id, {
      id,
      name: typeof row.name === "string" ? row.name : "",
      avatar_seed: row.avatar_seed ?? null,
      avatar_url: row.avatar_url ?? null,
    });
  }
  return [...byId.values()];
}

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

  return {
    error: null,
    mutuals: asMutualRows(data).map((row) => ({
      id: row.id,
      name: row.name,
      avatar_seed: row.avatar_seed ?? null,
      avatar_url: (row.avatar_url ?? "").trim() || null,
    })),
  };
}
