import { supabase } from '@/lib/supabase';

export type OrganizationLocationType =
  | 'primary_hub'
  | 'regional_office'
  | 'dispatch_center'
  | 'other';

export interface OrganizationWorkspaceLocation {
  id: string;
  organization_id: string;
  name: string;
  location_type: OrganizationLocationType;
  department: string | null;
  address_line: string | null;
  city: string | null;
  state: string | null;
  is_verified: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type CreateOrganizationLocationData = {
  name: string;
  location_type?: OrganizationLocationType;
  department?: string | null;
  address_line?: string | null;
  city?: string | null;
  state?: string | null;
  is_verified?: boolean;
  sort_order?: number;
};

export type UpdateOrganizationLocationData = Partial<
  Omit<CreateOrganizationLocationData, 'name'>
> & { name?: string };

export async function getOrganizationLocations(
  orgId: string,
): Promise<{ error: Error | null; locations: OrganizationWorkspaceLocation[] }> {
  const { data, error } = await supabase()
    .from('organization_locations')
    .select('*')
    .eq('organization_id', orgId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) return { error: new Error(error.message), locations: [] };
  return { error: null, locations: (data ?? []) as OrganizationWorkspaceLocation[] };
}

export async function createOrganizationLocation(
  orgId: string,
  payload: CreateOrganizationLocationData,
): Promise<{ error: Error | null; location: OrganizationWorkspaceLocation | null }> {
  const { data, error } = await supabase()
    .from('organization_locations')
    .insert({
      organization_id: orgId,
      name: payload.name.trim(),
      location_type: payload.location_type ?? 'other',
      department: payload.department?.trim() || 'Operations & dispatch',
      address_line: payload.address_line?.trim() || null,
      city: payload.city?.trim() || null,
      state: payload.state?.trim() || null,
      is_verified: payload.is_verified ?? false,
      sort_order: payload.sort_order ?? 0,
    })
    .select()
    .single();

  if (error) return { error: new Error(error.message), location: null };
  return { error: null, location: data as OrganizationWorkspaceLocation };
}

export async function updateOrganizationLocation(
  locationId: string,
  payload: UpdateOrganizationLocationData,
): Promise<{ error: Error | null; location: OrganizationWorkspaceLocation | null }> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (payload.name !== undefined) patch.name = payload.name.trim();
  if (payload.location_type !== undefined) patch.location_type = payload.location_type;
  if (payload.department !== undefined) {
    patch.department = payload.department?.trim() || 'Operations & dispatch';
  }
  if (payload.address_line !== undefined) {
    patch.address_line = payload.address_line?.trim() || null;
  }
  if (payload.city !== undefined) patch.city = payload.city?.trim() || null;
  if (payload.state !== undefined) patch.state = payload.state?.trim() || null;
  if (payload.is_verified !== undefined) patch.is_verified = payload.is_verified;
  if (payload.sort_order !== undefined) patch.sort_order = payload.sort_order;

  const { data, error } = await supabase()
    .from('organization_locations')
    .update(patch)
    .eq('id', locationId)
    .select()
    .single();

  if (error) return { error: new Error(error.message), location: null };
  return { error: null, location: data as OrganizationWorkspaceLocation };
}

export async function deleteOrganizationLocation(
  locationId: string,
): Promise<{ error: Error | null }> {
  const { error } = await supabase()
    .from('organization_locations')
    .delete()
    .eq('id', locationId);
  if (error) return { error: new Error(error.message) };
  return { error: null };
}
