/**
 * Trip subcontracts — carrier-org downstream records on shared load trips.
 * Reads/writes public.trip_subcontracts; RLS scopes to sourcing (viewer) org.
 */
import { supabase } from '@/lib/supabase';
import {
  mapSubcontractDbRow,
  validateCreateSubcontractPayload,
  type CreateSubcontractPayload,
  type TripSubcontractDbRow,
  type TripSubcontractRow,
} from '@/types/subcontracts';

export type {
  CreateSubcontractPayload,
  TripSubcontractRow,
} from '@/types/subcontracts';

export async function createSubcontract(
  payload: CreateSubcontractPayload,
): Promise<{ error: Error | null; row: TripSubcontractRow | null }> {
  const validationError = validateCreateSubcontractPayload(payload);
  if (validationError) return { error: new Error(validationError), row: null };

  const { data: userData } = await supabase().auth.getUser();
  const createdBy = userData.user?.id ?? null;

  const insertRow = {
    viewer_org_id: payload.sourcing_org_id,
    trip_id: payload.parent_trip_id,
    sub_supplier_on_platform: payload.sub_supplier_on_platform,
    sub_supplier_org_id: payload.sub_supplier_on_platform
      ? payload.sub_supplier_org_id ?? null
      : null,
    sub_supplier_name: payload.sub_supplier_on_platform
      ? null
      : payload.sub_supplier_name ?? null,
    sub_supplier_phone: payload.sub_supplier_on_platform
      ? null
      : payload.sub_supplier_phone ?? null,
    supplier_id: payload.supplier_id ?? null,
    sub_driver_id: payload.sub_driver_id ?? null,
    rate: payload.rate ?? 0,
    status: 'pending',
    created_by: createdBy,
  };

  const { data, error } = await supabase()
    .from('trip_subcontracts')
    .insert(insertRow)
    .select('*')
    .single();

  if (error) return { error: new Error(error.message), row: null };
  return {
    error: null,
    row: mapSubcontractDbRow(data as TripSubcontractDbRow),
  };
}

export async function getSubcontractsByTrip(
  tripId: string,
): Promise<{ error: Error | null; rows: TripSubcontractRow[] }> {
  const id = tripId.trim();
  if (!id) return { error: null, rows: [] };

  const { data, error } = await supabase()
    .from('trip_subcontracts')
    .select('*')
    .eq('trip_id', id)
    .order('created_at', { ascending: false });

  if (error) return { error: new Error(error.message), rows: [] };
  return {
    error: null,
    rows: ((data ?? []) as TripSubcontractDbRow[]).map(mapSubcontractDbRow),
  };
}

export async function getSubcontractsBySourcingOrg(
  orgId: string,
): Promise<{ error: Error | null; rows: TripSubcontractRow[] }> {
  const id = orgId.trim();
  if (!id) return { error: null, rows: [] };

  const { data, error } = await supabase()
    .from('trip_subcontracts')
    .select('*')
    .eq('viewer_org_id', id)
    .order('created_at', { ascending: false });

  if (error) return { error: new Error(error.message), rows: [] };
  return {
    error: null,
    rows: ((data ?? []) as TripSubcontractDbRow[]).map(mapSubcontractDbRow),
  };
}

export async function updateSubcontractStatus(
  id: string,
  status: string,
): Promise<{ error: Error | null; row: TripSubcontractRow | null }> {
  const subcontractId = id.trim();
  const nextStatus = status.trim();
  if (!subcontractId) return { error: new Error('id is required'), row: null };
  if (!nextStatus) return { error: new Error('status is required'), row: null };

  const { data, error } = await supabase()
    .from('trip_subcontracts')
    .update({ status: nextStatus })
    .eq('id', subcontractId)
    .select('*')
    .single();

  if (error) return { error: new Error(error.message), row: null };
  return {
    error: null,
    row: mapSubcontractDbRow(data as TripSubcontractDbRow),
  };
}
