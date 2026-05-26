/**
 * Mutual connections between viewer org and a target discover/connection org.
 */
import { supabase } from "@/lib/supabase";

export type MutualConnectionRow = {
  id: string;
  name: string;
  avatar_seed: string | null;
  /** Real avatar (org logo → owner profile avatar fallback). When `null`,
   *  the caller renders the seed-derived placeholder. Mirrors the
   *  `get_clients_with_profiles` / `get_suppliers_with_profiles`
   *  resolution priority introduced in `20260827040000_partner_avatar_prefer_org_logo`. */
  avatar_url: string | null;
};

function pickOrgAvatarUrl(
  logoUrl: string | null | undefined,
  ownerAvatarUrl: string | null | undefined,
): string | null {
  const logo = (logoUrl ?? "").trim();
  if (logo.length > 0) return logo;
  const owner = (ownerAvatarUrl ?? "").trim();
  if (owner.length > 0) return owner;
  return null;
}

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
    .select("id, name, avatar_seed, logo_url, owner_id")
    .in("id", [...mutualIds])
    .is("deleted_at", null)
    .order("name", { ascending: true });

  if (orgError) {
    return { error: new Error(orgError.message), mutuals: [] };
  }

  /** Owner-avatar fallback lookup. The mutual org's brand logo
   *  (`organizations.logo_url`) is preferred, but most early-stage orgs
   *  haven't set one — so we batch-load the owner profile's
   *  `avatar_url` and COALESCE in TypeScript. This mirrors the SQL
   *  resolution priority used by `get_clients_with_profiles` /
   *  `get_suppliers_with_profiles`. */
  const ownerIds = Array.from(
    new Set(
      (orgs ?? [])
        .map((o) => (o as { owner_id: string | null }).owner_id ?? null)
        .filter((id): id is string => Boolean(id)),
    ),
  );

  let ownerAvatarById = new Map<string, string | null>();
  if (ownerIds.length > 0) {
    const { data: profiles, error: profileError } = await supabase()
      .from("profiles")
      .select("id, avatar_url")
      .in("id", ownerIds);
    if (profileError) {
      return { error: new Error(profileError.message), mutuals: [] };
    }
    ownerAvatarById = new Map(
      (profiles ?? []).map((p) => [
        (p as { id: string }).id,
        ((p as { avatar_url: string | null }).avatar_url ?? null) || null,
      ]),
    );
  }

  return {
    error: null,
    mutuals: (orgs ?? []).map((org) => {
      const row = org as {
        id: string;
        name: string;
        avatar_seed: string | null;
        logo_url: string | null;
        owner_id: string | null;
      };
      const ownerAvatarUrl = row.owner_id
        ? (ownerAvatarById.get(row.owner_id) ?? null)
        : null;
      return {
        id: row.id,
        name: row.name,
        avatar_seed: row.avatar_seed ?? null,
        avatar_url: pickOrgAvatarUrl(row.logo_url, ownerAvatarUrl),
      };
    }),
  };
}
