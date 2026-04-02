/**
 * Indent → Trip conversion service.
 *
 * Covers two paths:
 *   1. Direct-quote path  — use acceptAwardedQuote (create_trip_from_direct_quote RPC).
 *   2. Manual-assignment path — awardIndentToTrip (award_indent_to_trip RPC).
 *      For indents where the shipper assigns a supplier directly (assigned_supplier_id)
 *      without going through the quote/bid process.
 *
 * Both are idempotent: if a trip already exists for the indent it is returned (and any
 * newly supplied driver/vehicle is applied). O(1) per call; O(n) for batch.
 *
 * Edge cases handled in the RPCs:
 *   - Cancelled indent               → RAISE EXCEPTION (surfaced as error)
 *   - Missing required fields        → RAISE EXCEPTION
 *   - Trip already exists            → return existing trip (+ apply driver/vehicle)
 *   - Completed/cancelled trip       → return as-is (no field overwrite)
 *   - No supplier_id resolved        → trip created with supplier_id = NULL (draft)
 *   - Concurrent double-call         → unique index on trips.indent_id catches race
 */
import type { TripRow } from '@/features/trips/services/trips.service';
import { supabase } from '@/lib/supabase';

export interface AwardIndentOptions {
  /**
   * Agreed supplier rate. If omitted the RPC uses indent.assigned_supplier_rate
   * then falls back to indent.supplier_target.
   */
  supplierRate?: number | null;
  /** Direct supplier row id in the indent owner's org. Takes priority over supplierOrgId. */
  supplierId?: string | null;
  /**
   * Bidder organisation id. Used when you only know the external org (no supplier row id).
   * The RPC will resolve the supplier row by looking up suppliers.linked_organization_id.
   */
  supplierOrgId?: string | null;
  driverId?: string | null;
  vehicleId?: string | null;
  vehicleDisplayNumber?: string | null;
}

export interface BatchAwardResult {
  /** Number of newly created trips. Already-existing trips are not counted. */
  created: number;
}

/**
 * Convert a single indent into a trip (manual-assignment path).
 * Idempotent — safe to call multiple times for the same indent.
 * Sets indent.status = 'completed' on success.
 */
export async function awardIndentToTrip(
  indentId: string,
  options?: AwardIndentOptions,
): Promise<{ error: Error | null; trip: TripRow | null }> {
  if (!indentId) {
    return { error: new Error('indentId is required'), trip: null };
  }

  const payload: {
    p_indent_id: string;
    p_supplier_rate?: number | null;
    p_supplier_id?: string | null;
    p_supplier_org_id?: string | null;
    p_driver_id?: string | null;
    p_vehicle_id?: string | null;
    p_vehicle_display_number?: string | null;
  } = { p_indent_id: indentId };

  if (options?.supplierRate != null) payload.p_supplier_rate = options.supplierRate;
  if (options?.supplierId != null) payload.p_supplier_id = options.supplierId;
  if (options?.supplierOrgId != null) payload.p_supplier_org_id = options.supplierOrgId;
  if (options?.driverId != null) payload.p_driver_id = options.driverId;
  if (options?.vehicleId != null) payload.p_vehicle_id = options.vehicleId;
  if (options?.vehicleDisplayNumber != null) {
    payload.p_vehicle_display_number = options.vehicleDisplayNumber.trim() || null;
  }

  const { data, error } = await supabase().rpc('award_indent_to_trip', payload);

  if (error) {
    return { error: new Error(error.message), trip: null };
  }

  const rows = (data ?? []) as TripRow[];
  return { error: null, trip: rows[0] ?? null };
}

/**
 * O(n) batch conversion: creates trips for every 'awarded' indent in the org
 * that doesn't already have a trip. Single round-trip to the DB (set-based INSERT).
 *
 * Returns the count of trips created.  Already-existing trips are untouched.
 */
export async function batchAwardIndentsToTrips(
  orgId: string,
): Promise<{ error: Error | null; result: BatchAwardResult }> {
  if (!orgId) {
    return { error: new Error('orgId is required'), result: { created: 0 } };
  }

  const { data, error } = await supabase().rpc('batch_award_indents_to_trips', {
    p_org_id: orgId,
  });

  if (error) {
    return { error: new Error(error.message), result: { created: 0 } };
  }

  return { error: null, result: { created: Number(data ?? 0) } };
}
