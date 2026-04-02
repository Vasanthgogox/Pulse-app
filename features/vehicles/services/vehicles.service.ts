/**
 * Vehicles service — Supabase only (mobile). Same DB as Q-unified-base.
 */
import { supabase } from '@/lib/supabase';
import { DEFAULT_PAGE_SIZE, type PageOpts } from '@/lib/pagination';
import type { VehicleDocuments } from '../utils/vehicleDocuments.util';

export interface VehicleRow {
  id: string;
  organization_id: string;
  vehicle_number: string;
  vehicle_type: string | null;
  capacity: string | null;
  vehicle_brand: string | null;
  vehicle_model: string | null;
  vehicle_body_type: string | null;
  vehicle_size: string | null;
  vehicle_axle: string | null;
  status: string;
  type: string;
  documents: VehicleDocuments | null;
  created_at: string;
  updated_at: string;
}

/**
 * Vehicle source: organization (your fleet) or partner (supplier/partner org).
 * Backend/Supabase: public.vehicles already has type ('owned'|'adhoc') and optional supplier_id.
 * We map vehicleSource → type: organization→'owned', partner→'adhoc'. supplier_id can be set
 * when UI adds a supplier picker for partner vehicles.
 */
export type VehicleSource = 'organization' | 'partner';

export interface VehicleInsert {
  vehicleSource?: VehicleSource;
  vehicle_number: string;
  vehicle_type?: string;
  capacity?: string;
  vehicle_brand?: string | null;
  vehicle_model?: string | null;
  vehicle_body_type?: string | null;
  vehicle_size?: string | null;
  vehicle_axle?: string | null;
  documents?: VehicleDocuments;
}

export async function getVehiclesByOrganization(
  orgId: string,
  opts?: PageOpts
): Promise<{ error: Error | null; vehicles: VehicleRow[]; hasMore?: boolean }> {
  const base = () =>
    supabase()
      .from('vehicles')
      .select('*')
      .eq('organization_id', orgId)
      .eq('type', 'owned')
      .order('created_at', { ascending: false });
  if (opts != null) {
    const limit = opts.limit ?? DEFAULT_PAGE_SIZE;
    const offset = opts.offset ?? 0;
    const { data, error } = await base().range(offset, offset + limit);
    if (error) return { error: new Error(error.message), vehicles: [] };
    const raw = (data ?? []) as VehicleRow[];
    const hasMore = raw.length > limit;
    return { error: null, vehicles: hasMore ? raw.slice(0, limit) : raw, hasMore };
  }
  const { data, error } = await base();
  if (error) return { error: new Error(error.message), vehicles: [] };
  return { error: null, vehicles: (data ?? []) as VehicleRow[] };
}

export async function getVehicleById(
  orgId: string,
  vehicleId: string
): Promise<{ error: Error | null; vehicle: VehicleRow | null }> {
  const { data, error } = await supabase()
    .from('vehicles')
    .select('*')
    .eq('organization_id', orgId)
    .eq('id', vehicleId)
    .maybeSingle();
  if (error) return { error: new Error(error.message), vehicle: null };
  return { error: null, vehicle: data as VehicleRow | null };
}

export async function createVehicle(
  orgId: string,
  payload: VehicleInsert
): Promise<{ error: Error | null; vehicle: VehicleRow | null }> {
  // DB: vehicles.type = 'owned' | 'adhoc'; vehicles.supplier_id optional for partner
  const type = payload.vehicleSource === 'partner' ? 'adhoc' : 'owned';
  const { data, error } = await supabase()
    .from('vehicles')
    .insert({
      organization_id: orgId,
      vehicle_number: (payload.vehicle_number ?? '').trim(),
      vehicle_type: (payload.vehicle_type ?? '').trim() || null,
      capacity: (payload.capacity ?? '').trim() || null,
      vehicle_brand: (payload.vehicle_brand ?? '').trim() || null,
      vehicle_model: (payload.vehicle_model ?? '').trim() || null,
      vehicle_body_type: (payload.vehicle_body_type ?? '').trim() || null,
      vehicle_size: (payload.vehicle_size ?? '').trim() || null,
      vehicle_axle: (payload.vehicle_axle ?? '').trim() || null,
      documents: payload.documents ?? {},
      status: 'active',
      type,
      // supplier_id: set when partner and we have a supplier picker (optional)
    } as Record<string, unknown>)
    .select()
    .single();
  if (error) {
    const message =
      error.message?.includes('idx_vehicles_org_number') ||
      error.message?.includes('duplicate key')
        ? 'A vehicle with this registration number is already added for your organization. Use a different number.'
        : error.message;
    return { error: new Error(message), vehicle: null };
  }
  return { error: null, vehicle: data as VehicleRow };
}

export interface UpdateVehicleData {
  vehicle_number?: string;
  vehicle_brand?: string | null;
  vehicle_body_type?: string | null;
  vehicle_size?: string | null;
  vehicle_axle?: string | null;
  documents?: VehicleDocuments;
}

export async function updateVehicle(
  orgId: string,
  vehicleId: string,
  patch: UpdateVehicleData
): Promise<{ error: Error | null; vehicle: VehicleRow | null }> {
  const updates: Record<string, unknown> = {};
  if (patch.vehicle_number !== undefined) updates.vehicle_number = (patch.vehicle_number ?? '').trim();
  if (patch.vehicle_brand !== undefined) updates.vehicle_brand = (patch.vehicle_brand ?? '').trim() || null;
  if (patch.vehicle_body_type !== undefined) updates.vehicle_body_type = (patch.vehicle_body_type ?? '').trim() || null;
  if (patch.vehicle_size !== undefined) updates.vehicle_size = (patch.vehicle_size ?? '').trim() || null;
  if (patch.vehicle_axle !== undefined) updates.vehicle_axle = (patch.vehicle_axle ?? '').trim() || null;
  if (patch.vehicle_body_type !== undefined) updates.vehicle_type = (patch.vehicle_body_type ?? '').trim() || null;
  if (patch.documents !== undefined) updates.documents = patch.documents;
  if (Object.keys(updates).length === 0) return { error: null, vehicle: null };
  const { data, error } = await supabase()
    .from('vehicles')
    .update(updates)
    .eq('organization_id', orgId)
    .eq('id', vehicleId)
    .select()
    .single();
  if (error) return { error: new Error(error.message), vehicle: null };
  return { error: null, vehicle: data as VehicleRow };
}
