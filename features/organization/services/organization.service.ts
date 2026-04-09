/**
 * Organization service — Supabase only (mobile).
 * Same DB as Q-unified-base; RLS restricts to own memberships.
 * Uses membership-based query first (RLS on organization_members + organizations).
 * If that returns nothing and the DB has get_organizations_for_user() RPC, tries RPC to backfill owner memberships.
 */
import { supabase } from "@/lib/supabase";
import type { CurrentOrganization } from "@/types/organization";

const defaultCapabilities = {
  canPostIndent: true,
  canBid: true,
  canManageAssets: true,
  canUseMarketplace: true,
};

function mapToCurrentOrganization(o: {
  id: string;
  name: string | null;
  operating_model?: string;
}): CurrentOrganization {
  return {
    id: o.id,
    name: o.name ?? "",
    operatingModel: (o.operating_model === "ASSET_BASED" ||
    o.operating_model === "NON_ASSET" ||
    o.operating_model === "HYBRID"
      ? o.operating_model
      : "HYBRID") as CurrentOrganization["operatingModel"],
    sourcingStrategy: "MARKETPLACE_FIRST",
    marketplaceEnabled: true,
    capabilities: defaultCapabilities,
  };
}

function isNetworkError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return (
    msg === "Network request failed" ||
    /network|fetch.*failed|timeout/i.test(msg)
  );
}

export async function getOrganizationsForUser(): Promise<{
  error: Error | null;
  organizations: CurrentOrganization[];
}> {
  let user: { id: string } | null = null;
  let sessionError: { message: string } | null = null;
  try {
    const result = await supabase().auth.getUser();
    user = result.data?.user ?? null;
    sessionError = result.error;
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    if (__DEV__ && !isNetworkError(err)) {
      console.log("[getOrganizationsForUser] No session:", err.message);
    }
    return { error: err, organizations: [] };
  }
  if (sessionError || !user) {
    const msg = sessionError?.message ?? "no user";
    if (__DEV__ && !isNetworkError(new Error(msg))) {
      console.log("[getOrganizationsForUser] No session:", msg);
    }
    return {
      error: sessionError
        ? new Error(sessionError.message)
        : new Error("Not signed in"),
      organizations: [],
    };
  }

  try {
    // 1) Membership-based path first (works with RLS: organization_members + organizations)
    const { data: memberships, error: memError } = await supabase()
      .from("organization_members")
      .select("organization_id, role, status")
      .eq("user_id", user.id)
      .eq("status", "active");

    if (!memError && memberships?.length) {
      const orgIds = [...new Set(memberships.map((m) => m.organization_id))];
      const { data: orgs, error: orgError } = await supabase()
        .from("organizations")
        .select("id, name, slug, owner_id, operating_model")
        .in("id", orgIds);

      if (!orgError && orgs?.length) {
        return {
          error: null,
          organizations: orgs.map(mapToCurrentOrganization),
        };
      }
      if (orgError) {
        return { error: new Error(orgError.message), organizations: [] };
      }
    }

    if (memError) {
      return { error: new Error(memError.message), organizations: [] };
    }

    // 2) No memberships from direct query: try RPC (creates missing owner memberships in some schemas)
    const { data: rpcOrgs, error: rpcError } = await supabase()
      .rpc("get_organizations_for_user")
      .select("id, name, slug, owner_id");

    const rpcList = Array.isArray(rpcOrgs) ? rpcOrgs : rpcOrgs ? [rpcOrgs] : [];
    if (!rpcError && rpcList.length) {
      const organizations: CurrentOrganization[] = rpcList.map(
        (o: { id: string; name?: string | null }) =>
          mapToCurrentOrganization({ id: o.id, name: o.name ?? null }),
      );
      return { error: null, organizations };
    }

    return { error: null, organizations: [] };
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    return { error: err, organizations: [] };
  }
}
