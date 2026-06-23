/**
 * trip_subcontracts row — DB uses viewer_org_id / trip_id; app aliases below.
 */

/** Full row from public.trip_subcontracts. */
export type TripSubcontractRow = {
  id: string;
  /** Alias for viewer_org_id — sourcing carrier org (Thameem). */
  sourcing_org_id: string;
  /** Alias for trip_id — shipper-owned parent trip. */
  parent_trip_id: string;
  sub_supplier_org_id: string | null;
  sub_driver_id: string | null;
  sub_trip_code: string | null;
  sub_supplier_on_platform: boolean;
  sub_supplier_name: string | null;
  sub_supplier_phone: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  /** Contract columns */
  supplier_id: string | null;
  rate: number;
  created_by: string | null;
};

/** Raw DB shape (PostgREST). */
export type TripSubcontractDbRow = {
  id: string;
  viewer_org_id: string;
  trip_id: string;
  supplier_id: string | null;
  rate: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  sub_supplier_on_platform: boolean;
  sub_supplier_name: string | null;
  sub_supplier_phone: string | null;
  sub_trip_code: string | null;
  sub_supplier_org_id: string | null;
  sub_driver_id: string | null;
  status: string;
};

export function mapSubcontractDbRow(row: TripSubcontractDbRow): TripSubcontractRow {
  return {
    id: row.id,
    sourcing_org_id: row.viewer_org_id,
    parent_trip_id: row.trip_id,
    sub_supplier_org_id: row.sub_supplier_org_id,
    sub_driver_id: row.sub_driver_id,
    sub_trip_code: row.sub_trip_code,
    sub_supplier_on_platform: row.sub_supplier_on_platform,
    sub_supplier_name: row.sub_supplier_name,
    sub_supplier_phone: row.sub_supplier_phone,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
    supplier_id: row.supplier_id,
    rate: row.rate,
    created_by: row.created_by,
  };
}

/** What Thameem submits when creating a subcontract. */
export type CreateSubcontractPayload = {
  parent_trip_id: string;
  sourcing_org_id: string;
  sub_supplier_on_platform: boolean;
  sub_supplier_org_id?: string;
  sub_supplier_name?: string;
  sub_supplier_phone?: string;
  sub_driver_id?: string;
  supplier_id?: string;
  rate?: number;
};

export function validateCreateSubcontractPayload(
  payload: CreateSubcontractPayload,
): string | null {
  if (!payload.parent_trip_id?.trim()) return 'parent_trip_id is required';
  if (!payload.sourcing_org_id?.trim()) return 'sourcing_org_id is required';
  if (payload.sub_supplier_on_platform) {
    if (!payload.sub_supplier_org_id?.trim()) {
      return 'sub_supplier_org_id is required when sub_supplier_on_platform is true';
    }
  } else if (!payload.sub_supplier_name?.trim()) {
    return 'sub_supplier_name is required when sub_supplier_on_platform is false';
  }
  return null;
}
