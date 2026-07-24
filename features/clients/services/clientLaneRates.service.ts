import type { ClientLaneRate, LaneRateType } from '@/features/clients/types/clientManagement.types';
import { supabase } from '@/lib/supabase';

export type CreateLaneRateData = {
  agreement_id?: string | null;
  origin_warehouse_id?: string | null;
  destination_warehouse_id?: string | null;
  origin_label: string;
  destination_label: string;
  destination_gstin?: string | null;
  destination_address?: string | null;
  warehouse_zone?: string | null;
  distance_km?: number | null;
  pricing_model?: string | null;
  base_rate?: number | null;
  per_mt_rate?: number | null;
  per_km_rate?: number | null;
  vehicle_type?: string | null;
  rate?: number | null;
  rate_type?: LaneRateType;
  default_load_type?: string | null;
  default_load_tons?: number | null;
  min_billing?: number | null;
  fuel_clause?: string | null;
  toll_included?: boolean;
  detention_included?: boolean;
  valid_from?: string | null;
  valid_to?: string | null;
  is_spot_rate?: boolean;
  notes?: string | null;
};

/** Escape PostgREST `or(...)` reserved chars in a user search term. */
function sanitizeLaneSearch(term: string): string {
  // Commas/parens break the or() grammar; % and _ are ilike wildcards.
  return term.replace(/[(),%_]/g, ' ').trim();
}

export type GetLaneRatesOptions = {
  /** Server-side substring match on origin / destination / vehicle. */
  search?: string | null;
  /** Cap rows returned; keeps payload small for high-volume clients. */
  limit?: number;
};

/** Default page size for the lane picker (search-first, not browse-all). */
export const LANE_RATES_PAGE_SIZE = 50;

export async function getClientLaneRates(
  orgId: string,
  clientId: string,
  options: GetLaneRatesOptions = {},
): Promise<{ error: Error | null; laneRates: ClientLaneRate[] }> {
  const limit = options.limit ?? LANE_RATES_PAGE_SIZE;
  let query = supabase()
    .from('client_lane_rates')
    .select('*')
    .eq('organization_id', orgId)
    .eq('client_id', clientId)
    .is('deleted_at', null);

  const search = sanitizeLaneSearch(options.search ?? '');
  if (search) {
    const like = `%${search}%`;
    query = query.or(
      `origin_label.ilike.${like},destination_label.ilike.${like},destination_address.ilike.${like},vehicle_type.ilike.${like}`,
    );
  }

  const { data, error } = await query
    .order('valid_from', { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) return { error: new Error(error.message), laneRates: [] };
  return { error: null, laneRates: (data ?? []) as ClientLaneRate[] };
}

export async function createClientLaneRate(
  orgId: string,
  clientId: string,
  payload: CreateLaneRateData,
): Promise<{ error: Error | null; laneRate: ClientLaneRate | null }> {
  const { data, error } = await supabase()
    .from('client_lane_rates')
    .insert({ organization_id: orgId, client_id: clientId, ...payload })
    .select()
    .single();
  if (error) return { error: new Error(error.message), laneRate: null };
  return { error: null, laneRate: data as ClientLaneRate };
}

export async function updateClientLaneRate(
  laneRateId: string,
  payload: Partial<CreateLaneRateData>,
): Promise<{ error: Error | null }> {
  const { error } = await supabase()
    .from('client_lane_rates')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', laneRateId);
  if (error) return { error: new Error(error.message) };
  return { error: null };
}

export async function deleteClientLaneRate(
  laneRateId: string,
): Promise<{ error: Error | null }> {
  const { error } = await supabase()
    .from('client_lane_rates')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', laneRateId);
  if (error) return { error: new Error(error.message) };
  return { error: null };
}
