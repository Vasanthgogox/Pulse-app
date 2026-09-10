/**
 * Phase 2A-3: one batched clients fetch for draft preview.
 * Does not persist, allocate, or issue invoices.
 */

import { supabase } from '@/lib/supabase';

export type InvoiceDraftClientRow = {
  id: string;
  organization_id: string;
  name: string;
  legal_name: string | null;
  gstin: string | null;
  pan: string | null;
  billing_address: string | null;
  state: string | null;
  email: string | null;
};

function trimOrNull(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').replace(/\s+/g, ' ').trim();
  return trimmed ? trimmed : null;
}

/** Single `.in(id)` query scoped to the active workspace. */
export async function fetchInvoiceDraftClients(
  orgId: string,
  clientIds: string[],
): Promise<InvoiceDraftClientRow[]> {
  const ids = Array.from(new Set(clientIds.map((id) => id.trim()).filter(Boolean)));
  if (!orgId || ids.length === 0) return [];

  const { data, error } = await supabase()
    .from('clients')
    .select(
      'id, organization_id, name, legal_name, gstin, pan_number, billing_address, registered_address, state, email',
    )
    .eq('organization_id', orgId)
    .in('id', ids);

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: String(row.id),
    organization_id: String(row.organization_id),
    name: String(row.name ?? ''),
    legal_name: trimOrNull(row.legal_name),
    gstin: trimOrNull(row.gstin),
    pan: trimOrNull(row.pan_number),
    billing_address: trimOrNull(row.billing_address) ?? trimOrNull(row.registered_address),
    state: trimOrNull(row.state),
    email: trimOrNull(row.email),
  }));
}
