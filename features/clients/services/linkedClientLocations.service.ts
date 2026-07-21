/**
 * Linked-org office/warehouse locations for an integrated billing client.
 */
import { supabase } from "@/lib/supabase";
import type { OrganizationWorkspaceLocation } from "@/features/organization/services/organizationLocations.service";

export async function getLinkedClientOrgLocations(
  orgId: string,
  clientId: string,
): Promise<{ error: Error | null; locations: OrganizationWorkspaceLocation[] }> {
  const { data, error } = await supabase().rpc("get_linked_client_org_locations", {
    p_org_id: orgId,
    p_client_id: clientId,
  });
  if (error) {
    // Soft-fail until migration is applied / when client is not integrated.
    if (__DEV__) {
      console.warn("[getLinkedClientOrgLocations]", error.message);
    }
    return { error: null, locations: [] };
  }
  return {
    error: null,
    locations: (data ?? []) as OrganizationWorkspaceLocation[],
  };
}
