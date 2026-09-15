import { getIdentityDb } from '@/lib/supabase';

export type CommerceIndentQuote = {
  id: string;
  amount: number | null;
  status: string;
  supplierName: string | null;
  createdAt: string | null;
};

export type CommerceAllocationOption = { id: string; label: string };

/**
 * Canonical Core RPC (features/indents/services/direct-quotes.service.ts
 * getDirectQuotesByIndentId): direct_quotes has no FK to suppliers — only
 * bidder_organization_id (organizations). A PostgREST suppliers(name) embed
 * fails with "Could not find a relationship between 'direct_quotes' and
 * 'suppliers' in the schema cache" because that relationship doesn't exist.
 */
export async function fetchCommerceIndentQuotes(indentId: string): Promise<CommerceIndentQuote[]> {
  const sb = getIdentityDb();
  if (!sb || !indentId) return [];
  const { data, error } = await sb.rpc('get_direct_quotes_with_bidder_names', {
    p_indent_id: indentId,
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as {
    id: string;
    amount: number | null;
    status: string;
    created_at: string | null;
    bidder_organization_name: string | null;
  }[])
    .slice()
    .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
    .map(row => ({
      id: row.id,
      amount: row.amount,
      status: row.status,
      supplierName: row.bidder_organization_name ?? null,
      createdAt: row.created_at,
    }));
}

export async function fetchCommerceAllocationOptions(organizationId: string): Promise<{
  drivers: CommerceAllocationOption[];
  vehicles: CommerceAllocationOption[];
  suppliers: CommerceAllocationOption[];
}> {
  const sb = getIdentityDb();
  const empty = { drivers: [], vehicles: [], suppliers: [] };
  if (!sb || !organizationId) return empty;

  const [driversRes, vehiclesRes, suppliersRes] = await Promise.all([
    sb.from('drivers').select('id, name').eq('organization_id', organizationId).is('left_at', null),
    // vehicles has no `number` column — the real column is vehicle_code (confirmed
    // live). The old `select('id, number')` errored on every call, so this list
    // was silently always empty.
    sb.from('vehicles').select('id, vehicle_code').eq('organization_id', organizationId).eq('type', 'owned'),
    sb.from('suppliers').select('id, name').eq('organization_id', organizationId),
  ]);

  return {
    drivers: driversRes.error ? [] : ((driversRes.data ?? []) as { id: string; name: string | null }[]).map(d => ({
      id: d.id,
      label: d.name?.trim() || d.id,
    })),
    vehicles: vehiclesRes.error ? [] : ((vehiclesRes.data ?? []) as { id: string; vehicle_code: string | null }[]).map(v => ({
      id: v.id,
      label: (v.vehicle_code || v.id).trim(),
    })),
    suppliers: suppliersRes.error ? [] : ((suppliersRes.data ?? []) as { id: string; name: string | null }[]).map(s => ({
      id: s.id,
      label: s.name?.trim() || s.id,
    })),
  };
}

export async function shareCommerceIndentForBidding(input: {
  indentId: string;
  circulationTarget: 'integrated_supplier' | 'marketplace' | 'both';
  supplierTarget: number;
}): Promise<{ error: string | null }> {
  const sb = getIdentityDb();
  if (!sb) return { error: 'Not signed in' };
  if (!Number.isFinite(input.supplierTarget) || input.supplierTarget <= 0) {
    return { error: 'Enter a supplier target rate' };
  }
  const { error } = await sb
    .from('indents')
    .update(commerceShareForBiddingPatch(input))
    .eq('id', input.indentId);
  return { error: error?.message ?? null };
}

/** Give Load shareDraftIndent + circulation. Draft → broadcast quoting freeze. */
export function commerceShareForBiddingPatch(input: {
  circulationTarget: 'integrated_supplier' | 'marketplace' | 'both';
  supplierTarget: number;
  sharedAtIso?: string;
}): Record<string, unknown> {
  return {
    circulation_target: input.circulationTarget,
    supplier_target: input.supplierTarget,
    status: 'broadcast',
    shared_at: input.sharedAtIso ?? new Date().toISOString(),
  };
}

/**
 * Asset / existing-supplier → trip. Canonical Core RPC for the indent OWNER's
 * manual award (matches Core's own indentConversionService.awardIndentToTrip).
 *
 * Not create_trip_from_assigned_indent: that RPC is the SUPPLIER's own deploy
 * call (authorizes on is_org_member(indent.assigned_supplier_id) and requires
 * assigned_supplier_id to already be set to a suppliers ORG id) — wrong caller
 * identity for Commerce/OMS, which acts as the indent owner, and wrong id type
 * for supplierId (a suppliers.id row, not an organizations id).
 */
export async function allocateCommerceIndentToTrip(input: {
  indentId: string;
  supplierId?: string | null;
  supplierRate?: number | null;
  driverId?: string | null;
  vehicleId?: string | null;
}): Promise<{ error: string | null; tripId: string | null }> {
  const sb = getIdentityDb();
  if (!sb) return { error: 'Not signed in', tripId: null };

  const { data, error } = await sb.rpc('award_indent_to_trip', {
    p_indent_id: input.indentId,
    p_supplier_id: input.supplierId ?? null,
    p_supplier_rate: input.supplierRate ?? null,
    p_driver_id: input.driverId ?? null,
    p_vehicle_id: input.vehicleId ?? null,
  });
  if (error) return { error: error.message, tripId: null };
  const row = Array.isArray(data) ? data[0] : data;
  const tripId = row && typeof row === 'object' && 'id' in row ? String((row as { id: string }).id) : null;
  return { error: null, tripId };
}

/**
 * Same indent columns as Core `updateIndent`. Refuses when a live trip exists
 * (`trips.indent_id` / `source_indent_id`). Does not add a lock column.
 */
export async function updateCommercePlanningIndent(input: {
  indentId: string;
  pickupArea?: string;
  dropLocation?: string;
  supplierTarget?: number;
  vehicleType?: string;
  loadType?: string;
  weightKg?: number;
  circulationTarget?: string | null;
}): Promise<{ error: string | null }> {
  const sb = getIdentityDb();
  if (!sb) return { error: 'Not signed in' };

  const { data: trips, error: tripErr } = await sb
    .from('trips')
    .select('id')
    .or(`indent_id.eq.${input.indentId},source_indent_id.eq.${input.indentId}`)
    .neq('status', 'cancelled')
    .limit(1);
  if (tripErr) return { error: tripErr.message };
  if (trips && trips.length > 0) {
    return { error: 'This indent is allocated. Planning fields are locked.' };
  }

  const payload: Record<string, unknown> = {};
  if (input.pickupArea !== undefined) payload.pickup_area = input.pickupArea;
  if (input.dropLocation !== undefined) payload.drop_location = input.dropLocation;
  if (input.supplierTarget !== undefined) payload.supplier_target = input.supplierTarget;
  if (input.vehicleType !== undefined) payload.vehicle_type = input.vehicleType;
  if (input.loadType !== undefined) payload.load_type = input.loadType;
  if (input.weightKg !== undefined) payload.weight = input.weightKg;
  if (input.circulationTarget !== undefined) payload.circulation_target = input.circulationTarget;

  if (Object.keys(payload).length === 0) return { error: null };

  const { error } = await sb.from('indents').update(payload).eq('id', input.indentId);
  return { error: error?.message ?? null };
}

