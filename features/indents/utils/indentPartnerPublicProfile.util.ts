import { supabase } from "@/lib/supabase";

export type IndentPartnerPublicProfileTarget = {
  type: "client" | "supplier";
  id: string;
};

function isUuid(value: string | null | undefined): boolean {
  const s = (value ?? "").trim();
  if (!s) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    s,
  );
}

/**
 * Resolve a viewer-org client or supplier row linked to `partnerOrgId` for
 * `/public-profile/{type}/{id}` navigation (e.g. supplier viewing shipper on GET LOAD).
 */
export async function resolveIndentPartnerPublicProfile(
  viewerOrgId: string,
  partnerOrgId: string,
): Promise<IndentPartnerPublicProfileTarget | null> {
  if (!isUuid(viewerOrgId) || !isUuid(partnerOrgId)) return null;

  const { data: client, error: clientError } = await supabase()
    .from("clients")
    .select("id")
    .eq("organization_id", viewerOrgId)
    .eq("linked_organization_id", partnerOrgId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (!clientError && client?.id) {
    return { type: "client", id: String(client.id) };
  }

  const { data: supplier, error: supplierError } = await supabase()
    .from("suppliers")
    .select("id")
    .eq("organization_id", viewerOrgId)
    .eq("linked_organization_id", partnerOrgId)
    .limit(1)
    .maybeSingle();

  if (!supplierError && supplier?.id) {
    return { type: "supplier", id: String(supplier.id) };
  }

  return null;
}
