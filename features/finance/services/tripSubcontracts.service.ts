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

let tripSubcontractsRpcAvailable: boolean | null = null;
let upsertTripSubcontractRpcAvailable: boolean | null = null;

const TRIP_SUBCONTRACTS_RPC_UNAVAILABLE_KEY =
  "qweb:trip_subcontracts_rpc_unavailable";
const UPSERT_TRIP_SUBCONTRACT_RPC_UNAVAILABLE_KEY =
  "qweb:upsert_trip_subcontract_rpc_unavailable";

function readTripSubcontractsStickyUnavailable(key: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeTripSubcontractsStickyUnavailable(
  key: string,
  unavailable: boolean,
): void {
  if (typeof window === "undefined") return;
  try {
    if (unavailable) window.localStorage.setItem(key, "1");
    else window.localStorage.removeItem(key);
  } catch {
    // best effort only
  }
}

function subcontractsBackendUnavailable(message: string): boolean {
  return /could not find the function|schema cache|does not exist|relation .* does not exist|404|not found|no function matches|function .* has .* parameters but .* were supplied/i.test(
    message,
  );
}

export async function upsertTripSubcontract(params: {
  viewerOrgId: string;
  tripId: string;
  supplierId: string;
  rate: number;
}): Promise<{ error: Error | null; row: TripSubcontractRow | null }> {
  const { viewerOrgId, tripId, supplierId, rate } = params;
  if (upsertTripSubcontractRpcAvailable == null) {
    upsertTripSubcontractRpcAvailable = readTripSubcontractsStickyUnavailable(
      UPSERT_TRIP_SUBCONTRACT_RPC_UNAVAILABLE_KEY,
    )
      ? false
      : null;
  }
  if (upsertTripSubcontractRpcAvailable !== false) {
    const { data, error } = await supabase().rpc("upsert_trip_subcontract", {
      p_viewer_org_id: viewerOrgId,
      p_trip_id: tripId,
      p_supplier_id: supplierId,
      p_rate: rate,
    });
    if (!error) {
      upsertTripSubcontractRpcAvailable = true;
      writeTripSubcontractsStickyUnavailable(
        UPSERT_TRIP_SUBCONTRACT_RPC_UNAVAILABLE_KEY,
        false,
      );
      return { error: null, row: (data ?? null) as TripSubcontractRow | null };
    }
    const msg = error.message || "";
    // Backend RPC may not be deployed yet; fall back to local persistence so UI + finance still work.
    if (!subcontractsBackendUnavailable(msg)) {
      return { error: new Error(error.message), row: null };
    }
    upsertTripSubcontractRpcAvailable = false;
    writeTripSubcontractsStickyUnavailable(
      UPSERT_TRIP_SUBCONTRACT_RPC_UNAVAILABLE_KEY,
      true,
    );
  }
  const row = await upsertLocalTripSubcontract({
    viewerOrgId,
    tripId,
    supplierId,
    rate,
  });
  return { error: null, row: row as unknown as TripSubcontractRow };
}

export async function getTripSubcontracts(params: {
  viewerOrgId: string;
  tripIds: string[];
}): Promise<{ error: Error | null; rows: TripSubcontractRow[] }> {
  const { viewerOrgId, tripIds } = params;
  if (tripSubcontractsRpcAvailable == null) {
    tripSubcontractsRpcAvailable = readTripSubcontractsStickyUnavailable(
      TRIP_SUBCONTRACTS_RPC_UNAVAILABLE_KEY,
    )
      ? false
      : null;
  }
  if (tripSubcontractsRpcAvailable !== false) {
    const { data, error } = await supabase().rpc("get_trip_subcontracts", {
      p_viewer_org_id: viewerOrgId,
      p_trip_ids: tripIds,
    });
    if (!error) {
      tripSubcontractsRpcAvailable = true;
      writeTripSubcontractsStickyUnavailable(
        TRIP_SUBCONTRACTS_RPC_UNAVAILABLE_KEY,
        false,
      );
      return { error: null, rows: (data ?? []) as TripSubcontractRow[] };
    }
    const msg = error.message || "";
    if (!subcontractsBackendUnavailable(msg)) {
      return { error: new Error(error.message), rows: [] };
    }
    tripSubcontractsRpcAvailable = false;
    writeTripSubcontractsStickyUnavailable(
      TRIP_SUBCONTRACTS_RPC_UNAVAILABLE_KEY,
      true,
    );
  }
  const rows = await getLocalTripSubcontracts({ viewerOrgId, tripIds });
  return { error: null, rows: rows as unknown as TripSubcontractRow[] };
}

