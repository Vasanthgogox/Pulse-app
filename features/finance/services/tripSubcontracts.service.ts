import { supabase } from "@/lib/supabase";
import {
  getLocalTripSubcontracts,
  upsertLocalTripSubcontract,
} from "@/lib/localTripSubcontracts";

export interface TripSubcontractRow {
  id: string;
  viewer_org_id: string;
  trip_id: string;
  supplier_id: string;
  rate: number;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
}

export async function upsertTripSubcontract(params: {
  viewerOrgId: string;
  tripId: string;
  supplierId: string;
  rate: number;
}): Promise<{ error: Error | null; row: TripSubcontractRow | null }> {
  const { viewerOrgId, tripId, supplierId, rate } = params;
  const { data, error } = await supabase().rpc("upsert_trip_subcontract", {
    p_viewer_org_id: viewerOrgId,
    p_trip_id: tripId,
    p_supplier_id: supplierId,
    p_rate: rate,
  });
  if (error) {
    const msg = error.message || "";
    // Backend RPC may not be deployed yet; fall back to local persistence so UI + finance still work.
    if (/could not find the function|schema cache/i.test(msg)) {
      const row = await upsertLocalTripSubcontract({
        viewerOrgId,
        tripId,
        supplierId,
        rate,
      });
      return { error: null, row: row as unknown as TripSubcontractRow };
    }
    return { error: new Error(error.message), row: null };
  }
  return { error: null, row: (data ?? null) as TripSubcontractRow | null };
}

export async function getTripSubcontracts(params: {
  viewerOrgId: string;
  tripIds: string[];
}): Promise<{ error: Error | null; rows: TripSubcontractRow[] }> {
  const { viewerOrgId, tripIds } = params;
  const { data, error } = await supabase().rpc("get_trip_subcontracts", {
    p_viewer_org_id: viewerOrgId,
    p_trip_ids: tripIds,
  });
  if (error) {
    const msg = error.message || "";
    if (/could not find the function|schema cache/i.test(msg)) {
      const rows = await getLocalTripSubcontracts({ viewerOrgId, tripIds });
      return { error: null, rows: rows as unknown as TripSubcontractRow[] };
    }
    return { error: new Error(error.message), rows: [] };
  }
  return { error: null, rows: (data ?? []) as TripSubcontractRow[] };
}

