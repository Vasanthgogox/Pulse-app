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

/** PostgREST: RPC not in schema / not deployed (avoid noisy 404 in console). */
function isMissingRpcError(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  const m = String(err.message ?? "").toLowerCase();
  const status = (err as { status?: number; statusCode?: number }).status ??
    (err as { status?: number; statusCode?: number }).statusCode;
  return (
    status === 404 ||
    err.code === "PGRST202" ||
    err.code === "42883" ||
    m.includes("could not find the function") ||
    m.includes("schema cache") ||
    m.includes("does not exist")
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
    const { data: rpcOrgs, error: rpcError } = await supabase().rpc(
      "get_organizations_for_user",
    );

    if (rpcError) {
      if (isMissingRpcError(rpcError)) {
        if (__DEV__) {
          console.warn(
            "[getOrganizationsForUser] get_organizations_for_user RPC missing; apply supabase/migrations/20260517120000_get_organizations_for_user_rpc.sql or use org memberships only.",
            rpcError.message,
          );
        }
        return { error: null, organizations: [] };
      }
      return { error: new Error(rpcError.message), organizations: [] };
    }

    const rpcList = Array.isArray(rpcOrgs) ? rpcOrgs : rpcOrgs ? [rpcOrgs] : [];
    if (rpcList.length) {
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

export type OrganizationLocation = {
  id: string;
  name?: string | null;
  city: string | null;
  state: string | null;
  address_line: string | null;
};

export async function getOrganizationLocationsByIds(orgIds: string[]): Promise<{
  error: Error | null;
  locations: OrganizationLocation[];
}> {
  const uniqueIds = [...new Set(orgIds.map((id) => id.trim()).filter(Boolean))];
  if (uniqueIds.length === 0) return { error: null, locations: [] };

  const { data, error } = await supabase()
    .from("organizations")
    .select("id, city, state, address_line")
    .in("id", uniqueIds);

  if (error) return { error: new Error(error.message), locations: [] };
  return { error: null, locations: (data ?? []) as OrganizationLocation[] };
}

export async function getOrganizationLocationsByNames(orgNames: string[]): Promise<{
  error: Error | null;
  locations: OrganizationLocation[];
}> {
  const uniqueNames = [...new Set(orgNames.map((name) => name.trim()).filter(Boolean))];
  if (uniqueNames.length === 0) return { error: null, locations: [] };

  const queries = uniqueNames.map((name) =>
    supabase()
      .from("organizations")
      .select("id, name, city, state, address_line")
      .ilike("name", name)
      .limit(1),
  );

  const responses = await Promise.all(queries);
  const errors = responses.filter((response) => response.error);
  if (errors.length > 0) {
    return { error: new Error(errors[0].error?.message ?? "Failed to fetch organization locations"), locations: [] };
  }

  const locations = responses
    .flatMap((response) => response.data ?? [])
    .filter(Boolean) as OrganizationLocation[];
  return { error: null, locations };
}
